// ─── Vault helpers ───────────────────────────────────────────────────────────

function getDateFiles(app) {
    const { folder, format } = getDailyNotesConfig(app);
    return app.vault.getMarkdownFiles()
        .map(f => {
            const d = fileToDate(f, folder, format);
            return d ? { file: f, date: toISO(d) } : null;
        })
        .filter(Boolean);
}

async function loadAllTasks(app) {
    const map = new Map(); // dateStr(ISO) -> { file, tasks }
    for (const { file, date } of getDateFiles(app)) {
        const content = await app.vault.read(file);
        const tasks = parseTasks(content).map(t => ({ ...t, file, date }));
        map.set(date, { file, tasks });
    }
    return map;
}

async function getOrCreateDateFile(app, isoDate) {
    const cfg = getDailyNotesConfig(app);
    const date = parseISO(isoDate);
    const path = dateToPath(app, date);
    let f = app.vault.getAbstractFileByPath(path);
    if (!f) {
        await ensureFolders(app, path);
        const tpl = await readTemplate(app, cfg.template, date, cfg.format);
        f = await app.vault.create(path, tpl != null ? tpl : '');
    }
    return f;
}

// Ask before creating a day file that doesn't exist yet (guards accidental clicks)
function confirmCreate(app, isoDate) {
    return new Promise(resolve => new ConfirmModal(app, `${t('Створити нотатку на ')}${isoDate}?`, resolve).open());
}

// Open a day's note; if it doesn't exist, confirm before creating
async function openDay(app, isoDate) {
    const existing = app.vault.getAbstractFileByPath(dateToPath(app, parseISO(isoDate)));
    if (existing) {
        app.workspace.getLeaf().openFile(existing);
        return;
    }
    if (!(await confirmCreate(app, isoDate))) return;
    const f = await getOrCreateDateFile(app, isoDate);
    app.workspace.getLeaf().openFile(f);
}

class ConfirmModal extends obsidian.Modal {
    constructor(app, message, resolve) {
        super(app);
        this.message = message;
        this.resolve = resolve;
        this.decided = false;
    }
    finish(val) {
        if (this.decided) return;
        this.decided = true;
        this.resolve(val);
        this.close();
    }
    onOpen() {
        this.contentEl.createEl('p', { text: this.message });
        const btns = this.contentEl.createEl('div', { cls: 'tc-modal-btns' });
        btns.createEl('button', { text: t('Скасувати') }).onclick = () => this.finish(false);
        btns.createEl('button', { text: t('Створити'), cls: 'mod-cta' }).onclick = () => this.finish(true);
    }
    onClose() {
        this.contentEl.empty();
        this.finish(false);   // dismissed via Esc / click-outside
    }
}

function setCheckbox(line, done) {
    return line.replace(/^(\s*)- \[(x| |-)\]/, done ? '$1- [x]' : '$1- [ ]');
}

// Set a task line's status mark: 'done' → [x], 'cancelled' → [-], 'todo' → [ ]
function statusMark(status) { return status === 'done' ? 'x' : status === 'cancelled' ? '-' : ' '; }

async function setTaskStatus(app, file, lineNum, status) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[lineNum] = lines[lineNum].replace(/^(\s*)- \[(x| |-)\]/, `$1- [${statusMark(status)}]`);
    await app.vault.modify(file, lines.join('\n'));
}

async function toggleTask(app, file, lineNum, done) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[lineNum] = setCheckbox(lines[lineNum], done);
    await app.vault.modify(file, lines.join('\n'));
}

// Toggle a parent and cascade the same state to all its subtasks
async function toggleTaskCascade(app, file, task, done) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[task.line] = setCheckbox(lines[task.line], done);
    for (const s of task.subtasks) lines[s.line] = setCheckbox(lines[s.line], done);
    await app.vault.modify(file, lines.join('\n'));
}

// Recompute parent checkbox from its subtasks (all done → [x]; otherwise → [ ])
function syncParent(lines, parentLineNum) {
    let total = 0, done = 0;
    for (let i = parentLineNum + 1; i < lines.length; i++) {
        const cb = lines[i].match(/^(\s+)- \[(x| |-)\] /);
        if (cb) { if (cb[2] === '-') continue; total++; if (cb[2] === 'x') done++; continue; }
        if (lines[i].trim() === '') continue;          // blank inside block
        if (/^\s+- /.test(lines[i])) continue;         // indented comment
        break;                                          // top-level content → end of children
    }
    if (total === 0) return;
    lines[parentLineNum] = setCheckbox(lines[parentLineNum], done === total);
}

// Toggle a subtask and re-sync the parent's checkbox
async function toggleSubtask(app, file, parentLineNum, subLineNum, done) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[subLineNum] = setCheckbox(lines[subLineNum], done);
    syncParent(lines, parentLineNum);
    await app.vault.modify(file, lines.join('\n'));
}

// Insert an indented child line (subtask or comment) after the parent's existing children
async function addChild(app, file, parentTask, childLine) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    let insertAt = parentTask.line + 1;
    for (let i = parentTask.line + 1; i < lines.length; i++) {
        if (/^\s+- /.test(lines[i])) insertAt = i + 1;
        else if (lines[i].trim() === '') continue;
        else break;
    }
    lines.splice(insertAt, 0, CHILD_INDENT + childLine);
    syncParent(lines, parentTask.line);
    await app.vault.modify(file, lines.join('\n'));
}

// Rebuild a task line body from its fields (canonical order: time, text, tags, !prio, @group)
function serializeTaskBody(t) {
    const parts = [];
    if (t.start) parts.push(t.end ? `${t.start}-${t.end}` : t.start);
    if (t.text) parts.push(t.text);
    for (const tag of (t.tags || [])) parts.push(`#${tag}`);
    if (t.priority) parts.push(`!${t.priority}`);
    if (t.group) parts.push(`@${t.group}`);
    return parts.join(' ');
}

function taskMarkers(task) {
    return (task.recId ? ` ^rc-${task.recId}` : '') + (task.descId ? ` ^tcd-${task.descId}` : '');
}

// Rewrite a single task line from a (possibly edited) task object, preserving indent + block markers
async function rewriteTaskLine(app, file, lineNum, task) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const indent = (lines[lineNum].match(/^(\s*)/) || ['', ''])[1];
    const mark = task.cancelled ? '-' : task.done ? 'x' : ' ';
    lines[lineNum] = `${indent}- [${mark}] ${serializeTaskBody(task)}${taskMarkers(task)}`;
    await app.vault.modify(file, lines.join('\n'));
}

// Create / update / remove a task's free-form description (heading one level below the tasks heading)
async function setDescription(app, file, task, text, settings) {
    text = (text || '').trim();
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const level = Math.min(6, settings.headingLevel + 1);

    if (task.descId) {
        const d = findDescription(lines, task.descId);
        if (text === '') {
            if (d) lines.splice(d.headingLine, d.endLine - d.headingLine);
            lines[task.line] = lines[task.line].replace(/\s+\^tcd-[A-Za-z0-9]+/, '');
            task.descId = null;
            await app.vault.modify(file, lines.join('\n'));
            return;
        }
        if (d) {
            lines.splice(d.headingLine, d.endLine - d.headingLine, lines[d.headingLine], ...text.split('\n'));
            await app.vault.modify(file, lines.join('\n'));
            return;
        }
    }

    if (text === '') return;
    const id = task.descId || genId();
    task.descId = id;
    if (!new RegExp(`\\^tcd-${id}\\b`).test(lines[task.line])) {
        lines[task.line] = lines[task.line].replace(/\s*$/, '') + ` ^tcd-${id}`;
    }
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`${'#'.repeat(level)} ${task.text} ^tcd-${id}`, ...text.split('\n'));
    await app.vault.modify(file, lines.join('\n'));
}

// Existing tag names (from Obsidian) and group names (known to the plugin) for autocomplete
function collectTags(app) {
    const tg = (app.metadataCache.getTags && app.metadataCache.getTags()) || {};
    return Object.keys(tg).map(k => k.replace(/^#/, '')).sort();
}
async function collectGroups(app, settings) {
    const set = new Set();
    (settings.colors.groups || []).forEach(g => g.name && set.add(g.name));
    const map = await loadAllTasks(app);
    for (const { tasks } of map.values()) for (const t of tasks) if (t.group) set.add(t.group);
    return [...set].sort();
}

async function removeLine(app, file, lineNum) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines.splice(lineNum, 1);
    await app.vault.modify(file, lines.join('\n'));
}

// Remove a subtask line and re-sync its parent's checkbox
async function removeSubtask(app, file, parentLine, subLine) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines.splice(subLine, 1);
    syncParent(lines, parentLine);   // parentLine < subLine → index still valid
    await app.vault.modify(file, lines.join('\n'));
}

// Remove a top-level task together with its indented children
async function removeTaskBlock(app, file, task) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    let end = task.line + 1;
    while (end < lines.length && /^\s+- /.test(lines[end])) end++;
    lines.splice(task.line, end - task.line);
    await app.vault.modify(file, lines.join('\n'));
}

// Append default tag/group/priority (from settings) when the text doesn't already specify them
function applyDefaults(text, settings) {
    if (!settings) return text;
    let out = text;
    if (settings.defaultTag && !/#[^\s#]+/.test(out)) out += ` #${settings.defaultTag}`;
    if (settings.defaultGroup && !/@[^\s]+/.test(out)) out += ` @${settings.defaultGroup}`;
    const pAlt = priorityKeys.map(escapeRe).join('|') || 'x^';
    if (settings.defaultPriority && !new RegExp(`!(${pAlt})\\b`).test(out)) out += ` !${settings.defaultPriority}`;
    return out;
}

async function addTask(app, file, text, settings) {
    return insertBlockUnderHeading(app, file, [`- [ ] ${applyDefaults(text, settings)}`], settings);
}

async function insertLineUnderHeading(app, file, taskLine, settings) {
    return insertBlockUnderHeading(app, file, [taskLine], settings);
}

// Insert one or more lines (a task + its indented children) under the configured heading
async function insertBlockUnderHeading(app, file, blockLines, settings) {
    const level = settings.headingLevel;
    const headingText = settings.headingText;
    const headingLine = `${'#'.repeat(level)} ${headingText}`;

    const content = await app.vault.read(file);
    const lines = content.split('\n');

    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
        if (m && m[1].length === level && m[2].toLowerCase() === headingText.toLowerCase()) { idx = i; break; }
    }

    let insertedAt;
    if (idx === -1) {
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(headingLine, ...blockLines);
        insertedAt = lines.length - blockLines.length;
    } else {
        let end = lines.length;
        for (let i = idx + 1; i < lines.length; i++) {
            const m = lines[i].match(/^(#{1,6})\s+/);
            if (m && m[1].length <= level) { end = i; break; }
        }
        // after the last top-level task in the section…
        let insertAt = idx + 1;
        for (let i = idx + 1; i < end; i++) {
            if (/^\s*- \[(x| |-)\]/.test(lines[i]) && /^\S/.test(lines[i])) insertAt = i + 1;
        }
        // …and past that task's indented children
        while (insertAt < end && /^\s+- /.test(lines[insertAt])) insertAt++;
        lines.splice(insertAt, 0, ...blockLines);
        insertedAt = insertAt;
    }

    await app.vault.modify(file, lines.join('\n'));
    return insertedAt;
}

// Move a task (with its children) to another day's note, updating its time
async function moveTaskToDay(app, task, destISO, newStart, newEnd, settings) {
    const srcFile = task.file;
    const content = await app.vault.read(srcFile);
    const lines = content.split('\n');

    let end = task.line + 1;
    while (end < lines.length && /^\s+- /.test(lines[end])) end++;
    const block = lines.slice(task.line, end);

    const indent = (block[0].match(/^(\s*)/) || ['', ''])[1];
    const marker = taskMarkers(task);
    const mark = task.cancelled ? '-' : task.done ? 'x' : ' ';
    const updated = { ...task, start: newStart, end: newEnd };
    block[0] = `${indent}- [${mark}] ${serializeTaskBody(updated)}${marker}`;

    lines.splice(task.line, end - task.line);
    await app.vault.modify(srcFile, lines.join('\n'));

    const destFile = await getOrCreateDateFile(app, destISO);
    const line = await insertBlockUnderHeading(app, destFile, block, settings);
    return { file: destFile, line };
}

// ─── Task parsing ────────────────────────────────────────────────────────────

function parseTaskLine(line, lineNum) {
    const m = line.match(/^(\s*)- \[(x| |-)\] (.*)$/);
    if (!m) return null;

    const done = m[2] === 'x';
    const cancelled = m[2] === '-';
    let body = m[3];

    // trailing block ids: ^rc-<id> (recurrence rule) and ^tcd-<id> (description heading)
    let recId = null, descId = null, bm;
    while ((bm = body.match(/\s+\^(rc-[A-Za-z0-9]+|tcd-[A-Za-z0-9]+)\s*$/))) {
        const tok = bm[1];
        if (tok.startsWith('rc-')) recId = tok.slice(3);
        else descId = tok.slice(4);
        body = body.slice(0, bm.index);
    }

    // leading time → event:  "14:00 ..."  or  "14:00-15:30 ..."
    let start = null, end = null;
    let rest = body;
    const tmatch = body.match(/^(\d{1,2}:\d{2})(?:\s*-\s*(\d{1,2}:\d{2}))?\s+/);
    if (tmatch) {
        start = normTime(tmatch[1]);
        if (tmatch[2]) end = normTime(tmatch[2]);
        rest = body.slice(tmatch[0].length);
    }

    const pAlt = priorityKeys.map(escapeRe).join('|') || 'x^';
    let priority = null;
    const pm = rest.match(new RegExp(`!(${pAlt})\\b`, 'i'));
    if (pm) priority = priorityKeys.find(k => k.toLowerCase() === pm[1].toLowerCase()) || pm[1];

    let group = null;
    const gm = rest.match(/@([^\s]+)/);
    if (gm) group = gm[1];

    const tags = [];
    let tm;
    const tagRe = /#([^\s#]+)/g;
    while ((tm = tagRe.exec(rest)) !== null) tags.push(tm[1]);

    const text = rest
        .replace(new RegExp(`!(${pAlt})\\b`, 'ig'), '')
        .replace(/@[^\s]+/g, '')
        .replace(/#[^\s#]+/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return { done, cancelled, text, tags, group, priority, start, end, recId, descId, line: lineNum };
}

// Find a task's description (content under the `^tcd-<id>` heading); returns {text, headingLine, endLine}
function findDescription(lines, descId) {
    const re = new RegExp(`^(#{1,6})\\s+.*\\^tcd-${descId}\\s*$`);
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(re);
        if (!m) continue;
        const level = m[1].length;
        let end = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
            const h = lines[j].match(/^(#{1,6})\s+/);
            if (h && h[1].length <= level) { end = j; break; }
        }
        const text = lines.slice(i + 1, end).join('\n').trim();
        return { text, headingLine: i, endLine: end };
    }
    return null;
}

const CHILD_INDENT = '    ';   // indentation used for subtasks / comments

// Top-level tasks (indent 0). Indented checkbox lines → subtasks; indented bullets → comments.
function parseTasks(content) {
    const lines = content.split('\n');
    const tasks = [];
    let current = null;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const cb = line.match(/^(\s*)- \[(x| )\] (.*)$/);
        if (cb) {
            if (cb[1].length === 0) {
                current = parseTaskLine(line, i);
                current.subtasks = [];
                current.comments = [];
                tasks.push(current);
            } else if (current) {
                current.subtasks.push(parseTaskLine(line, i));
            }
            continue;
        }
        const bullet = line.match(/^(\s+)- (.*)$/);   // indented bullet, no checkbox → comment
        if (bullet && current) {
            current.comments.push({ text: bullet[2].trim(), line: i });
            continue;
        }
        if (line.trim() !== '') current = null;   // any other non-blank line ends the child block
    }
    // attach descriptions (content under each task's ^tcd- heading)
    for (const t of tasks) {
        if (!t.descId) continue;
        const d = findDescription(lines, t.descId);
        if (d) t.desc = d.text;
    }
    return tasks;
}

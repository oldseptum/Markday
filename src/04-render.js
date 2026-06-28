// ─── Shared rendering ────────────────────────────────────────────────────────

// Plain standard checkbox
function makeCheckbox(parent, checked, onChange, cls) {
    const input = parent.createEl('input', cls ? { cls } : {});
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => { if (onChange) onChange(input.checked); });
    return input;
}

function tintBadge(el, color) {
    if (!color) return;
    el.style.background = color;
    el.style.color = '#fff';
}

// Tint a calendar card (month bar / timeline event) per colorBy + optional priority dot
function applyCardColor(el, task, colorBy, priorityDot) {
    const base = cardColor(task, colorBy);
    if (base) {
        el.style.background = `color-mix(in srgb, ${base} 32%, var(--background-primary))`;
        el.style.borderLeftColor = base;
    }
    if (priorityDot && colorBy !== 'priority' && task.priority) {
        el.createEl('span', { cls: 'tc-prio-dot' }).style.background = prioColor(task.priority);
    }
}

function renderBadges(container, task, s) {
    s = s || {};
    if (task.priority && s.showPriority !== false) {
        const b = container.createEl('span', { text: task.priority, cls: 'tc-badge' });
        tintBadge(b, prioColor(task.priority));
    }
    if (task.group && s.showGroups !== false) {
        const b = container.createEl('span', { text: `@${task.group}`, cls: 'tc-badge tc-group' });
        tintBadge(b, COLORS.groups[task.group]);
    }
    if (s.showTags !== false) {
        for (const tag of task.tags) {
            const b = container.createEl('span', { text: `#${tag}`, cls: 'tc-badge tc-tag' });
            tintBadge(b, COLORS.tags[tag]);
        }
    }
}

// A flat task row. The whole card opens the editor; no inline expand (subtasks/comments live in the editor).
function renderTaskRow(app, container, task, refresh, opts = {}) {
    const s = opts.settings || {};
    const wrapper = container.createEl('div', { cls: 'tc-item' });
    const row = wrapper.createEl('div', { cls: 'tc-row' });
    if (task.priority) row.style.borderLeftColor = prioColor(task.priority);
    if (task.start) row.addClass('tc-event');
    if (task.virtual) row.addClass('tc-virtual');
    if (task.done) row.addClass('tc-row-done');

    const subs = task.subtasks || [];

    const cb = makeCheckbox(row, task.done, async checked => {
        if (task.virtual) await materializeVirtual(app, task, checked, s);
        else if (subs.length) await toggleTaskCascade(app, task.file, task, checked);
        else await toggleTask(app, task.file, task.line, checked);
        await refresh();
    }, 'tc-cb');
    cb.onclick = e => e.stopPropagation();

    const main = row.createEl('div', { cls: 'tc-row-main' });
    const top = main.createEl('div', { cls: 'tc-row-top' });
    if (task.recId) top.createEl('span', { text: '🔁', cls: 'tc-rec' });
    top.createEl('span', { text: task.text || '(порожня задача)', cls: 'tc-label' });

    if (subs.length) {
        const done = subs.filter(x => x.done).length;
        const prog = top.createEl('span', { cls: 'tc-progress' });
        prog.createEl('span', { text: `${done}/${subs.length}`, cls: 'tc-progress-num' });
        prog.createEl('span', { cls: 'tc-progress-bar' })
            .createEl('span', { cls: 'tc-progress-fill' }).style.width = `${Math.round(done / subs.length * 100)}%`;
    }
    if (opts.overdue && task.date) {
        // overdue rows: show the (red) date at the right instead of the time
        const d = parseISO(task.date);
        top.createEl('span', { text: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, cls: 'tc-date-chip tc-overdue-date' });
    } else {
        if (opts.showDate && task.date) top.createEl('span', { text: task.date, cls: 'tc-date-chip' });
        if (task.start) top.createEl('span', { text: task.end ? `${task.start}–${task.end}` : task.start, cls: 'tc-time' });
    }

    renderBadges(main.createEl('div', { cls: 'tc-badges' }), task, s);

    if (opts.showDetails && task.desc) main.createEl('div', { text: task.desc, cls: 'tc-desc-preview' });

    // whole card → editor (real tasks); virtual → materialize first
    row.addClass('tc-clickable');
    if (!task.virtual && task.file) {
        row.onclick = () => new TaskEditorModal(app, task, refresh).open();
    } else if (task.virtual) {
        row.onclick = async () => { await materializeVirtual(app, task, false, s); await refresh(); };
    }

    return wrapper;
}

// Horizontal strip of incomplete habits as emoji chips (tap → completion modal). Returns true if rendered.
function renderHabitStrip(app, container, habits, vals, iso, onDone) {
    const incomplete = habits.filter(h => !h.auto && vals[h.id] <= 0);
    if (!incomplete.length) return false;
    const strip = container.createEl('div', { cls: 'tc-smart-habits' });
    for (const h of incomplete) {
        const b = strip.createEl('button', { cls: 'tc-habit-chip' });
        if (h.color) { b.style.borderColor = h.color; b.style.color = h.color; }
        b.createSpan({ text: h.emoji || '•', cls: 'tc-habit-chip-emoji' });
        b.createSpan({ text: h.name, cls: 'tc-habit-chip-name' });
        b.onclick = () => new HabitCompleteModal(app, h, iso, onDone).open();
    }
    return true;
}

function quickAdd(app, container, dateStr, refresh, placeholder, settings) {
    const wrap = container.createEl('div', { cls: 'tc-add-row' });
    const input = wrap.createEl('input', { cls: 'tc-input' });
    input.type = 'text';
    input.placeholder = placeholder || 'Нова задача...';

    const doAdd = async () => {
        const text = input.value.trim();
        if (!text) return;
        const file = await getOrCreateDateFile(app, dateStr);
        await addTask(app, file, text, settings);
        await refresh();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    return wrap;
}

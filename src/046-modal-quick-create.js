// ─── Task / Habit creation (modals, inline composer, FAB) ─────────────────────

function newComposerDraft(date) {
    return { text: '', date: date || todayISO(), start: null, end: null, priority: null, tags: [], group: null,
             rec: { freq: 'none', interval: 1, weekdays: [] }, _tagChips: null, _groupChips: null };
}

function composeTaskRaw(d) {
    const parts = [];
    if (d.start) parts.push(d.end ? `${d.start}-${d.end}` : d.start);
    if (d.text) parts.push(d.text);
    for (const t of (d.tags || [])) parts.push(`#${t}`);
    if (d.priority) parts.push(`!${d.priority}`);
    if (d.group) parts.push(`@${d.group}`);
    return parts.join(' ');
}

function syncDraftChips(d) {
    if (d._tagChips) d.tags = d._tagChips.get();
    if (d._groupChips) d.group = d._groupChips.get()[0] || null;
}

async function createFromDraft(app, plugin, d) {
    syncDraftChips(d);
    const raw = composeTaskRaw(d);
    if (!raw.trim()) return;
    if (d.rec && d.rec.freq && d.rec.freq !== 'none') {
        const rule = { id: genId(), raw, freq: d.rec.freq, interval: Math.max(1, Number(d.rec.interval) || 1), start: d.date || todayISO(), end: null };
        if (d.rec.freq === 'weekly') rule.weekdays = d.rec.weekdays.length ? d.rec.weekdays.slice() : [(parseISO(rule.start).getDay() + 6) % 7];
        if (d.rec.freq === 'monthly') rule.monthday = parseISO(rule.start).getDate();
        plugin.settings.recurrences.push(rule);
        await plugin.saveSettings();
    } else {
        const file = await getOrCreateDateFile(app, d.date || todayISO());
        await addTask(app, file, raw, plugin.settings);
    }
}

// date + time + recurrence options
function buildScheduleFields(container, d, rerender) {
    new obsidian.Setting(container).setName(t('Дата'))
        .addText(c => { c.inputEl.type = 'date'; c.setValue(d.date || todayISO()).onChange(v => d.date = v); });
    new obsidian.Setting(container).setName(t('Час'))
        .addText(c => c.setPlaceholder('09:00').setValue(d.start || '').onChange(v => d.start = v.trim() || null))
        .addText(c => c.setPlaceholder('10:30').setValue(d.end || '').onChange(v => d.end = v.trim() || null));
    new obsidian.Setting(container).setName(t('Повторювати'))
        .addDropdown(dd => {
            dd.addOption('none', t('Без повтору')).addOption('daily', t('Щодня')).addOption('weekly', t('Щотижня')).addOption('monthly', t('Щомісяця'));
            dd.setValue(d.rec.freq).onChange(v => { d.rec.freq = v; rerender(); });
        });
    if (d.rec.freq !== 'none') {
        new obsidian.Setting(container).setName(t('Кожні N')).addText(c => c.setValue(String(d.rec.interval)).onChange(v => d.rec.interval = Math.max(1, Number(v) || 1)));
    }
    if (d.rec.freq === 'weekly') {
        const s = new obsidian.Setting(container).setName(t('Дні тижня'));
        WD_UA.forEach((w, i) => s.addButton(b => {
            b.setButtonText(w);
            if (d.rec.weekdays.includes(i)) b.setCta();
            b.onClick(() => { d.rec.weekdays = d.rec.weekdays.includes(i) ? d.rec.weekdays.filter(x => x !== i) : [...d.rec.weekdays, i]; rerender(); });
        }));
    }
}

// priority + tags + group
function buildAttrFields(container, d, tags, groups) {
    new obsidian.Setting(container).setName(t('Пріоритет'))
        .addDropdown(dd => { dd.addOption('', '—'); priorityKeys.forEach(k => dd.addOption(k, k)); dd.setValue(d.priority || '').onChange(v => d.priority = v || null); });
    new obsidian.Setting(container).setName(t('Група')).setDesc(t('Enter — додати'))
        .then(s => { d._groupChips = buildChips(s.controlEl, d.group ? [d.group] : [], groups, true, t('група')); });
    new obsidian.Setting(container).setName(t('Теги')).setDesc(t('Enter — додати'))
        .then(s => { d._tagChips = buildChips(s.controlEl, d.tags, tags, false, t('+ тег')); });
}

// Floating popover anchored to an element; closes on outside click / Esc
function openPopover(anchorEl, build) {
    const pop = document.body.createEl('div', { cls: 'tc-popover' });
    const close = () => {
        document.removeEventListener('mousedown', onDoc, true);
        document.removeEventListener('keydown', onKey, true);
        pop.remove();
    };
    const onDoc = e => { if (!pop.contains(e.target) && !anchorEl.contains(e.target)) close(); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    build(pop, close);
    const a = anchorEl.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    let left = Math.max(8, Math.min(a.right - pr.width, window.innerWidth - pr.width - 8));
    let top = a.bottom + 4;
    if (top + pr.height > window.innerHeight - 8) top = Math.max(8, a.top - pr.height - 4);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    setTimeout(() => {
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey, true);
    }, 0);
    return close;
}

// Inline composer: text field with two icons inside it; options open in popovers
function renderTaskComposer(app, plugin, container, date, onCreate) {
    const d = newComposerDraft(date);
    const field = container.createEl('div', { cls: 'tc-composer-field' });
    const input = field.createEl('input', { cls: 'tc-input tc-composer-input' });
    input.type = 'text';
    input.placeholder = t('Нова задача…');

    const create = async () => {
        d.text = input.value.trim();
        if (!d.text) return;
        await createFromDraft(app, plugin, d);
        onCreate();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') create(); });

    let tags = [], groups = [], loaded = false;
    const ensure = async () => { if (!loaded) { tags = collectTags(app); groups = await collectGroups(app, plugin.settings); loaded = true; } };
    const footer = (pop, close) => new obsidian.Setting(pop).addButton(b => b.setButtonText(t('Готово')).setCta().onClick(() => { syncDraftChips(d); close(); }));

    const icons = field.createEl('div', { cls: 'tc-composer-icons' });
    const cal = icons.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(cal, 'calendar-clock');
    cal.setAttribute('aria-label', 'Дата / час / повтор');
    cal.onclick = async () => { await ensure(); openPopover(cal, (pop, close) => { const r = () => { pop.empty(); buildScheduleFields(pop, d, r); footer(pop, close); }; r(); }); };
    const more = icons.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(more, 'sliders-horizontal');
    more.setAttribute('aria-label', 'Теги / пріоритет / група');
    more.onclick = async () => { await ensure(); syncDraftChips(d); openPopover(more, (pop, close) => { buildAttrFields(pop, d, tags, groups); footer(pop, close); }); };

    return field;
}

// Floating "+" button (mobile) that opens the full create modal
function renderFab(app, plugin, container, date) {
    const fab = container.createEl('button', { cls: 'tc-fab' });
    obsidian.setIcon(fab, 'plus');
    fab.setAttribute('aria-label', 'Нова задача');
    fab.onclick = () => new TaskCreateModal(app, plugin, date).open();
}

// Full create modal (Ctrl+P "Створити задачу" + mobile FAB) — task with optional recurrence
class TaskCreateModal extends obsidian.Modal {
    constructor(app, plugin, date) { super(app); this.plugin = plugin; this.d = newComposerDraft(date || todayISO()); }
    async onOpen() {
        this.tags = collectTags(this.app);
        this.groups = await collectGroups(this.app, this.plugin.settings);
        this.render();
    }
    render() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tc-editor', 'tc-create');
        const name = contentEl.createEl('input', { cls: 'tc-title-input' });
        name.placeholder = t('Назва задачі');
        name.value = this.d.text;
        name.addEventListener('input', () => this.d.text = name.value);
        name.addEventListener('keydown', e => { if (e.key === 'Enter') this.submit(); });
        setTimeout(() => name.focus(), 0);

        const body = contentEl.createEl('div');
        const r = () => { syncDraftChips(this.d); body.empty(); buildScheduleFields(body, this.d, r); buildAttrFields(body, this.d, this.tags, this.groups); };
        r();

        const footer = contentEl.createEl('div', { cls: 'tc-modal-btns' });
        footer.createEl('button', { text: t('Скасувати') }).onclick = () => this.close();
        footer.createEl('button', { text: t('Створити'), cls: 'mod-cta' }).onclick = () => this.submit();
    }
    async submit() {
        this.d.text = (this.contentEl.querySelector('.tc-title-input').value || '').trim();
        if (!this.d.text) { new obsidian.Notice(t('Введіть назву задачі')); return; }
        await createFromDraft(this.app, this.plugin, this.d);
        this.plugin.refreshViews();
        this.close();
    }
    onClose() { this.contentEl.empty(); }
}

// Habit create modal (Ctrl+P "Створити звичку")
class HabitCreateModal extends obsidian.Modal {
    constructor(app, plugin) { super(app); this.plugin = plugin; this.d = newHabitDraft(); }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('tc-editor');
        contentEl.createEl('h3', { text: t('Нова звичка') });
        const form = contentEl.createEl('div');
        const r = () => { form.empty(); buildHabitFields(form, this.d, r); };
        r();
        const footer = contentEl.createEl('div', { cls: 'tc-modal-btns' });
        footer.createEl('button', { text: t('Скасувати') }).onclick = () => this.close();
        footer.createEl('button', { text: t('Створити'), cls: 'mod-cta' }).onclick = async () => {
            const h = validateHabit(this.d);
            if (!h) return;
            this.plugin.settings.habits.push(h);
            await this.plugin.saveSettings();
            this.close();
        };
    }
    onClose() { this.contentEl.empty(); }
}

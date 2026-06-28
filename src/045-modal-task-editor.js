// ─── Task Editor Modal ───────────────────────────────────────────────────────

class TaskEditorModal extends obsidian.Modal {
    constructor(app, task, onClose) {
        super(app);
        this.file = task.file;
        this.line = task.line;       // parent line is stable for the modal's lifetime
        this.task = task;
        this.onCloseCb = onClose;
        this.deleted = false;
    }

    async reload() {
        const content = await this.app.vault.read(this.file);
        const found = parseTasks(content).find(t => t.line === this.line);
        this.task = found ? { ...found, file: this.file } : null;
    }

    onOpen() { this.renderAll(); }

    async renderAll() {
        await this.reload();
        if (!this.task) { this.close(); return; }

        const tags = collectTags(this.app);
        const groups = await collectGroups(this.app, this.plugin ? this.plugin.settings : { colors: { groups: [] } });

        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('tc-editor');

        // editable title (replaces the "Edit task" heading)
        const titleInput = contentEl.createEl('input', { cls: 'tc-title-input' });
        titleInput.placeholder = t('Назва задачі');
        titleInput.value = this.task.text || '';
        this.titleInput = titleInput;

        // description directly under the title — fixed size, no resize
        const descArea = contentEl.createEl('textarea', { cls: 'tc-editor-desc' });
        descArea.rows = 4;
        descArea.placeholder = t('Опис (деталі)…');
        descArea.value = this.task.desc || '';
        this.descInput = descArea;

        new obsidian.Setting(contentEl).setName(t('Задача виконана'))
            .addToggle(tg => { this.doneToggle = tg; tg.setValue(!!this.task.done); });

        new obsidian.Setting(contentEl).setName(t('Пріоритет'))
            .addDropdown(dd => {
                this.prioSel = dd;
                dd.addOption('', '—');
                priorityKeys.forEach(k => dd.addOption(k, k));
                dd.setValue(this.task.priority || '');
            });

        new obsidian.Setting(contentEl).setName(t('Час (необов.)'))
            .addText(c => { this.startInput = c.inputEl; c.setPlaceholder('09:00').setValue(this.task.start || ''); })
            .addText(c => { this.endInput = c.inputEl; c.setPlaceholder('10:30').setValue(this.task.end || ''); });

        new obsidian.Setting(contentEl).setName(t('Група')).setDesc(t('Enter — додати'))
            .then(s => { this.groupChips = buildChips(s.controlEl, this.task.group ? [this.task.group] : [], groups, true, t('група')); });

        new obsidian.Setting(contentEl).setName(t('Теги')).setDesc(t('Enter — додати'))
            .then(s => { this.tagChips = buildChips(s.controlEl, this.task.tags || [], tags, false, t('+ тег')); });

        this.subWrap = contentEl.createEl('div');
        this.renderSubtasks();

        const footer = contentEl.createEl('div', { cls: 'tc-editor-footer' });
        const trash = footer.createEl('button', { cls: 'clickable-icon tc-btn-danger' });
        obsidian.setIcon(trash, 'trash');
        trash.setAttribute('aria-label', 'Видалити задачу');
        trash.onclick = async () => {
            await removeTaskBlock(this.app, this.file, this.task);
            this.deleted = true;
            this.close();
        };

        const right = footer.createEl('div', { cls: 'tc-modal-btns' });
        right.createEl('button', { text: t('Відхилити зміни') }).onclick = () => this.close();
        right.createEl('button', { text: t('Зберегти зміни'), cls: 'mod-cta' }).onclick = async () => { await this.applyFields(); this.close(); };
    }

    get plugin() {
        return (this.app.plugins && this.app.plugins.plugins && this.app.plugins.plugins['markday'])
            || { settings: DEFAULT_SETTINGS };
    }

    renderSubtasks() {
        this.subWrap.empty();
        this.subWrap.createEl('h4', { text: t('Підзадачі') });
        for (const s of this.task.subtasks) {
            const r = this.subWrap.createEl('div', { cls: 'tc-subrow' });
            makeCheckbox(r, s.done, async checked => {
                await toggleSubtask(this.app, this.file, this.line, s.line, checked);
                await this.reload(); this.renderSubtasks();
            });
            r.createEl('span', { text: s.text || '(порожня)', cls: s.done ? 'tc-label tc-done' : 'tc-label' });
            r.createEl('span', { text: '✕', cls: 'tc-del' }).onclick = async () => {
                await removeSubtask(this.app, this.file, this.line, s.line);
                await this.reload(); this.renderSubtasks();
            };
        }
        const add = this.subWrap.createEl('div', { cls: 'tc-add-row' });
        const inp = add.createEl('input', { cls: 'tc-input' });
        inp.type = 'text';
        inp.placeholder = t('+ підзадача');
        inp.addEventListener('keydown', async e => {
            if (e.key !== 'Enter') return;
            const v = inp.value.trim();
            if (!v) return;
            await addChild(this.app, this.file, this.task, `- [ ] ${v}`);
            await this.reload(); this.renderSubtasks();
        });
    }

    async applyFields() {
        if (this.deleted || !this.task) return;
        const settings = this.plugin.settings;
        this.task.text = this.titleInput.value.trim();
        this.task.done = this.doneToggle.getValue();
        this.task.priority = this.prioSel.getValue() || null;
        const s = this.startInput.value.trim();
        const e = this.endInput.value.trim();
        this.task.start = s || null;
        this.task.end = (this.task.start && e) ? e : null;
        this.task.group = this.groupChips.get()[0] || null;
        this.task.tags = this.tagChips.get();
        await setDescription(this.app, this.file, this.task, this.descInput.value, settings);
        await rewriteTaskLine(this.app, this.file, this.line, this.task);
    }

    onClose() {
        this.contentEl.empty();
        if (this.onCloseCb) this.onCloseCb();
    }
}

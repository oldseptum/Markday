// ─── Edit modals for recurrences & habits (creation lives in quick-create) ─────

class RecurrenceEditModal extends obsidian.Modal {
    constructor(app, plugin, rule, onSave) {
        super(app);
        this.plugin = plugin;
        this.rule = rule;
        this.onSave = onSave;
        this.draft = {
            raw: rule.raw, freq: rule.freq, interval: rule.interval || 1,
            weekdays: (rule.weekdays || []).slice(), monthday: rule.monthday || '',
            start: rule.start, end: rule.end || ''
        };
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('tc-editor');
        contentEl.createEl('h3', { text: t('Редагувати регулярну задачу') });
        const form = contentEl.createEl('div');
        const r = () => { form.empty(); buildRecurrenceFields(form, this.draft, r); };
        r();
        const footer = contentEl.createEl('div', { cls: 'tc-modal-btns' });
        footer.createEl('button', { text: t('Скасувати') }).onclick = () => this.close();
        footer.createEl('button', { text: t('Зберегти'), cls: 'mod-cta' }).onclick = async () => {
            const updated = validateRecurrence(this.draft);
            if (!updated) return;
            updated.id = this.rule.id;
            const arr = this.plugin.settings.recurrences;
            const i = arr.findIndex(x => x.id === this.rule.id);
            if (i >= 0) arr[i] = updated;
            await this.plugin.saveSettings();
            this.close();
            if (this.onSave) this.onSave();
        };
    }
    onClose() { this.contentEl.empty(); }
}

class HabitEditModal extends obsidian.Modal {
    constructor(app, plugin, habit, onSave) {
        super(app);
        this.plugin = plugin;
        this.habit = habit;
        this.onSave = onSave;
        this.draft = { name: habit.name, property: habit.property, unit: habit.unit || '', type: habit.type, emoji: habit.emoji || '', color: habit.color || '#9aa0a6', goal: habit.goal || '' };
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('tc-editor');
        contentEl.createEl('h3', { text: t('Редагувати звичку') });
        const form = contentEl.createEl('div');
        const r = () => { form.empty(); buildHabitFields(form, this.draft, r); };
        r();
        const footer = contentEl.createEl('div', { cls: 'tc-modal-btns' });
        footer.createEl('button', { text: t('Скасувати') }).onclick = () => this.close();
        footer.createEl('button', { text: t('Зберегти'), cls: 'mod-cta' }).onclick = async () => {
            const updated = validateHabit(this.draft);
            if (!updated) return;
            updated.id = this.habit.id;
            const arr = this.plugin.settings.habits;
            const i = arr.findIndex(x => x.id === this.habit.id);
            if (i >= 0) arr[i] = updated;
            await this.plugin.saveSettings();
            this.close();
            if (this.onSave) this.onSave();
        };
    }
    onClose() { this.contentEl.empty(); }
}

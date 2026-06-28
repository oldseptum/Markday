// ─── Settings tab ────────────────────────────────────────────────────────────

class TaskCalendarSettingTab extends obsidian.PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h3', { text: 'Markday' });

        new obsidian.Setting(containerEl)
            .setName(t('Мова'))
            .addDropdown(d => {
                d.addOption('auto', t('Авто')).addOption('uk', 'Українська').addOption('en', 'English');
                d.setValue(this.plugin.settings.language || 'auto');
                d.onChange(async v => { this.plugin.settings.language = v; await this.plugin.saveSettings(); this.display(); });
            });

        const dn = getDailyNotesConfig(this.app);
        const loc = dn.folder ? `${dn.folder}/` : '(vault root)';
        containerEl.createEl('p', {
            text: `Daily Notes: ${loc}${dn.format}.md`,
            cls: 'setting-item-description'
        });

        new obsidian.Setting(containerEl)
            .setName(t('Рівень заголовка'))
            .setDesc(t('Під яким рівнем заголовка зберігати задачі (# = 1 … ###### = 6)'))
            .addDropdown(d => {
                for (let i = 1; i <= 6; i++) d.addOption(String(i), `${'#'.repeat(i)} (рівень ${i})`);
                d.setValue(String(this.plugin.settings.headingLevel));
                d.onChange(async v => {
                    this.plugin.settings.headingLevel = Number(v);
                    await this.plugin.saveSettings();
                });
            });

        new obsidian.Setting(containerEl)
            .setName(t('Текст заголовка'))
            .setDesc(t('Назва заголовка, під яким будуть задачі (напр. "Задачі" або "Tasks")'))
            .addText(t => {
                t.setPlaceholder('Задачі');
                t.setValue(this.plugin.settings.headingText);
                t.onChange(async v => {
                    this.plugin.settings.headingText = v.trim() || DEFAULT_SETTINGS.headingText;
                    await this.plugin.saveSettings();
                });
            });

        new obsidian.Setting(containerEl)
            .setName(t('Робочі години — початок'))
            .setDesc(t('На часовій шкалі раніші години згорнуті (можна розгорнути)'))
            .addDropdown(d => {
                for (let h = 0; h <= 23; h++) d.addOption(String(h), `${String(h).padStart(2, '0')}:00`);
                d.setValue(String(this.plugin.settings.workStart));
                d.onChange(async v => { this.plugin.settings.workStart = Number(v); await this.plugin.saveSettings(); });
            });

        new obsidian.Setting(containerEl)
            .setName(t('Робочі години — кінець'))
            .setDesc(t('На часовій шкалі пізніші години згорнуті (можна розгорнути)'))
            .addDropdown(d => {
                for (let h = 1; h <= 24; h++) d.addOption(String(h), `${String(h).padStart(2, '0')}:00`);
                d.setValue(String(this.plugin.settings.workEnd));
                d.onChange(async v => { this.plugin.settings.workEnd = Number(v); await this.plugin.saveSettings(); });
            });

        new obsidian.Setting(containerEl)
            .setName(t('Крок часової шкали'))
            .setDesc(t('Прилипання при перетягуванні/зміні розміру'))
            .addDropdown(d => {
                [5, 10, 15, 30, 60].forEach(m => d.addOption(String(m), `${m} хв`));
                d.setValue(String(this.plugin.settings.snapMinutes));
                d.onChange(async v => { this.plugin.settings.snapMinutes = Number(v); await this.plugin.saveSettings(); });
            });

        new obsidian.Setting(containerEl)
            .setName(t('Перший день тижня'))
            .addDropdown(d => {
                d.addOption('1', t('Понеділок')).addOption('0', t('Неділя'));
                d.setValue(String(this.plugin.settings.firstDayOfWeek));
                d.onChange(async v => { this.plugin.settings.firstDayOfWeek = Number(v); await this.plugin.saveSettings(); });
            });

        this.renderDefaults(containerEl);
        this.renderRecurrences(containerEl);
        this.renderHabits(containerEl);
        this.renderColors(containerEl);
    }

    renderDefaults(containerEl) {
        const s = this.plugin.settings;
        containerEl.createEl('h4', { text: t('Стандартні значення') });
        containerEl.createEl('p', { text: t('Підставляються в нову задачу, якщо не вказані вручну.'), cls: 'setting-item-description' });

        new obsidian.Setting(containerEl).setName(t('Стандартний тег'))
            .addText(c => c.setPlaceholder('—').setValue(s.defaultTag)
                .onChange(async v => { s.defaultTag = v.trim().replace(/^#/, ''); await this.plugin.saveSettings(); }));
        new obsidian.Setting(containerEl).setName(t('Стандартна група'))
            .addText(c => c.setPlaceholder('—').setValue(s.defaultGroup)
                .onChange(async v => { s.defaultGroup = v.trim().replace(/^@/, ''); await this.plugin.saveSettings(); }));
        new obsidian.Setting(containerEl).setName(t('Стандартний пріоритет'))
            .addDropdown(d => {
                d.addOption('', '—');
                priorityKeys.forEach(k => d.addOption(k, k));
                d.setValue(s.defaultPriority || '');
                d.onChange(async v => { s.defaultPriority = v; await this.plugin.saveSettings(); });
            });
    }

    renderColors(containerEl) {
        containerEl.createEl('h4', { text: t('Кольори та пріоритети') });
        const c = this.plugin.settings.colors;

        containerEl.createEl('h5', { text: t('Пріоритети') });
        containerEl.createEl('p', {
            text: t('Ключ використовується у тексті задачі як !ключ. Порядок = ранг (нижчий зверху, вищий знизу).'),
            cls: 'setting-item-description'
        });

        c.priorities.forEach((p, idx) => {
            const s = new obsidian.Setting(containerEl);
            s.addText(t => t.setPlaceholder('ключ').setValue(p.key)
                .onChange(async v => { p.key = v.trim(); await this.plugin.saveSettings(); }));
            s.addColorPicker(cp => cp.setValue(p.color || '#888888')
                .onChange(async v => { p.color = v; await this.plugin.saveSettings(); }));
            s.addExtraButton(b => b.setIcon('arrow-up').setTooltip(t('Вище')).onClick(async () => {
                if (idx > 0) {
                    [c.priorities[idx - 1], c.priorities[idx]] = [c.priorities[idx], c.priorities[idx - 1]];
                    await this.plugin.saveSettings(); this.display();
                }
            }));
            s.addExtraButton(b => b.setIcon('arrow-down').setTooltip(t('Нижче')).onClick(async () => {
                if (idx < c.priorities.length - 1) {
                    [c.priorities[idx + 1], c.priorities[idx]] = [c.priorities[idx], c.priorities[idx + 1]];
                    await this.plugin.saveSettings(); this.display();
                }
            }));
            s.addExtraButton(b => b.setIcon('trash').setTooltip(t('Видалити')).onClick(async () => {
                c.priorities.splice(idx, 1); await this.plugin.saveSettings(); this.display();
            }));
        });
        new obsidian.Setting(containerEl).addButton(b => b.setButtonText(t('+ пріоритет'))
            .onClick(async () => {
                c.priorities.push({ key: 'new', color: '#888888' });
                await this.plugin.saveSettings(); this.display();
            }));

        this.renderColorList(containerEl, t('Кольори тегів'), c.tags, '#тег (без #)');
        this.renderColorList(containerEl, t('Кольори груп'), c.groups, '@група (без @)');
    }

    renderColorList(containerEl, title, arr, placeholder) {
        containerEl.createEl('h5', { text: title });
        arr.forEach((item, idx) => {
            const s = new obsidian.Setting(containerEl);
            s.addText(t => t.setPlaceholder(placeholder).setValue(item.name)
                .onChange(async v => { item.name = v.trim(); await this.plugin.saveSettings(); }));
            s.addColorPicker(cp => cp.setValue(item.color || '#888888')
                .onChange(async v => { item.color = v; await this.plugin.saveSettings(); }));
            s.addExtraButton(b => b.setIcon('trash').setTooltip(t('Видалити')).onClick(async () => {
                arr.splice(idx, 1); await this.plugin.saveSettings(); this.display();
            }));
        });
        new obsidian.Setting(containerEl).addButton(b => b.setButtonText(t('+ додати'))
            .onClick(async () => {
                arr.push({ name: '', color: '#888888' });
                await this.plugin.saveSettings(); this.display();
            }));
    }

    renderHabits(containerEl) {
        containerEl.createEl('h4', { text: t('Звички') });
        containerEl.createEl('p', { text: t('Створення — через швидке створення (Ctrl+P). Тут — редагування та видалення.'), cls: 'setting-item-description' });

        const wc = this.plugin.settings.wordCount;
        new obsidian.Setting(containerEl)
            .setName(t('Звичка: кількість написаних слів'))
            .setDesc(t('Автоматично рахує слова в нотатці дня'))
            .addToggle(c => c.setValue(wc.enabled).onChange(async v => { wc.enabled = v; await this.plugin.saveSettings(); this.display(); }));
        if (wc.enabled) {
            new obsidian.Setting(containerEl).setName(t('— емодзі'))
                .addText(c => { c.setValue(wc.emoji || '').onChange(async v => { wc.emoji = v.trim(); await this.plugin.saveSettings(); }); c.inputEl.style.width = '3em'; });
            new obsidian.Setting(containerEl).setName(t('— колір'))
                .addColorPicker(cp => cp.setValue(wc.color || '#9aa0a6').onChange(async v => { wc.color = v; await this.plugin.saveSettings(); }));
        }

        const habits = this.plugin.settings.habits || [];
        if (!habits.length) containerEl.createEl('p', { text: t('Поки немає звичок.'), cls: 'setting-item-description' });
        for (const h of habits) {
            new obsidian.Setting(containerEl)
                .setName(h.name)
                .setDesc(`property: ${h.property} · ${h.type === 'bool' ? t('так/ні') : t('Кількість') + (h.unit ? ` (${h.unit})` : '')}`)
                .addExtraButton(b => b.setIcon('pencil').setTooltip(t('Редагувати'))
                    .onClick(() => new HabitEditModal(this.app, this.plugin, h, () => this.display()).open()))
                .addExtraButton(b => b.setIcon('trash').setTooltip(t('Видалити')).onClick(async () => {
                    this.plugin.settings.habits = habits.filter(x => x.id !== h.id);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        }
    }

    renderRecurrences(containerEl) {
        containerEl.createEl('h4', { text: t('Регулярні задачі') });
        containerEl.createEl('p', { text: t('Створення — через швидке створення (Ctrl+P). Тут — редагування та видалення.'), cls: 'setting-item-description' });
        const rules = this.plugin.settings.recurrences || [];
        if (!rules.length) containerEl.createEl('p', { text: t('Поки немає регулярних задач.'), cls: 'setting-item-description' });
        for (const rule of rules) {
            new obsidian.Setting(containerEl)
                .setName(rule.raw)
                .setDesc(`${describeRule(rule)} · з ${rule.start}${rule.end ? ` до ${rule.end}` : ''}`)
                .addExtraButton(b => b.setIcon('pencil').setTooltip(t('Редагувати'))
                    .onClick(() => new RecurrenceEditModal(this.app, this.plugin, rule, () => this.display()).open()))
                .addExtraButton(b => b.setIcon('trash').setTooltip(t('Видалити')).onClick(async () => {
                    this.plugin.settings.recurrences = rules.filter(r => r.id !== rule.id);
                    await this.plugin.saveSettings();
                    this.display();
                }));
        }
    }
}

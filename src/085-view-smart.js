// ─── Smart List View (mobile-first agenda) ────────────────────────────────────

class HabitCompleteModal extends obsidian.Modal {
    constructor(app, habit, iso, onDone) {
        super(app);
        this.habit = habit;
        this.iso = iso;
        this.onDone = onDone;
    }
    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('tc-editor');
        contentEl.createEl('h3', { text: `${this.habit.emoji ? this.habit.emoji + ' ' : ''}${this.habit.name}` });

        const done = () => { this.close(); if (this.onDone) this.onDone(); };

        if (this.habit.type === 'bool') {
            const btns = contentEl.createEl('div', { cls: 'tc-modal-btns' });
            btns.createEl('button', { text: t('Скасувати') }).onclick = () => this.close();
            btns.createEl('button', { text: t('Виконано'), cls: 'mod-cta' }).onclick = async () => {
                await setHabitValue(this.app, this.iso, this.habit, true); done();
            };
            return;
        }

        let input;
        const cur = readFrontmatter(this.app, this.iso)[this.habit.property];
        const save = async () => {
            const n = Number(input.getValue());
            await setHabitValue(this.app, this.iso, this.habit, (isNaN(n) || n <= 0) ? null : n);
            done();
        };
        new obsidian.Setting(contentEl).setName(`${t('Скільки')}${this.habit.unit ? ' (' + this.habit.unit + ')' : ''}`)
            .addText(c => {
                input = c; c.inputEl.type = 'number'; c.inputEl.style.width = '8em';
                if (cur) c.setValue(String(cur));
                c.inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
                setTimeout(() => c.inputEl.focus(), 0);
            });
        const btns = contentEl.createEl('div', { cls: 'tc-modal-btns' });
        btns.createEl('button', { text: t('Скасувати') }).onclick = () => this.close();
        btns.createEl('button', { text: t('Зберегти'), cls: 'mod-cta' }).onclick = save;
    }
    onClose() { this.contentEl.empty(); }
}

class SmartView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() { return SMART_VIEW; }
    getDisplayText() { return t('Розумний список'); }
    getIcon() { return 'list-todo'; }

    async onOpen() { await this.refresh(); }
    onResize() { const c = compactMode(this); if (c !== this._lastCompact) this.refresh(); }

    async refresh() {
        const settings = this.plugin.settings;
        const today = todayISO();
        const map = await loadAllTasks(this.app);
        addVirtuals(map, settings.recurrences, today, toISO(addDays(new Date(), 7)));

        // today's habit values (exclude auto/word-count — it's automatic)
        const habits = habitList(settings).filter(h => !h.auto);
        const hv = {};
        for (const h of habits) hv[h.id] = await getHabitValue(this.app, today, h);

        const mobile = compactMode(this);
        this._lastCompact = mobile;
        const root = this.containerEl.children[1];
        root.empty();
        root.addClass('tc-pane', 'tc-listview');
        const wrap = root.createEl('div', { cls: 'tc-smart' });
        const refresh = () => this.refresh();
        const dayTasks = iso => { const e = map.get(iso); return e ? e.tasks.slice() : []; };

        // 1 — new task: inline composer on desktop, floating + button on mobile
        if (!mobile) renderTaskComposer(this.app, this.plugin, wrap, today, refresh);
        else renderFab(this.app, this.plugin, root, today);

        // 2 — incomplete habits (horizontal emoji chips)
        renderHabitStrip(this.app, wrap, habits, hv, today, refresh);

        // 3 + 4 — today (timed sorted, then untimed under a divider)
        const tToday = dayTasks(today);
        const timedToday = tToday.filter(t => t.start).sort(dayOrder);
        const untimedToday = tToday.filter(t => !t.start);
        const todaySec = wrap.createEl('div', { cls: 'tc-smart-sec' });
        todaySec.createEl('div', { text: t('Сьогодні'), cls: 'tc-smart-h' });
        const todayList = todaySec.createEl('div', { cls: 'tc-list' });
        timedToday.forEach(t => renderTaskRow(this.app, todayList, t, refresh, { settings }));
        if (untimedToday.length) {
            if (timedToday.length) todayList.createEl('div', { cls: 'tc-smart-divider' });
            untimedToday.forEach(t => renderTaskRow(this.app, todayList, t, refresh, { settings }));
        }
        if (!timedToday.length && !untimedToday.length) todaySec.createEl('div', { text: t('Немає задач на сьогодні'), cls: 'tc-col-empty' });

        // 5 — next 7 days agenda (timed per day) + unscheduled at the end
        const agenda = wrap.createEl('div', { cls: 'tc-smart-sec' });
        agenda.createEl('div', { text: t('Наступні 7 днів'), cls: 'tc-smart-h' });
        const unscheduled = [];
        let any = false;
        for (let i = 1; i <= 7; i++) {
            const d = addDays(new Date(), i);
            const iso = toISO(d);
            const ts = dayTasks(iso);
            unscheduled.push(...ts.filter(t => !t.start));
            const timed = ts.filter(t => t.start).sort(dayOrder);
            if (!timed.length) continue;
            any = true;
            const block = agenda.createEl('div', { cls: 'tc-agenda-day' });
            block.createEl('div', { text: `${WD_UA[(d.getDay() + 6) % 7]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, cls: 'tc-agenda-date' });
            const l = block.createEl('div', { cls: 'tc-list' });
            timed.forEach(t => renderTaskRow(this.app, l, t, refresh, { settings }));
        }
        if (!any) agenda.createEl('div', { text: t('Немає запланованих задач'), cls: 'tc-col-empty' });

        if (unscheduled.length) {
            const u = wrap.createEl('div', { cls: 'tc-smart-sec' });
            u.createEl('div', { text: t('Без часу (найближче)'), cls: 'tc-smart-h' });
            const l = u.createEl('div', { cls: 'tc-list' });
            unscheduled.forEach(t => renderTaskRow(this.app, l, t, refresh, { settings, showDate: true }));
        }
    }
}

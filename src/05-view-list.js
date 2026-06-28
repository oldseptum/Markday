// ─── List View ───────────────────────────────────────────────────────────────

class ListView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.groupBy = 'date';
        this.sortBy = 'priority';
        this.hideDone = false;
        this.range = 'all';        // all | today | 7 | 30
        this.overdue = true;       // show overdue (past, undone) tasks
        this.showDetails = false;  // show a faded description preview per task
        this.showHabits = true;    // show today's habits at the top
        this.expanded = new Set();
    }

    getViewType() { return LIST_VIEW; }
    getDisplayText() { return t('Список задач'); }
    getIcon() { return 'list-checks'; }

    async onOpen() { await this.refresh(); }
    onResize() { const c = compactMode(this); if (c !== this._lastCompact) this.refresh(); }

    async refresh() {
        // 1. load data first (async) — no DOM cleared yet, so the pane never flashes empty
        const settings = this.plugin.settings;
        const map = await loadAllTasks(this.app);
        addVirtuals(map, settings.recurrences, todayISO(), toISO(addDays(new Date(), LIST_HORIZON_DAYS)));

        const todayStr = todayISO();
        const rangeEnd = this.range === 'all' ? null
            : toISO(addDays(new Date(), (this.range === 'today' ? 1 : Number(this.range)) - 1));

        let tasks = [];
        for (const { tasks: ts } of map.values()) tasks = tasks.concat(ts);
        tasks = tasks.filter(t => {
            const overdue = t.date < todayStr && !t.done;
            if (overdue) return this.overdue;                 // overdue shown only when enabled
            if (t.date < todayStr) return this.range === 'all'; // past, done → only in "all"
            return !rangeEnd || t.date <= rangeEnd;             // today / future within range
        });
        if (this.hideDone) tasks = tasks.filter(t => !t.done);

        // today's habit values (word-count needs async)
        const habits = this.showHabits ? habitList(settings) : [];
        const habitVals = {};
        for (const h of habits) habitVals[h.id] = await getHabitValue(this.app, todayStr, h);

        // 2. rebuild DOM synchronously (single repaint)
        const mobile = compactMode(this);
        this._lastCompact = mobile;
        const root = this.containerEl.children[1];
        root.empty();
        root.addClass('tc-pane', 'tc-listview');

        this.buildToolbar(root, mobile);
        if (habits.length) renderHabitStrip(this.app, root, habits, habitVals, todayStr, () => this.refresh());
        if (mobile) renderFab(this.app, this.plugin, root, todayStr);

        if (tasks.length === 0) {
            root.createEl('p', { text: t('Задач не знайдено.'), cls: 'tc-empty' });
            return;
        }

        const sortFn = this.makeSortFn();
        const refresh = () => this.refresh();

        // overdue tasks always form their own group (regardless of grouping)
        const isOverdue = t => t.date < todayStr && !t.done;
        const overdueTasks = tasks.filter(isOverdue);
        const rest = overdueTasks.length ? tasks.filter(t => !isOverdue(t)) : tasks;

        if (overdueTasks.length) {
            const sec = root.createEl('div', { cls: 'tc-group tc-overdue-group' });
            const head = sec.createEl('div', { cls: 'tc-group-head' });
            head.createEl('span', { text: t('Протерміновані'), cls: 'tc-group-title' });
            head.createEl('span', { text: String(overdueTasks.length), cls: 'tc-group-count' });
            const list = sec.createEl('div', { cls: 'tc-list' });
            overdueTasks.sort((a, b) => (a.date || '').localeCompare(b.date || '') || dayOrder(a, b))
                .forEach(t => renderTaskRow(this.app, list, t, refresh, { overdue: true, showDetails: this.showDetails, settings }));
        }

        if (this.groupBy === 'none') {
            const list = root.createEl('div', { cls: 'tc-list' });
            rest.sort(sortFn).forEach(t => renderTaskRow(this.app, list, t, refresh, { showDate: true, showDetails: this.showDetails, settings }));
            return;
        }

        const groups = this.buildGroups(rest);
        for (const [key, items] of groups) {
            const sec = root.createEl('div', { cls: 'tc-group' });
            const head = sec.createEl('div', { cls: 'tc-group-head' });
            head.createEl('span', { text: this.groupBy === 'date' ? humanDate(key) : t(key), cls: 'tc-group-title' });
            head.createEl('span', { text: String(items.length), cls: 'tc-group-count' });
            const list = sec.createEl('div', { cls: 'tc-list' });
            items.sort(sortFn).forEach(t =>
                renderTaskRow(this.app, list, t, refresh, { showDate: this.groupBy !== 'date', showDetails: this.showDetails, settings }));
        }
    }

    buildToolbar(root, mobile) {
        const bar = root.createEl('div', { cls: 'tc-toolbar' });
        this.iconBtn(bar, 'calendar', 'Період', e => this.rangeMenu(e));
        if (!mobile) renderTaskComposer(this.app, this.plugin, bar, todayISO(), () => this.refresh());
        else bar.createEl('div', { cls: 'tc-toolbar-spacer' });
        this.iconBtn(bar, 'arrow-down-up', 'Сортування та групування', e => this.sortMenu(e));
        this.iconBtn(bar, 'more-horizontal', 'Більше', e => this.moreMenu(e));
    }

    iconBtn(parent, icon, tip, onClick) {
        const b = parent.createEl('button', { cls: 'clickable-icon' });
        obsidian.setIcon(b, icon);
        b.setAttribute('aria-label', tip);
        b.onclick = onClick;
        return b;
    }

    rangeMenu(e) {
        const m = new obsidian.Menu();
        for (const [v, l] of [['all', 'Усі'], ['today', 'Сьогодні'], ['7', 'Наступні 7 днів'], ['30', 'Наступні 30 днів']]) {
            m.addItem(it => it.setTitle(t(l)).setChecked(this.range === v).onClick(() => { this.range = v; this.refresh(); }));
        }
        m.showAtMouseEvent(e);
    }

    sortMenu(e) {
        const m = new obsidian.Menu();
        m.addItem(it => it.setTitle(t('Групування')).setDisabled(true));
        for (const [v, l] of [['none', 'Без груп'], ['date', 'За датою'], ['tag', 'За тегом'], ['group', 'За групою'], ['priority', 'За пріоритетом']]) {
            m.addItem(it => it.setTitle(t(l)).setChecked(this.groupBy === v).onClick(() => { this.groupBy = v; this.refresh(); }));
        }
        m.addSeparator();
        m.addItem(it => it.setTitle(t('Сортування')).setDisabled(true));
        for (const [v, l] of [['priority', 'Пріоритет'], ['date', 'Дата'], ['time', 'Час'], ['text', 'Назва']]) {
            m.addItem(it => it.setTitle(t(l)).setChecked(this.sortBy === v).onClick(() => { this.sortBy = v; this.refresh(); }));
        }
        m.showAtMouseEvent(e);
    }

    moreMenu(e) {
        const m = new obsidian.Menu();
        m.addItem(it => it.setTitle(t('Протерміновані')).setChecked(this.overdue).onClick(() => { this.overdue = !this.overdue; this.refresh(); }));
        m.addItem(it => it.setTitle(t('Сховати виконані')).setChecked(this.hideDone).onClick(() => { this.hideDone = !this.hideDone; this.refresh(); }));
        m.addItem(it => it.setTitle(t('Показувати деталі')).setChecked(this.showDetails).onClick(() => { this.showDetails = !this.showDetails; this.refresh(); }));
        m.addItem(it => it.setTitle(t('Звички сьогодні')).setChecked(this.showHabits).onClick(() => { this.showHabits = !this.showHabits; this.refresh(); }));
        m.showAtMouseEvent(e);
    }

    makeSortFn() {
        if (this.sortBy === 'priority') {
            return (a, b) => (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0)
                || a.text.localeCompare(b.text);
        }
        if (this.sortBy === 'date') {
            return (a, b) => (a.date || '').localeCompare(b.date || '');
        }
        if (this.sortBy === 'time') {
            return (a, b) => (a.date || '').localeCompare(b.date || '') || dayOrder(a, b);
        }
        return (a, b) => a.text.localeCompare(b.text);
    }

    buildGroups(tasks) {
        const groups = new Map();
        const push = (key, t) => {
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
        };

        for (const t of tasks) {
            if (this.groupBy === 'date') push(t.date, t);
            else if (this.groupBy === 'group') push(t.group ? `@${t.group}` : 'Без групи', t);
            else if (this.groupBy === 'priority') push(t.priority ? t.priority : 'Без пріоритету', t);
            else if (this.groupBy === 'tag') {
                if (t.tags.length === 0) push('Без тегів', t);
                else t.tags.forEach(tag => push(`#${tag}`, t));
            }
        }

        const placeholder = ['Без групи', 'Без тегів', 'Без пріоритету'];
        const keys = [...groups.keys()].sort((a, b) => {
            const pa = placeholder.includes(a), pb = placeholder.includes(b);
            if (pa !== pb) return pa ? 1 : -1;
            if (this.groupBy === 'priority') {
                return (priorityRank[b] || 0) - (priorityRank[a] || 0);
            }
            return a.localeCompare(b);
        });
        return keys.map(k => [k, groups.get(k)]);
    }
}

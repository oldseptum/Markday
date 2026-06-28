// ─── Habits View (weekly tracker + heatmap statistics) ────────────────────────

function heatLevel(value, max) {
    if (value <= 0 || max <= 0) return 0;
    return Math.min(4, Math.ceil(value / max * 4));
}
function heatColor(base, lvl) {
    if (lvl === 0) return 'var(--background-modifier-border)';
    return `color-mix(in srgb, ${base} ${6 + lvl * 22}%, var(--background-secondary))`;
}

class HabitsView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.anchor = new Date();          // week shown in the tracker grid
        this.heatHabit = 'all';            // 'all' | habit id
        this.heatPeriod = 'month';         // 'month' | 'year'
        this.heatAnchor = new Date();
    }

    getViewType() { return HABITS_VIEW; }
    getDisplayText() { return t('Звички'); }
    getIcon() { return 'check-circle'; }

    async onOpen() { await this.refresh(); }
    onResize() { const c = compactMode(this); if (c !== this._lastCompact) this.refresh(); }
    shiftWeek(dir) { this.anchor = addDays(this.anchor, dir * 7); this.refresh(); }

    async refresh() {
        this._lastCompact = compactMode(this);
        const root = this.containerEl.children[1];
        root.empty();
        root.addClass('tc-pane');

        const habits = habitList(this.plugin.settings);

        const bar = root.createEl('div', { cls: 'tc-cal-header' });
        bar.createEl('div', { text: t('Звички'), cls: 'tc-cal-title' });
        const nav = bar.createEl('div', { cls: 'tc-nav-group' });
        const prev = nav.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(prev, 'chevron-left');
        prev.onclick = () => this.shiftWeek(-1);
        nav.createEl('button', { text: t('Цей тиждень') }).onclick = () => { this.anchor = new Date(); this.refresh(); };
        const next = nav.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(next, 'chevron-right');
        next.onclick = () => this.shiftWeek(1);

        if (!habits.length) {
            root.createEl('p', { text: t('Звичок ще немає. Створіть їх через Ctrl+P → Звичка.'), cls: 'tc-empty' });
            return;
        }

        await this.renderGrid(root, habits);
        root.createEl('div', { cls: 'tc-hr' });
        await this.renderHeatmap(root, habits);
    }

    habitCell(cell, habit, iso, v) {
        if (habit.auto) {
            cell.createSpan({ text: v ? String(v) : '–', cls: 'tc-habit-auto' });
        } else if (habit.type === 'bool') {
            makeCheckbox(cell, v > 0, checked => setHabitValue(this.app, iso, habit, checked ? true : null));
        } else {
            const inp = cell.createEl('input', { cls: 'tc-habit-input' });
            inp.type = 'number';
            inp.placeholder = '–';
            if (v) inp.value = String(v);
            inp.onchange = () => {
                const num = inp.value === '' ? null : Number(inp.value);
                setHabitValue(this.app, iso, habit, (num == null || isNaN(num)) ? null : num);
            };
        }
    }

    async renderGrid(root, habits) {
        const start = startOfWeek(this.anchor);
        const days = [];
        for (let i = 0; i < 7; i++) days.push(addDays(start, i));
        const todayStr = todayISO();

        // precompute values (word-count habit needs async file reads)
        const val = {};
        for (const h of habits) {
            val[h.id] = {};
            for (const d of days) val[h.id][toISO(d)] = await getHabitValue(this.app, toISO(d), h);
        }

        // compact: one card per habit with a row of 7 day cells
        if (compactMode(this)) {
            const cards = root.createEl('div', { cls: 'tc-habit-cards' });
            for (const habit of habits) {
                const card = cards.createEl('div', { cls: 'tc-habit-card' });
                const title = card.createEl('div', { cls: 'tc-habit-title' });
                if (habit.emoji) title.createSpan({ text: habit.emoji + ' ' });
                title.createSpan({ text: habit.name });
                const week = card.createEl('div', { cls: 'tc-habit-week' });
                for (const day of days) {
                    const iso = toISO(day);
                    const dc = week.createEl('div', { cls: 'tc-habit-daycell' });
                    if (iso === todayStr) dc.addClass('tc-habit-today');
                    dc.createEl('div', { text: WD_UA[(day.getDay() + 6) % 7], cls: 'tc-habit-dl' });
                    this.habitCell(dc.createEl('div', { cls: 'tc-habit-ctl' }), habit, iso, val[habit.id][iso]);
                }
            }
            return;
        }

        const table = root.createEl('div', { cls: 'tc-habits' });
        const hrow = table.createEl('div', { cls: 'tc-habit-row tc-habit-head' });
        hrow.createEl('div', { cls: 'tc-habit-name' });
        for (const day of days) {
            const c = hrow.createEl('div', { cls: 'tc-habit-cell' });
            if (toISO(day) === todayStr) c.addClass('tc-habit-today');
            c.createEl('div', { text: WD_UA[(day.getDay() + 6) % 7], cls: 'tc-col-wd' });
            c.createEl('div', { text: `${pad(day.getDate())}.${pad(day.getMonth() + 1)}`, cls: 'tc-col-date' });
        }

        for (const habit of habits) {
            const row = table.createEl('div', { cls: 'tc-habit-row' });
            const nameCell = row.createEl('div', { cls: 'tc-habit-name' });
            const title = nameCell.createEl('div', { cls: 'tc-habit-title' });
            if (habit.emoji) title.createSpan({ text: habit.emoji + ' ' });
            title.createSpan({ text: habit.name });
            nameCell.createEl('div', { text: habit.type === 'bool' ? t('так/ні') : (habit.unit || ''), cls: 'tc-habit-unit' });

            for (const day of days) {
                const iso = toISO(day);
                const cell = row.createEl('div', { cls: 'tc-habit-cell' });
                if (iso === todayStr) cell.addClass('tc-habit-today');
                this.habitCell(cell, habit, iso, val[habit.id][iso]);
            }
        }
    }

    async renderHeatmap(root, habits) {
        const settings = this.plugin.settings;
        const single = this.heatHabit !== 'all' ? habits.find(h => h.id === this.heatHabit) : null;

        // controls
        const ctrls = root.createEl('div', { cls: 'tc-heat-ctrls' });
        const habitSel = ctrls.createEl('select', { cls: 'dropdown' });
        const optAll = habitSel.createEl('option', { text: t('Усі звички') }); optAll.value = 'all';
        if (this.heatHabit === 'all') optAll.selected = true;
        for (const h of habits) {
            const o = habitSel.createEl('option', { text: (h.emoji ? h.emoji + ' ' : '') + h.name }); o.value = h.id;
            if (this.heatHabit === h.id) o.selected = true;
        }
        habitSel.onchange = () => { this.heatHabit = habitSel.value; this.refresh(); };

        const periodSel = ctrls.createEl('select', { cls: 'dropdown' });
        for (const [v, l] of [['month', 'Місяць'], ['year', 'Рік']]) {
            const o = periodSel.createEl('option', { text: t(l) }); o.value = v;
            if (this.heatPeriod === v) o.selected = true;
        }
        periodSel.onchange = () => { this.heatPeriod = periodSel.value; this.refresh(); };

        const nav = ctrls.createEl('div', { cls: 'tc-nav-group' });
        const step = dir => {
            if (this.heatPeriod === 'year') this.heatAnchor = new Date(this.heatAnchor.getFullYear() + dir, 0, 1);
            else this.heatAnchor = new Date(this.heatAnchor.getFullYear(), this.heatAnchor.getMonth() + dir, 1);
            this.refresh();
        };
        const pv = nav.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(pv, 'chevron-left'); pv.onclick = () => step(-1);
        const nx = nav.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(nx, 'chevron-right'); nx.onclick = () => step(1);

        // period range
        const y = this.heatAnchor.getFullYear();
        let from, to, title;
        if (this.heatPeriod === 'year') {
            from = new Date(y, 0, 1); to = new Date(y, 11, 31); title = String(y);
        } else {
            const m = this.heatAnchor.getMonth();
            from = new Date(y, m, 1); to = new Date(y, m + 1, 0); title = `${MONTHS_UA[m]} ${y}`;
        }
        ctrls.createEl('div', { text: title, cls: 'tc-heat-title' });

        // gather values per day
        const base = single ? (single.color || 'var(--interactive-accent)') : 'var(--interactive-accent)';
        const values = new Map();   // iso -> value
        let max = 0;
        for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
            const iso = toISO(d);
            let v;
            if (single) v = await getHabitValue(this.app, iso, single);
            else {
                v = 0;
                for (const h of habits) if ((await getHabitValue(this.app, iso, h)) > 0) v++;
            }
            values.set(iso, v);
            if (v > max) max = v;
        }
        if (!single) max = habits.length;          // "all" scales to number of habits
        max = Math.max(max, 1);

        const unit = single ? (single.unit || (single.type === 'bool' ? t('разів') : '')) : t('звичок');

        const cellFor = (iso, dim) => {
            const v = values.has(iso) ? values.get(iso) : 0;
            const cell = document.createElement('div');
            cell.className = 'tc-heat-cell' + (dim ? ' tc-heat-dim' : '');
            cell.style.background = heatColor(base, heatLevel(v, max));
            cell.title = `${iso}: ${v}${unit ? ' ' + unit : ''}`;
            return cell;
        };

        const wrap = root.createEl('div', { cls: 'tc-heat' });
        if (this.heatPeriod === 'month') {
            const grid = wrap.createEl('div', { cls: 'tc-heat-month' });
            for (const wd of weekdayHeaders()) grid.createEl('div', { text: wd, cls: 'tc-heat-wd' });
            const gridStart = startOfWeek(from);
            for (let i = 0; i < 42; i++) {
                const d = addDays(gridStart, i);
                if (d > to && d.getMonth() !== from.getMonth()) { grid.createEl('div'); continue; }
                const inMonth = d.getMonth() === from.getMonth();
                grid.appendChild(cellFor(toISO(d), !inMonth));
            }
        } else {
            const cols = wrap.createEl('div', { cls: 'tc-heat-year' });
            let d = startOfWeek(from);
            while (d <= to) {
                const col = cols.createEl('div', { cls: 'tc-heat-col' });
                for (let i = 0; i < 7; i++) {
                    const day = addDays(d, i);
                    col.appendChild(cellFor(toISO(day), day < from || day > to));
                }
                d = addDays(d, 7);
            }
        }

        if (single) this.renderStats(root, values, max, single, unit);
    }

    renderStats(root, values, max, habit, unit) {
        const isos = [...values.keys()].sort();
        let total = 0, record = 0, streak = 0, longest = 0;
        for (const iso of isos) {
            const v = values.get(iso);
            total += v;
            if (v > record) record = v;
            if (v > 0) { streak++; longest = Math.max(longest, streak); } else streak = 0;
        }
        const periodLabel = this.heatPeriod === 'year' ? t('За рік') : t('За місяць');

        const box = root.createEl('div', { cls: 'tc-stats' });
        const card = (label, value, sub) => {
            const c = box.createEl('div', { cls: 'tc-stat-card' });
            c.createEl('div', { text: label, cls: 'tc-stat-label' });
            c.createEl('div', { text: String(value), cls: 'tc-stat-value' });
            if (sub) c.createEl('div', { text: sub, cls: 'tc-stat-sub' });
        };
        card(t('Найдовша серія'), longest, t('днів підряд'));
        card(t('Рекорд за день'), record, unit);
        card(periodLabel, total.toLocaleString(), unit);
    }
}

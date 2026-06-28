// ─── Reusable creation forms (shared by settings tab & quick-create modal) ─────

// Attach a native autocomplete <datalist> to an input (suggests existing tags / groups)
function attachDatalist(inputEl, options) {
    if (!options || !options.length) return;
    const dl = document.createElement('datalist');
    dl.id = 'tcdl-' + Math.random().toString(36).slice(2, 9);
    for (const o of options) { const opt = document.createElement('option'); opt.value = o; dl.appendChild(opt); }
    inputEl.setAttribute('list', dl.id);
    inputEl.insertAdjacentElement('afterend', dl);
}

function parseTagsInput(str) {
    return (str || '').split(/[\s,]+/).map(s => s.replace(/^#/, '').trim()).filter(Boolean);
}

// Chip editor: type + Enter adds a chip (with datalist autocomplete). Returns { get: () => string[] }.
function buildChips(container, values, options, single, placeholder) {
    const state = (values || []).filter(Boolean).slice();
    const wrap = container.createEl('div', { cls: 'tc-chips' });
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tc-chip-input';
    input.placeholder = placeholder || '';

    const draw = () => {
        wrap.empty();
        for (const v of state) {
            const chip = wrap.createEl('span', { cls: 'tc-chip' });
            chip.createSpan({ text: v });
            chip.createEl('span', { text: '✕', cls: 'tc-chip-x' }).onclick = () => {
                const i = state.indexOf(v); if (i >= 0) state.splice(i, 1); draw();
            };
        }
        wrap.appendChild(input);
        attachDatalist(input, options);
        input.focus();
    };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const v = input.value.trim().replace(/^[#@]/, '');
            if (v) { if (single) state.length = 0; if (!state.includes(v)) state.push(v); }
            input.value = '';
            draw();
        } else if (e.key === 'Backspace' && !input.value && state.length) {
            state.pop(); draw();
        }
    });

    draw();
    input.blur();   // don't steal focus on initial render
    return { get: () => state.slice() };
}

function newTaskDraft() { return { text: '', date: todayISO(), tags: '', group: '' }; }
function newRecurrenceDraft() { return { raw: '', freq: 'daily', interval: 1, weekdays: [], monthday: '', start: todayISO(), end: '' }; }
function newHabitDraft() { return { name: '', property: '', unit: '', type: 'number', emoji: '', color: '#9aa0a6' }; }

// Render recurrence fields into `containerEl`. `rerender` is called when the set of
// visible fields changes (frequency / weekday toggles) so the caller can rebuild.
function buildRecurrenceFields(containerEl, d, rerender) {
    new obsidian.Setting(containerEl).setName(t('Назва'))
        .setDesc(t('Формат задачі: "14:00 Полити квіти #дім !med"'))
        .addText(c => c.setPlaceholder(t('напр. Полити квіти #дім')).setValue(d.raw).onChange(v => d.raw = v));

    new obsidian.Setting(containerEl).setName(t('Повторювати'))
        .addDropdown(dd => {
            dd.addOption('daily', t('Щодня')).addOption('weekly', t('Щотижня'))
              .addOption('monthly', t('Щомісяця')).addOption('yearly', t('Щороку'));
            dd.setValue(d.freq).onChange(v => { d.freq = v; rerender(); });
        });

    new obsidian.Setting(containerEl).setName(t('Кожні N'))
        .addText(c => c.setValue(String(d.interval)).onChange(v => d.interval = Math.max(1, Number(v) || 1)));

    if (d.freq === 'weekly') {
        const s = new obsidian.Setting(containerEl).setName(t('Дні тижня'));
        WD_UA.forEach((w, i) => s.addButton(b => {
            b.setButtonText(w);
            if (d.weekdays.includes(i)) b.setCta();
            b.onClick(() => {
                d.weekdays = d.weekdays.includes(i) ? d.weekdays.filter(x => x !== i) : [...d.weekdays, i];
                rerender();
            });
        }));
    }

    if (d.freq === 'monthly') {
        new obsidian.Setting(containerEl).setName(t('Число місяця'))
            .addText(c => c.setPlaceholder('1-31').setValue(String(d.monthday || '')).onChange(v => d.monthday = Number(v) || ''));
    }

    new obsidian.Setting(containerEl).setName(t('Початок'))
        .addText(c => { c.inputEl.type = 'date'; c.setValue(d.start).onChange(v => d.start = v); });
    new obsidian.Setting(containerEl).setName(t('Кінець (необов.)'))
        .addText(c => { c.inputEl.type = 'date'; c.setValue(d.end).onChange(v => d.end = v); });
}

function validateRecurrence(d) {
    if (!d.raw.trim()) { new obsidian.Notice(t('Введіть текст задачі')); return null; }
    if (d.freq === 'weekly' && d.weekdays.length === 0) { new obsidian.Notice(t('Оберіть хоча б один день тижня')); return null; }
    const rule = {
        id: genId(),
        raw: d.raw.trim(),
        freq: d.freq,
        interval: Math.max(1, Number(d.interval) || 1),
        start: d.start || todayISO(),
        end: d.end || null
    };
    if (d.freq === 'weekly') rule.weekdays = d.weekdays.slice();
    if (d.freq === 'monthly') rule.monthday = Number(d.monthday) || parseISO(rule.start).getDate();
    return rule;
}

function buildHabitFields(containerEl, d, rerender) {
    new obsidian.Setting(containerEl).setName(t('Назва'))
        .addText(c => c.setPlaceholder('Читання').setValue(d.name).onChange(v => d.name = v));
    new obsidian.Setting(containerEl).setName(t('Емодзі'))
        .setDesc(t('Компактна іконка звички'))
        .addText(c => { c.setPlaceholder('📖').setValue(d.emoji || ''); c.inputEl.maxLength = 4; c.inputEl.style.width = '3em'; c.onChange(v => d.emoji = v.trim()); });
    new obsidian.Setting(containerEl).setName(t('Колір'))
        .addColorPicker(cp => cp.setValue(d.color || '#9aa0a6').onChange(v => d.color = v));
    new obsidian.Setting(containerEl).setName(t('Назва property'))
        .setDesc(t('Ключ у властивостях файлу (напр. pages_read)'))
        .addText(c => c.setPlaceholder('pages_read').setValue(d.property).onChange(v => d.property = v));
    new obsidian.Setting(containerEl).setName(t('Тип виміру'))
        .addDropdown(dd => {
            dd.addOption('number', t('Кількість')).addOption('bool', t('Так / Ні'));
            dd.setValue(d.type).onChange(v => { d.type = v; rerender(); });
        });
    if (d.type === 'number') {
        new obsidian.Setting(containerEl).setName(t('Одиниці виміру'))
            .setDesc(t('напр. сторінки, км, хвилини'))
            .addText(c => c.setPlaceholder(t('сторінки')).setValue(d.unit).onChange(v => d.unit = v));
    }
}

function validateHabit(d) {
    const name = d.name.trim();
    const prop = d.property.trim();
    if (!name) { new obsidian.Notice(t('Введіть назву')); return null; }
    if (!prop) { new obsidian.Notice(t('Введіть назву property')); return null; }
    return { id: genId(), name, property: prop, type: d.type, unit: d.type === 'number' ? d.unit.trim() : '', emoji: (d.emoji || '').trim(), color: d.color || '' };
}

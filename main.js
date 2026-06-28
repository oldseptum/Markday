'use strict';

var obsidian = require('obsidian');

const LIST_VIEW   = 'md-task-calendar-list';
const CAL_VIEW    = 'md-task-calendar-cal';
const HABITS_VIEW = 'md-task-calendar-habits';
const MINI_VIEW   = 'md-task-calendar-mini';
const SMART_VIEW  = 'md-task-calendar-smart';

// Coloring config is data-driven (from settings.colors); these are updated by applyConfig()
let priorityKeys = ['low', 'med', 'high', 'urgent'];
let priorityRank = { low: 1, med: 2, high: 3, urgent: 4 };
let COLORS = { priorities: {}, tags: {}, groups: {} };
let weekStartDay = 1;   // 0 = Sunday, 1 = Monday

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ─── i18n (Ukrainian source strings → English) ─────────────────────────────────
let LANG = 'uk';
function resolveLang(settings) {
    const s = settings && settings.language;
    if (s === 'uk' || s === 'en') return s;
    const l = ((window.localStorage && window.localStorage.getItem('language')) || '').toLowerCase();
    return l.startsWith('uk') ? 'uk' : 'en';   // auto: Ukrainian app → uk, otherwise English
}
function t(s) { return LANG === 'en' ? (I18N[s] || s) : s; }

function applyConfig(settings) {
    const c = (settings && settings.colors) || {};
    priorityKeys = (c.priorities || []).map(p => p.key).filter(Boolean);
    if (!priorityKeys.length) priorityKeys = ['low', 'med', 'high', 'urgent'];
    priorityRank = {};
    priorityKeys.forEach((k, i) => priorityRank[k] = i + 1);
    COLORS = { priorities: {}, tags: {}, groups: {} };
    (c.priorities || []).forEach(p => { if (p.key) COLORS.priorities[p.key] = p.color; });
    (c.tags || []).forEach(t => { if (t.name) COLORS.tags[t.name] = t.color; });
    (c.groups || []).forEach(g => { if (g.name) COLORS.groups[g.name] = g.color; });
    weekStartDay = (settings && settings.firstDayOfWeek != null) ? settings.firstDayOfWeek : 1;
    LANG = resolveLang(settings);
    MONTHS_UA = LANG === 'en' ? MONTHS_EN : MONTHS_UK;
    MONTHS_GEN = LANG === 'en' ? MONTHS_EN : MONTHS_GEN_UK;
    WD_UA = LANG === 'en' ? WD_EN : WD_UK;
    WD_FULL = LANG === 'en' ? WD_FULL_EN : WD_FULL_UK;
}

function prioColor(key) { return COLORS.priorities[key] || '#888888'; }

// "Compact" UI = real mobile OR a narrow pane (split view, small window)
const COMPACT_WIDTH = 560;
function compactMode(view) {
    if (obsidian.Platform.isMobile) return true;
    const w = view.containerEl ? view.containerEl.clientWidth : 0;
    return w > 0 && w < COMPACT_WIDTH;
}

// Deterministic pastel for a tag/group that has no explicit color
function autoColor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360}, 60%, 72%)`;
}

// Base color used to tint a task card, per the chosen colorBy mode (or null)
function cardColor(task, colorBy) {
    if (colorBy === 'tag') { const t = task.tags && task.tags[0]; return t ? (COLORS.tags[t] || autoColor(t)) : null; }
    if (colorBy === 'group') { return task.group ? (COLORS.groups[task.group] || autoColor(task.group)) : null; }
    if (colorBy === 'none') return null;
    return task.priority ? prioColor(task.priority) : null;   // default: priority
}

const MONTHS_UK = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
                   'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const MONTHS_GEN_UK = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
                       'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
const WD_UK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const WD_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_FULL_UK = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
const WD_FULL_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// these are swapped to the EN variants by applyConfig() when the language is English
let MONTHS_UA = MONTHS_UK;
let MONTHS_GEN = MONTHS_GEN_UK;
let WD_UA = WD_UK;
let WD_FULL = WD_FULL_UK;

// Human-friendly date header, e.g. "Сьогодні · 28 червня" / "Today · 28 June"
function humanDate(iso) {
    const d = parseISO(iso);
    const dayMonth = LANG === 'en' ? `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}` : `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
    if (iso === todayISO()) return `${t('Сьогодні')} · ${dayMonth}`;
    if (iso === toISO(addDays(new Date(), 1))) return `${t('Завтра')} · ${dayMonth}`;
    if (iso === toISO(addDays(new Date(), -1))) return `${t('Вчора')} · ${dayMonth}`;
    return `${WD_FULL[(d.getDay() + 6) % 7]}, ${dayMonth}`;
}

const I18N = {
    // views / commands / ribbon
    'Розумний список': 'Smart list', 'Календар': 'Calendar', 'Список задач': 'Tasks',
    'Звички': 'Habits', 'Міні-календар': 'Mini calendar',
    'Markday — Розумний список': 'Markday — Smart list',
    'Markday — Календар': 'Markday — Calendar',
    'Markday — Список': 'Markday — Tasks',
    'Markday — Звички': 'Markday — Habits',
    'Markday — Міні-календар': 'Markday — Mini calendar',
    'Відкрити Розумний список': 'Open Smart list', 'Відкрити Календар': 'Open Calendar',
    'Відкрити Список задач': 'Open Tasks', 'Відкрити Звички': 'Open Habits',
    'Відкрити Міні-календар (бічна панель)': 'Open Mini calendar (sidebar)',
    'Відкрити/створити нотатку сьогодні': "Open/create today's note",
    'Створити задачу': 'Create task', 'Створити звичку': 'Create habit',
    // calendar
    'Місяць': 'Month', 'Перелік': 'Overview', 'Тиждень': 'Week', 'Робочий тиждень': 'Work week', '3 дні': '3 days',
    'Колір: пріоритет': 'Color: priority', 'Колір: тег': 'Color: tag', 'Колір: група': 'Color: group', 'Без кольору': 'No color',
    'Колір': 'Color', 'Сьогодні': 'Today', 'Завтра': 'Tomorrow', 'Вчора': 'Yesterday',
    'Фільтр': 'Filter', 'Режим': 'Mode', 'Відображення': 'Display', 'Назад': 'Back', 'Вперед': 'Forward',
    'Без фільтра': 'No filter', 'Теги': 'Tags', 'Групи': 'Groups', 'Пріоритети': 'Priorities',
    'Фільтр…': 'Filter…', 'Фільтр: змінити/зняти': 'Filter: change / clear',
    'Показувати теги': 'Show tags', 'Показувати групи': 'Show groups', 'Показувати пріоритети': 'Show priorities',
    'Крапка пріоритету': 'Priority dot', 'Задач немає': 'No tasks', 'Відкрити нотатку': 'Open note', 'Нотатка': 'Note',
    '+ задача': '+ task', 'весь день': 'all-day', 'Нова подія': 'New event',
    // list
    'Нова задача…': 'New task…', 'Нова задача (сьогодні)…': 'New task (today)…', 'Нова задача на сьогодні…': 'New task for today…',
    'Усі': 'All', 'Наступні 7 днів': 'Next 7 days', 'Наступні 30 днів': 'Next 30 days',
    'Без груп': 'No grouping', 'За датою': 'By date', 'За тегом': 'By tag', 'За групою': 'By group', 'За пріоритетом': 'By priority',
    'Групування': 'Grouping', 'Сортування': 'Sorting', 'Сортування та групування': 'Sort & group', 'Період': 'Period', 'Більше': 'More',
    'Пріоритет': 'Priority', 'Дата': 'Date', 'Час': 'Time', 'Назва': 'Name',
    'Протерміновані': 'Overdue', 'Сховати виконані': 'Hide done', 'Показувати деталі': 'Show details', 'Звички сьогодні': "Today's habits",
    'Задач не знайдено.': 'No tasks found.', 'Без групи': 'No group', 'Без тегів': 'No tags', 'Без пріоритету': 'No priority',
    'Наступні 7 днів': 'Next 7 days', 'Без часу (найближче)': 'No time (upcoming)', 'Немає задач на сьогодні': 'No tasks for today',
    'Немає запланованих задач': 'No scheduled tasks',
    // habits
    'Цей тиждень': 'This week', 'так/ні': 'yes/no', 'Усі звички': 'All habits', 'Рік': 'Year',
    'Звичок ще немає. Створіть їх через Ctrl+P → Звичка.': 'No habits yet. Create them via Ctrl+P → Habit.',
    'Найдовша серія': 'Longest streak', 'днів підряд': 'days in a row', 'Рекорд за день': 'Best day',
    'За місяць': 'This month', 'За рік': 'This year', 'разів': 'times', 'звичок': 'habits', 'слів': 'words', 'сторінки': 'pages',
    'Скільки': 'How much', 'Виконано': 'Done',
    // editor / create
    'Назва задачі': 'Task name', 'Опис (деталі)…': 'Description (details)…', 'Задача виконана': 'Task done',
    'Час (необов.)': 'Time (optional)', 'Група': 'Group', 'Enter — додати': 'Enter to add', 'Підзадачі': 'Subtasks',
    '+ підзадача': '+ subtask', 'Відхилити зміни': 'Discard changes', 'Зберегти зміни': 'Save changes', 'Видалити задачу': 'Delete task',
    'Дата / час / повтор': 'Date / time / repeat', 'Теги / пріоритет / група': 'Tags / priority / group',
    'Повторювати': 'Repeat', 'Без повтору': "Don't repeat", 'Щодня': 'Daily', 'Щотижня': 'Weekly', 'Щомісяця': 'Monthly', 'Щороку': 'Yearly',
    'Кожні N': 'Every N', 'Дні тижня': 'Weekdays', 'Створити': 'Create', 'Скасувати': 'Cancel', 'Готово': 'Done', 'Додати': 'Add', 'Зберегти': 'Save',
    'щодня': 'daily', 'щотижня': 'weekly', 'щомісяця': 'monthly', 'щороку': 'yearly', 'Кінець (необов.)': 'End (optional)', 'Початок': 'Start',
    'Нова звичка': 'New habit', 'Введіть назву задачі': 'Enter a task name', 'група': 'group', '+ тег': '+ tag',
    'Емодзі': 'Emoji', 'Компактна іконка звички': 'Compact habit icon', 'Назва property': 'Property name',
    'Ключ у властивостях файлу (напр. pages_read)': 'Frontmatter key (e.g. pages_read)', 'Тип виміру': 'Measure type',
    'Кількість': 'Quantity', 'Так / Ні': 'Yes / No', 'Одиниці виміру': 'Units', 'напр. сторінки, км, хвилини': 'e.g. pages, km, minutes',
    'Введіть назву': 'Enter a name', 'Введіть назву property': 'Enter a property name', 'Введіть текст задачі': 'Enter task text',
    'Оберіть хоча б один день тижня': 'Pick at least one weekday',
    // settings
    'Рівень заголовка': 'Heading level', 'Під яким рівнем заголовка зберігати задачі (# = 1 … ###### = 6)': 'Heading level to store tasks under (# = 1 … ###### = 6)',
    'Текст заголовка': 'Heading text', 'Назва заголовка, під яким будуть задачі (напр. "Задачі" або "Tasks")': 'Heading the tasks live under (e.g. "Задачі" or "Tasks")',
    'Робочі години — початок': 'Working hours — start', 'Робочі години — кінець': 'Working hours — end',
    'На часовій шкалі раніші години згорнуті (можна розгорнути)': 'Earlier hours are collapsed on the timeline (expandable)',
    'На часовій шкалі пізніші години згорнуті (можна розгорнути)': 'Later hours are collapsed on the timeline (expandable)',
    'Крок часової шкали': 'Timeline step', 'Прилипання при перетягуванні/зміні розміру': 'Snap when dragging / resizing',
    'Перший день тижня': 'First day of week', 'Понеділок': 'Monday', 'Неділя': 'Sunday', 'Мова': 'Language', 'Авто': 'Auto',
    'Стандартні значення': 'Defaults', 'Підставляються в нову задачу, якщо не вказані вручну.': 'Applied to new tasks unless set manually.',
    'Стандартний тег': 'Default tag', 'Стандартна група': 'Default group', 'Стандартний пріоритет': 'Default priority',
    'Регулярні задачі': 'Recurring tasks', 'Створення — через швидке створення (Ctrl+P). Тут — редагування та видалення.': 'Create via quick-create (Ctrl+P). Here — edit and delete.',
    'Поки немає регулярних задач.': 'No recurring tasks yet.', 'Поки немає звичок.': 'No habits yet.',
    'Редагувати': 'Edit', 'Видалити': 'Delete', 'Вище': 'Up', 'Нижче': 'Down', 'Редагувати регулярну задачу': 'Edit recurring task', 'Редагувати звичку': 'Edit habit',
    'Кольори та пріоритети': 'Colors & priorities',
    'Ключ використовується у тексті задачі як !ключ. Порядок = ранг (нижчий зверху, вищий знизу).': 'The key is used in task text as !key. Order = rank (lower on top, higher below).',
    'Кольори тегів': 'Tag colors', 'Кольори груп': 'Group colors', '+ пріоритет': '+ priority', '+ додати': '+ add',
    'Звичка: кількість написаних слів': 'Habit: words written', 'Автоматично рахує слова в нотатці дня': "Auto-counts words in the day's note",
    '— емодзі': '— emoji', '— колір': '— color', 'Текст у форматі задачі: "14:00 Полити квіти #дім !med"': 'Task-format text: "14:00 Water plants #home !med"',
    'Формат задачі: "14:00 Полити квіти #дім !med"': 'Task format: "14:00 Water plants #home !med"',
    'напр. Полити квіти #дім': 'e.g. Water plants #home', 'Число місяця': 'Day of month', 'Інтервал': 'Interval',
    'Створити нотатку на ': 'Create a note for ', 'Створити нотатку': 'Create note', 'Створити': 'Create',
    'Задачі': 'Tasks',
};

const DEFAULT_SETTINGS = {
    headingLevel: 2,
    headingText: 'Задачі',
    recurrences: [],  // [{ id, raw, freq, interval, weekdays, monthday, start, end, exceptions }]
    habits: [],       // [{ id, name, property, unit, type: 'number'|'bool' }]
    workStart: 8,     // timeline working-hours start (hour 0-23); earlier hours collapse
    workEnd: 20,      // timeline working-hours end (hour 1-24); later hours collapse
    snapMinutes: 15,  // timeline drag/resize snap step in minutes
    colorBy: 'priority',   // card coloring: priority | tag | group | none
    priorityDot: true,     // when colorBy != priority, show priority as a dot
    firstDayOfWeek: 1,     // 0 = Sunday, 1 = Monday
    language: 'auto',      // auto | uk | en
    showTags: true,        // show tag badges on cards
    showGroups: true,      // show group badges on cards
    showPriority: true,    // show priority badge/label on cards
    defaultTag: '',        // applied to new tasks when set
    defaultGroup: '',
    defaultPriority: '',
    wordCount: { enabled: false, name: 'Написано слів', emoji: '✍️', color: '#9aa0a6' },
    colors: {
        priorities: [
            { key: 'low', color: '#8b949e' },
            { key: 'med', color: '#58a6ff' },
            { key: 'high', color: '#d29922' },
            { key: 'urgent', color: '#e5534b' }
        ],
        tags: [],     // [{ name, color }]
        groups: []    // [{ name, color }]
    }
};

const LIST_HORIZON_DAYS = 60;   // how far ahead virtual recurrences are projected in the list

// ─── Date utils ──────────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseISO(s) { const [y, m, day] = s.split('-').map(Number); return new Date(y, m - 1, day); }
function todayISO() { return toISO(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) { const x = new Date(d); const off = (x.getDay() - weekStartDay + 7) % 7; x.setDate(x.getDate() - off); return x; }
function startOfWorkWeek(d) { const x = new Date(d); const off = (x.getDay() + 6) % 7; x.setDate(x.getDate() - off); return x; } // Monday
// Weekday header labels ordered from the configured first day
function weekdayHeaders() {
    const startIdx = (weekStartDay + 6) % 7;   // WD_UA index of the first column (Mon=0)
    return WD_UA.map((_, i) => WD_UA[(startIdx + i) % 7]);
}

function normTime(t) { const [h, m] = t.split(':'); return `${pad(Number(h))}:${m}`; }
function timeMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }

// Ordering within a single day: events first (by start time), then timeless tasks (file order)
function dayOrder(a, b) {
    const ae = a.start != null, be = b.start != null;
    if (ae !== be) return ae ? -1 : 1;
    if (ae && be) return timeMin(a.start) - timeMin(b.start);
    return 0;
}

function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function genId() { return Math.random().toString(36).slice(2, 8); }

// ─── Recurrence engine ───────────────────────────────────────────────────────

// Does a recurrence rule fire on the given Date?
function occursOn(rule, date) {
    const start = parseISO(rule.start);
    if (daysBetween(start, date) < 0) return false;
    if (rule.end && daysBetween(date, parseISO(rule.end)) < 0) return false;

    const interval = rule.interval || 1;
    switch (rule.freq) {
        case 'daily':
            return daysBetween(start, date) % interval === 0;
        case 'weekly': {
            const wd = (date.getDay() + 6) % 7; // 0 = Mon
            const weekdays = (rule.weekdays && rule.weekdays.length)
                ? rule.weekdays : [(start.getDay() + 6) % 7];
            if (!weekdays.includes(wd)) return false;
            const weeks = Math.floor(daysBetween(startOfWeek(start), date) / 7);
            return weeks % interval === 0;
        }
        case 'monthly': {
            const md = rule.monthday || start.getDate();
            if (date.getDate() !== md) return false;
            const months = (date.getFullYear() - start.getFullYear()) * 12
                + (date.getMonth() - start.getMonth());
            return months >= 0 && months % interval === 0;
        }
        case 'yearly': {
            if (date.getDate() !== start.getDate() || date.getMonth() !== start.getMonth()) return false;
            const years = date.getFullYear() - start.getFullYear();
            return years >= 0 && years % interval === 0;
        }
    }
    return false;
}

function describeRule(rule) {
    const i = rule.interval || 1;
    const ev = n => LANG === 'en' ? `every ${i} ${n}` : `кожні ${i} ${n}`;
    if (rule.freq === 'daily') return i === 1 ? t('щодня') : ev(LANG === 'en' ? 'days' : 'дн.');
    if (rule.freq === 'weekly') {
        const wd = (rule.weekdays || []).slice().sort().map(d => WD_UA[d]).join(', ');
        return (i === 1 ? t('щотижня') : ev(LANG === 'en' ? 'weeks' : 'тиж.')) + (wd ? ` (${wd})` : '');
    }
    if (rule.freq === 'monthly') return (i === 1 ? t('щомісяця') : ev(LANG === 'en' ? 'months' : 'міс.')) + (LANG === 'en' ? `, day ${rule.monthday || '?'}` : ` ${rule.monthday || '?'} числа`);
    if (rule.freq === 'yearly') return i === 1 ? t('щороку') : ev(LANG === 'en' ? 'years' : 'р.');
    return '';
}

// date(ISO) -> Set(recId) of recurrences already materialized as real lines that day
function buildMaterializedIndex(realMap) {
    const idx = new Map();
    for (const [date, entry] of realMap) {
        const set = new Set();
        for (const t of entry.tasks) if (t.recId) set.add(t.recId);
        idx.set(date, set);
    }
    return idx;
}

// Inject virtual recurrence instances into realMap for [startISO, endISO]
function addVirtuals(realMap, rules, startISO, endISO) {
    if (!rules || !rules.length) return realMap;
    const matIdx = buildMaterializedIndex(realMap);
    const end = parseISO(endISO);
    for (let d = parseISO(startISO); daysBetween(d, end) >= 0; d = addDays(d, 1)) {
        const iso = toISO(d);
        const matSet = matIdx.get(iso) || new Set();
        for (const rule of rules) {
            if (matSet.has(rule.id)) continue;
            if (rule.exceptions && rule.exceptions.includes(iso)) continue;
            if (!occursOn(rule, d)) continue;
            const t = parseTaskLine(`- [ ] ${rule.raw}`, -1);
            if (!t) continue;
            t.date = iso;
            t.recId = rule.id;
            t.raw = rule.raw;
            t.virtual = true;
            if (realMap.has(iso)) realMap.get(iso).tasks.push(t);
            else realMap.set(iso, { file: null, tasks: [t] });
        }
    }
    return realMap;
}

// Materialize a virtual instance into its daily note (with ^rc- marker)
async function materializeVirtual(app, task, done, settings) {
    const file = await getOrCreateDateFile(app, task.date);
    const line = `- [${done ? 'x' : ' '}] ${task.raw} ^rc-${task.recId}`;
    await insertLineUnderHeading(app, file, line, settings);
}

// ─── Habits ──────────────────────────────────────────────────────────────────

// Read a day note's frontmatter (or {} if no file)
function readFrontmatter(app, isoDate) {
    const file = app.vault.getAbstractFileByPath(dateToPath(app, parseISO(isoDate)));
    if (!file) return {};
    return (app.metadataCache.getFileCache(file) || {}).frontmatter || {};
}

// Write/clear a habit value in a day note's frontmatter (merges with existing props)
async function setHabitValue(app, isoDate, habit, value) {
    const file = await getOrCreateDateFile(app, isoDate);
    await app.fileManager.processFrontMatter(file, fm => {
        if (value === null || value === '' || value === false) delete fm[habit.property];
        else fm[habit.property] = value;
    });
}

// Count words in a day note's body (frontmatter stripped)
function countWords(content) {
    const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const m = body.match(/\S+/g);
    return m ? m.length : 0;
}

// Effective habit list = user habits (+ the built-in word-count habit when enabled)
function habitList(settings) {
    const arr = (settings.habits || []).slice();
    const wc = settings.wordCount;
    if (wc && wc.enabled) {
        arr.push({ id: '__words', name: wc.name || 'Написано слів', emoji: wc.emoji || '✍️', color: wc.color || '', unit: 'слів', type: 'number', auto: 'words' });
    }
    return arr;
}

// A habit's numeric value for a date (bool→0/1; word-count read from the file)
async function getHabitValue(app, isoDate, habit) {
    if (habit.auto === 'words') {
        const file = app.vault.getAbstractFileByPath(dateToPath(app, parseISO(isoDate)));
        if (!file) return 0;
        return countWords(await app.vault.read(file));
    }
    const v = readFrontmatter(app, isoDate)[habit.property];
    if (habit.type === 'bool') return (v === true || v === 'true') ? 1 : 0;
    return Number(v) || 0;
}

// ─── Daily Notes integration ─────────────────────────────────────────────────

function getDailyNotesConfig(app) {
    let folder = '';
    let format = 'YYYY-MM-DD';
    let template = '';
    try {
        const dn = app.internalPlugins.getPluginById('daily-notes');
        const opts = dn && dn.instance && dn.instance.options;
        if (opts) {
            if (opts.folder) folder = String(opts.folder).trim();
            if (opts.format) format = String(opts.format).trim() || 'YYYY-MM-DD';
            if (opts.template) template = String(opts.template).trim();
        }
    } catch (e) { /* daily-notes unavailable → defaults */ }
    // strip leading/trailing slashes from folder
    folder = folder.replace(/^\/+|\/+$/g, '');
    return { folder, format, template };
}

// Substitute Daily-Notes template placeholders for a given date
function applyTemplate(content, date, format) {
    const m = obsidian.moment(date);
    const now = obsidian.moment();
    return content
        .replace(/{{\s*date\s*:\s*([^}]+)}}/gi, (_, f) => m.format(f.trim()))
        .replace(/{{\s*time\s*:\s*([^}]+)}}/gi, (_, f) => now.format(f.trim()))
        .replace(/{{\s*date\s*}}/gi, m.format(format))
        .replace(/{{\s*time\s*}}/gi, now.format('HH:mm'))
        .replace(/{{\s*title\s*}}/gi, m.format(format));
}

// Read the configured Daily-Notes template and resolve it for `date`
async function readTemplate(app, templatePath, date, format) {
    if (!templatePath) return null;
    let path = templatePath.replace(/^\/+/, '');
    let f = app.vault.getAbstractFileByPath(path);
    if (!f && !/\.md$/i.test(path)) f = app.vault.getAbstractFileByPath(path + '.md');
    if (!(f instanceof obsidian.TFile)) return null;
    const raw = await app.vault.read(f);
    return applyTemplate(raw, date, format);
}

// JS Date → vault path of its daily note
function dateToPath(app, date) {
    const { folder, format } = getDailyNotesConfig(app);
    const name = obsidian.moment(date).format(format);
    const path = folder ? `${folder}/${name}.md` : `${name}.md`;
    return obsidian.normalizePath(path);
}

// TFile → JS Date (or null if it is not a daily note for the current config)
function fileToDate(file, folder, format) {
    let rel = file.path.replace(/\.md$/i, '');
    if (folder) {
        const prefix = folder + '/';
        if (!rel.startsWith(prefix)) return null;
        rel = rel.slice(prefix.length);
    }
    const m = obsidian.moment(rel, format, true); // strict parse
    return m.isValid() ? m.toDate() : null;
}

async function ensureFolders(app, filePath) {
    const parts = filePath.split('/');
    parts.pop(); // drop filename
    let cur = '';
    for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p;
        if (!app.vault.getAbstractFileByPath(cur)) {
            try { await app.vault.createFolder(cur); } catch (e) { /* race / exists */ }
        }
    }
}

// ─── Task parsing ────────────────────────────────────────────────────────────

function parseTaskLine(line, lineNum) {
    const m = line.match(/^(\s*)- \[(x| )\] (.*)$/);
    if (!m) return null;

    const done = m[2] === 'x';
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

    return { done, text, tags, group, priority, start, end, recId, descId, line: lineNum };
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

// ─── Vault helpers ───────────────────────────────────────────────────────────

function getDateFiles(app) {
    const { folder, format } = getDailyNotesConfig(app);
    return app.vault.getMarkdownFiles()
        .map(f => {
            const d = fileToDate(f, folder, format);
            return d ? { file: f, date: toISO(d) } : null;
        })
        .filter(Boolean);
}

async function loadAllTasks(app) {
    const map = new Map(); // dateStr(ISO) -> { file, tasks }
    for (const { file, date } of getDateFiles(app)) {
        const content = await app.vault.read(file);
        const tasks = parseTasks(content).map(t => ({ ...t, file, date }));
        map.set(date, { file, tasks });
    }
    return map;
}

async function getOrCreateDateFile(app, isoDate) {
    const cfg = getDailyNotesConfig(app);
    const date = parseISO(isoDate);
    const path = dateToPath(app, date);
    let f = app.vault.getAbstractFileByPath(path);
    if (!f) {
        await ensureFolders(app, path);
        const tpl = await readTemplate(app, cfg.template, date, cfg.format);
        f = await app.vault.create(path, tpl != null ? tpl : '');
    }
    return f;
}

// Ask before creating a day file that doesn't exist yet (guards accidental clicks)
function confirmCreate(app, isoDate) {
    return new Promise(resolve => new ConfirmModal(app, `${t('Створити нотатку на ')}${isoDate}?`, resolve).open());
}

// Open a day's note; if it doesn't exist, confirm before creating
async function openDay(app, isoDate) {
    const existing = app.vault.getAbstractFileByPath(dateToPath(app, parseISO(isoDate)));
    if (existing) {
        app.workspace.getLeaf().openFile(existing);
        return;
    }
    if (!(await confirmCreate(app, isoDate))) return;
    const f = await getOrCreateDateFile(app, isoDate);
    app.workspace.getLeaf().openFile(f);
}

class ConfirmModal extends obsidian.Modal {
    constructor(app, message, resolve) {
        super(app);
        this.message = message;
        this.resolve = resolve;
        this.decided = false;
    }
    finish(val) {
        if (this.decided) return;
        this.decided = true;
        this.resolve(val);
        this.close();
    }
    onOpen() {
        this.contentEl.createEl('p', { text: this.message });
        const btns = this.contentEl.createEl('div', { cls: 'tc-modal-btns' });
        btns.createEl('button', { text: t('Скасувати') }).onclick = () => this.finish(false);
        btns.createEl('button', { text: t('Створити'), cls: 'mod-cta' }).onclick = () => this.finish(true);
    }
    onClose() {
        this.contentEl.empty();
        this.finish(false);   // dismissed via Esc / click-outside
    }
}

function setCheckbox(line, done) {
    return line.replace(/^(\s*)- \[(x| )\]/, done ? '$1- [x]' : '$1- [ ]');
}

async function toggleTask(app, file, lineNum, done) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[lineNum] = setCheckbox(lines[lineNum], done);
    await app.vault.modify(file, lines.join('\n'));
}

// Toggle a parent and cascade the same state to all its subtasks
async function toggleTaskCascade(app, file, task, done) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[task.line] = setCheckbox(lines[task.line], done);
    for (const s of task.subtasks) lines[s.line] = setCheckbox(lines[s.line], done);
    await app.vault.modify(file, lines.join('\n'));
}

// Recompute parent checkbox from its subtasks (all done → [x]; otherwise → [ ])
function syncParent(lines, parentLineNum) {
    let total = 0, done = 0;
    for (let i = parentLineNum + 1; i < lines.length; i++) {
        const cb = lines[i].match(/^(\s+)- \[(x| )\] /);
        if (cb) { total++; if (cb[2] === 'x') done++; continue; }
        if (lines[i].trim() === '') continue;          // blank inside block
        if (/^\s+- /.test(lines[i])) continue;         // indented comment
        break;                                          // top-level content → end of children
    }
    if (total === 0) return;
    lines[parentLineNum] = setCheckbox(lines[parentLineNum], done === total);
}

// Toggle a subtask and re-sync the parent's checkbox
async function toggleSubtask(app, file, parentLineNum, subLineNum, done) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines[subLineNum] = setCheckbox(lines[subLineNum], done);
    syncParent(lines, parentLineNum);
    await app.vault.modify(file, lines.join('\n'));
}

// Insert an indented child line (subtask or comment) after the parent's existing children
async function addChild(app, file, parentTask, childLine) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    let insertAt = parentTask.line + 1;
    for (let i = parentTask.line + 1; i < lines.length; i++) {
        if (/^\s+- /.test(lines[i])) insertAt = i + 1;
        else if (lines[i].trim() === '') continue;
        else break;
    }
    lines.splice(insertAt, 0, CHILD_INDENT + childLine);
    syncParent(lines, parentTask.line);
    await app.vault.modify(file, lines.join('\n'));
}

// Rebuild a task line body from its fields (canonical order: time, text, tags, !prio, @group)
function serializeTaskBody(t) {
    const parts = [];
    if (t.start) parts.push(t.end ? `${t.start}-${t.end}` : t.start);
    if (t.text) parts.push(t.text);
    for (const tag of (t.tags || [])) parts.push(`#${tag}`);
    if (t.priority) parts.push(`!${t.priority}`);
    if (t.group) parts.push(`@${t.group}`);
    return parts.join(' ');
}

function taskMarkers(task) {
    return (task.recId ? ` ^rc-${task.recId}` : '') + (task.descId ? ` ^tcd-${task.descId}` : '');
}

// Rewrite a single task line from a (possibly edited) task object, preserving indent + block markers
async function rewriteTaskLine(app, file, lineNum, task) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const indent = (lines[lineNum].match(/^(\s*)/) || ['', ''])[1];
    lines[lineNum] = `${indent}- [${task.done ? 'x' : ' '}] ${serializeTaskBody(task)}${taskMarkers(task)}`;
    await app.vault.modify(file, lines.join('\n'));
}

// Create / update / remove a task's free-form description (heading one level below the tasks heading)
async function setDescription(app, file, task, text, settings) {
    text = (text || '').trim();
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const level = Math.min(6, settings.headingLevel + 1);

    if (task.descId) {
        const d = findDescription(lines, task.descId);
        if (text === '') {
            if (d) lines.splice(d.headingLine, d.endLine - d.headingLine);
            lines[task.line] = lines[task.line].replace(/\s+\^tcd-[A-Za-z0-9]+/, '');
            task.descId = null;
            await app.vault.modify(file, lines.join('\n'));
            return;
        }
        if (d) {
            lines.splice(d.headingLine, d.endLine - d.headingLine, lines[d.headingLine], ...text.split('\n'));
            await app.vault.modify(file, lines.join('\n'));
            return;
        }
    }

    if (text === '') return;
    const id = task.descId || genId();
    task.descId = id;
    if (!new RegExp(`\\^tcd-${id}\\b`).test(lines[task.line])) {
        lines[task.line] = lines[task.line].replace(/\s*$/, '') + ` ^tcd-${id}`;
    }
    if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
    lines.push(`${'#'.repeat(level)} ${task.text} ^tcd-${id}`, ...text.split('\n'));
    await app.vault.modify(file, lines.join('\n'));
}

// Existing tag names (from Obsidian) and group names (known to the plugin) for autocomplete
function collectTags(app) {
    const tg = (app.metadataCache.getTags && app.metadataCache.getTags()) || {};
    return Object.keys(tg).map(k => k.replace(/^#/, '')).sort();
}
async function collectGroups(app, settings) {
    const set = new Set();
    (settings.colors.groups || []).forEach(g => g.name && set.add(g.name));
    const map = await loadAllTasks(app);
    for (const { tasks } of map.values()) for (const t of tasks) if (t.group) set.add(t.group);
    return [...set].sort();
}

async function removeLine(app, file, lineNum) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines.splice(lineNum, 1);
    await app.vault.modify(file, lines.join('\n'));
}

// Remove a subtask line and re-sync its parent's checkbox
async function removeSubtask(app, file, parentLine, subLine) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    lines.splice(subLine, 1);
    syncParent(lines, parentLine);   // parentLine < subLine → index still valid
    await app.vault.modify(file, lines.join('\n'));
}

// Remove a top-level task together with its indented children
async function removeTaskBlock(app, file, task) {
    const content = await app.vault.read(file);
    const lines = content.split('\n');
    let end = task.line + 1;
    while (end < lines.length && /^\s+- /.test(lines[end])) end++;
    lines.splice(task.line, end - task.line);
    await app.vault.modify(file, lines.join('\n'));
}

// Append default tag/group/priority (from settings) when the text doesn't already specify them
function applyDefaults(text, settings) {
    if (!settings) return text;
    let out = text;
    if (settings.defaultTag && !/#[^\s#]+/.test(out)) out += ` #${settings.defaultTag}`;
    if (settings.defaultGroup && !/@[^\s]+/.test(out)) out += ` @${settings.defaultGroup}`;
    const pAlt = priorityKeys.map(escapeRe).join('|') || 'x^';
    if (settings.defaultPriority && !new RegExp(`!(${pAlt})\\b`).test(out)) out += ` !${settings.defaultPriority}`;
    return out;
}

async function addTask(app, file, text, settings) {
    return insertBlockUnderHeading(app, file, [`- [ ] ${applyDefaults(text, settings)}`], settings);
}

async function insertLineUnderHeading(app, file, taskLine, settings) {
    return insertBlockUnderHeading(app, file, [taskLine], settings);
}

// Insert one or more lines (a task + its indented children) under the configured heading
async function insertBlockUnderHeading(app, file, blockLines, settings) {
    const level = settings.headingLevel;
    const headingText = settings.headingText;
    const headingLine = `${'#'.repeat(level)} ${headingText}`;

    const content = await app.vault.read(file);
    const lines = content.split('\n');

    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^(#{1,6})\s+(.*?)\s*$/);
        if (m && m[1].length === level && m[2].toLowerCase() === headingText.toLowerCase()) { idx = i; break; }
    }

    if (idx === -1) {
        if (lines.length && lines[lines.length - 1].trim() !== '') lines.push('');
        lines.push(headingLine, ...blockLines);
    } else {
        let end = lines.length;
        for (let i = idx + 1; i < lines.length; i++) {
            const m = lines[i].match(/^(#{1,6})\s+/);
            if (m && m[1].length <= level) { end = i; break; }
        }
        // after the last top-level task in the section…
        let insertAt = idx + 1;
        for (let i = idx + 1; i < end; i++) {
            if (/^\s*- \[(x| )\]/.test(lines[i]) && /^\S/.test(lines[i])) insertAt = i + 1;
        }
        // …and past that task's indented children
        while (insertAt < end && /^\s+- /.test(lines[insertAt])) insertAt++;
        lines.splice(insertAt, 0, ...blockLines);
    }

    await app.vault.modify(file, lines.join('\n'));
}

// Move a task (with its children) to another day's note, updating its time
async function moveTaskToDay(app, task, destISO, newStart, newEnd, settings) {
    const srcFile = task.file;
    const content = await app.vault.read(srcFile);
    const lines = content.split('\n');

    let end = task.line + 1;
    while (end < lines.length && /^\s+- /.test(lines[end])) end++;
    const block = lines.slice(task.line, end);

    const indent = (block[0].match(/^(\s*)/) || ['', ''])[1];
    const marker = taskMarkers(task);
    const updated = { ...task, start: newStart, end: newEnd };
    block[0] = `${indent}- [${task.done ? 'x' : ' '}] ${serializeTaskBody(updated)}${marker}`;

    lines.splice(task.line, end - task.line);
    await app.vault.modify(srcFile, lines.join('\n'));

    const destFile = await getOrCreateDateFile(app, destISO);
    await insertBlockUnderHeading(app, destFile, block, settings);
}

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
        this.draft = { name: habit.name, property: habit.property, unit: habit.unit || '', type: habit.type, emoji: habit.emoji || '', color: habit.color || '#9aa0a6' };
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

// ─── Timeline grid (week / 3-day) with drag-move, resize & cross-day move ──────

const HOUR_PX = 50;                                   // pixels per hour
let _tlDragTask = null;                               // untimed task being dragged from the all-day row

function minToHHMM(min) { return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`; }
function snapStep(min, step) { return Math.round(min / step) * step; }
function clampMin(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function renderTimeline(view, root, n) {
    const app = view.app;
    const settings = view.plugin.settings;
    const refresh = () => view.refresh();
    const map = view._map;
    const workStart = settings.workStart ?? 8;
    const workEnd = settings.workEnd ?? 20;
    const step = settings.snapMinutes || 15;
    const start = view.rangeStartDate();
    const todayStr = todayISO();

    const days = [];
    let minStart = Infinity, maxEnd = -Infinity;
    for (let i = 0; i < n; i++) {
        const day = addDays(start, i);
        const iso = toISO(day);
        const entry = map.get(iso);
        const tasks = entry ? entry.tasks.slice() : [];
        for (const t of tasks) {
            if (!t.start) continue;
            const s = timeMin(t.start);
            const e = t.end ? timeMin(t.end) : s + 60;
            if (s < minStart) minStart = s;
            if (e > maxEnd) maxEnd = e;
        }
        days.push({ day, iso, tasks });
    }

    // start from working hours, auto-FIT to tasks that fall outside, then honour manual expand
    let rangeStart = workStart;
    let rangeEnd = workEnd;
    if (minStart !== Infinity && minStart < rangeStart * 60) rangeStart = Math.floor(minStart / 60);
    if (maxEnd !== -Infinity && maxEnd > rangeEnd * 60) rangeEnd = Math.ceil(maxEnd / 60);
    if (view.showEarly) rangeStart = 0;
    if (view.showLate) rangeEnd = 24;
    rangeStart = Math.max(0, Math.min(rangeStart, workStart));
    rangeEnd = Math.min(24, Math.max(rangeEnd, workEnd));
    if (rangeStart >= rangeEnd) { rangeStart = 0; rangeEnd = 24; }
    const rangeStartMin = rangeStart * 60;
    const rangeEndMin = rangeEnd * 60;
    const gridH = (rangeEnd - rangeStart) * HOUR_PX;
    const ctx = { rangeStartMin, rangeEndMin, step, refresh, colorBy: settings.colorBy, priorityDot: settings.priorityDot };

    const wrap = root.createEl('div', { cls: 'tc-tl' });
    wrap.style.setProperty('--tc-col-count', String(n));

    const header = wrap.createEl('div', { cls: 'tc-tl-header' });
    header.createEl('div', { cls: 'tc-tl-corner' });
    for (const d of days) {
        const h = header.createEl('div', { cls: 'tc-tl-dayhead' });
        if (d.iso === todayStr) h.addClass('tc-col-today');
        h.createEl('span', { text: WD_UA[(d.day.getDay() + 6) % 7], cls: 'tc-col-wd' });
        h.createEl('span', { text: `${pad(d.day.getDate())}.${pad(d.day.getMonth() + 1)}`, cls: 'tc-col-date' });
    }

    // all-day row (untimed tasks) — add button on top, then draggable task chips
    const allday = wrap.createEl('div', { cls: 'tc-tl-allday' });
    allday.createEl('div', { cls: 'tc-tl-axislabel', text: t('весь день') });
    for (const d of days) {
        const cell = allday.createEl('div', { cls: 'tc-tl-alldaycell' });
        quickAdd(app, cell, d.iso, refresh, t('+ задача'), settings);
        d.tasks.filter(t => !t.start).sort(dayOrder).forEach(t => {
            const w = renderTaskRow(app, cell, t, refresh, { settings });
            if (!t.virtual && t.file) {
                w.setAttribute('draggable', 'true');
                w.addEventListener('dragstart', e => { _tlDragTask = t; e.dataTransfer.effectAllowed = 'move'; });
                w.addEventListener('dragend', () => { _tlDragTask = null; });
            }
        });
    }

    if (rangeStart > 0) {
        const s = wrap.createEl('div', { cls: 'tc-tl-strip' });
        s.createEl('span', { text: `▾ 00:00 – ${pad(rangeStart)}:00` });
        s.onclick = () => { view.showEarly = true; refresh(); };
    }

    const grid = wrap.createEl('div', { cls: 'tc-tl-grid' });
    grid.style.height = `${gridH}px`;

    const axis = grid.createEl('div', { cls: 'tc-tl-axis' });
    for (let h = rangeStart; h < rangeEnd; h++) {
        const hr = axis.createEl('div', { cls: 'tc-tl-hour' });
        hr.style.height = `${HOUR_PX}px`;
        hr.createEl('span', { text: `${pad(h)}:00` });
    }

    view._tlCols = [];
    for (const d of days) {
        const col = grid.createEl('div', { cls: 'tc-tl-col' });
        if (d.iso === todayStr) col.addClass('tc-col-today');
        view._tlCols.push({ iso: d.iso, el: col });

        for (let h = rangeStart; h < rangeEnd; h++) {
            col.createEl('div', { cls: 'tc-tl-hourline' }).style.height = `${HOUR_PX}px`;
        }

        const dIso = d.iso;
        bindGridCreate(col, dIso, ctx, view);
        // drop target for untimed tasks dragged from the all-day row
        col.addEventListener('dragover', e => { if (_tlDragTask) { e.preventDefault(); col.addClass('tc-tl-col-drop'); } });
        col.addEventListener('dragleave', () => col.removeClass('tc-tl-col-drop'));
        col.addEventListener('drop', async e => {
            e.preventDefault();
            col.removeClass('tc-tl-col-drop');
            const t = _tlDragTask;
            _tlDragTask = null;
            if (!t) return;
            const y = e.clientY - col.getBoundingClientRect().top;
            const min = clampMin(snapStep(rangeStartMin + y / HOUR_PX * 60, step), rangeStartMin, rangeEndMin - step);
            if (t.date === dIso) {
                t.start = minToHHMM(min); t.end = null;
                await rewriteTaskLine(app, t.file, t.line, t);
            } else {
                await moveTaskToDay(app, t, dIso, minToHHMM(min), null, settings);
            }
            refresh();
        });

        const evs = d.tasks.filter(t => t.start).map(t => ({
            t, sm: timeMin(t.start), em: t.end ? timeMin(t.end) : timeMin(t.start) + 60
        }));
        assignColumns(evs);
        for (const ev of evs) renderEventCard(view, col, ev.t, ctx, ev);
    }

    if (rangeEnd < 24) {
        const s = wrap.createEl('div', { cls: 'tc-tl-strip' });
        s.createEl('span', { text: `▴ ${pad(rangeEnd)}:00 – 24:00` });
        s.onclick = () => { view.showLate = true; refresh(); };
    }
}

// Lay out time-overlapping events into side-by-side columns (mutates items: .col/.cols)
function assignColumns(items) {
    items.sort((a, b) => a.sm - b.sm || a.em - b.em);
    let i = 0;
    while (i < items.length) {
        let j = i + 1;
        let clusterEnd = items[i].em;
        const cluster = [items[i]];
        while (j < items.length && items[j].sm < clusterEnd) {
            cluster.push(items[j]);
            clusterEnd = Math.max(clusterEnd, items[j].em);
            j++;
        }
        const colEnds = [];
        for (const ev of cluster) {
            let placed = false;
            for (let c = 0; c < colEnds.length; c++) {
                if (ev.sm >= colEnds[c]) { ev.col = c; colEnds[c] = ev.em; placed = true; break; }
            }
            if (!placed) { ev.col = colEnds.length; colEnds.push(ev.em); }
        }
        for (const ev of cluster) ev.cols = colEnds.length;
        i = j;
    }
}

// Click empty grid → create at that time; click-drag → create with a time range. Opens editor after.
function bindGridCreate(col, dIso, ctx, view) {
    col.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (e.target !== col && !e.target.classList.contains('tc-tl-hourline')) return;
        e.preventDefault();
        const rect = col.getBoundingClientRect();
        const startMin0 = ctx.rangeStartMin + (e.clientY - rect.top) / HOUR_PX * 60;
        const preview = col.createEl('div', { cls: 'tc-tl-event tc-tl-preview' });
        let moved = false, a = startMin0, b = startMin0;
        const paint = () => {
            const lo = Math.min(a, b), hi = Math.max(a, b);
            preview.style.top = `${(lo - ctx.rangeStartMin) / 60 * HOUR_PX}px`;
            preview.style.height = `${Math.max((hi - lo) / 60 * HOUR_PX, 6)}px`;
        };
        paint();
        const onMove = ev => {
            b = ctx.rangeStartMin + (ev.clientY - rect.top) / HOUR_PX * 60;
            if (Math.abs(b - startMin0) > 4) moved = true;
            paint();
        };
        const onUp = async () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            preview.remove();
            let lo = clampMin(snapStep(Math.min(a, b), ctx.step), ctx.rangeStartMin, ctx.rangeEndMin - ctx.step);
            let hi = moved ? clampMin(snapStep(Math.max(a, b), ctx.step), lo + ctx.step, ctx.rangeEndMin) : lo + 60;
            hi = clampMin(hi, lo + ctx.step, ctx.rangeEndMin);
            const evName = t('Нова подія');
            const file = await getOrCreateDateFile(view.app, dIso);
            await addTask(view.app, file, `${minToHHMM(lo)}-${minToHHMM(hi)} ${evName}`, view.plugin.settings);
            const entry = (await loadAllTasks(view.app)).get(dIso);
            const created = entry && entry.tasks.find(x => x.start === minToHHMM(lo) && x.text === evName);
            if (created) new TaskEditorModal(view.app, created, () => view.refresh()).open();
            else view.refresh();
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    });
}

function renderEventCard(view, col, task, ctx, layout) {
    const app = view.app;
    const sm = timeMin(task.start);
    const em = task.end ? timeMin(task.end) : sm + 60;
    const pxPerMin = HOUR_PX / 60;

    const card = col.createEl('div', { cls: 'tc-tl-event' });
    card.style.top = `${(sm - ctx.rangeStartMin) * pxPerMin}px`;
    card.style.height = `${Math.max((em - sm) * pxPerMin, 30)}px`;
    if (layout && layout.cols > 1) {
        card.style.left = `calc(${(layout.col / layout.cols * 100).toFixed(4)}% + 1px)`;
        card.style.width = `calc(${(100 / layout.cols).toFixed(4)}% - 2px)`;
        card.style.right = 'auto';
    }
    applyCardColor(card, task, ctx.colorBy, ctx.priorityDot);
    if (task.virtual) card.addClass('tc-virtual');   // dashed only for not-yet-materialized recurrences
    if (task.done) card.addClass('tc-tl-done');

    // checkbox (timed tasks)
    const cb = makeCheckbox(card, task.done, async checked => {
        if (task.virtual) await materializeVirtual(app, task, checked, view.plugin.settings);
        else await toggleTask(app, task.file, task.line, checked);
        ctx.refresh();
    }, 'tc-tl-cb');
    cb.addEventListener('pointerdown', e => e.stopPropagation());
    cb.addEventListener('click', e => e.stopPropagation());

    const body = card.createEl('div', { cls: 'tc-tl-event-body' });
    body.createEl('div', { cls: 'tc-tl-event-title', text: task.text || '(без назви)' });
    card._timeEl = body.createEl('div', {
        cls: 'tc-tl-event-time',
        text: task.end ? `${task.start}–${task.end}` : task.start
    });

    if (task.virtual || !task.file) {
        card.addClass('tc-tl-event-virtual');
        card.onclick = async () => { await materializeVirtual(app, task, false, view.plugin.settings); ctx.refresh(); };
        return;
    }

    const topH = card.createEl('div', { cls: 'tc-tl-handle tc-tl-handle-top' });
    const botH = card.createEl('div', { cls: 'tc-tl-handle tc-tl-handle-bottom' });
    bindTimelineDrag(card, card, task, view, ctx, 'move');
    bindTimelineDrag(topH, card, task, view, ctx, 'resize-top');
    bindTimelineDrag(botH, card, task, view, ctx, 'resize-bottom');
}

function bindTimelineDrag(handleEl, card, task, view, ctx, mode) {
    const pxPerMin = HOUR_PX / 60;
    handleEl.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const startY = e.clientY;
        const origStart = timeMin(task.start);
        const origEnd = task.end ? timeMin(task.end) : origStart + 60;
        const hadEnd = task.end != null;
        const dur = origEnd - origStart;
        let moved = false;
        let ns = origStart, ne = origEnd;
        let targetIso = task.date;

        const paint = () => {
            card.style.top = `${(ns - ctx.rangeStartMin) * pxPerMin}px`;
            card.style.height = `${Math.max((ne - ns) * pxPerMin, 30)}px`;
            if (card._timeEl) {
                const showEnd = mode !== 'move' || hadEnd;
                card._timeEl.textContent = showEnd ? `${minToHHMM(ns)}–${minToHHMM(ne)}` : minToHHMM(ns);
            }
        };

        const onMove = ev => {
            if (Math.abs(ev.clientY - startY) > 3) moved = true;
            const d = snapStep((ev.clientY - startY) / pxPerMin, ctx.step);
            if (mode === 'move') { ns = clampMin(origStart + d, ctx.rangeStartMin, ctx.rangeEndMin - dur); ne = ns + dur; }
            else if (mode === 'resize-top') { ns = clampMin(origStart + d, ctx.rangeStartMin, origEnd - ctx.step); ne = origEnd; }
            else { ne = clampMin(origEnd + d, origStart + ctx.step, ctx.rangeEndMin); ns = origStart; }

            // horizontal: move across day columns (move mode only)
            if (mode === 'move' && view._tlCols) {
                for (const c of view._tlCols) {
                    const r = c.el.getBoundingClientRect();
                    if (ev.clientX >= r.left && ev.clientX < r.right) {
                        if (c.iso !== targetIso) { targetIso = c.iso; c.el.appendChild(card); moved = true; }
                        break;
                    }
                }
            }
            paint();
        };

        const onUp = async () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (!moved) {
                if (mode === 'move') new TaskEditorModal(view.app, task, () => view.refresh()).open();
                return;
            }
            const start = minToHHMM(ns);
            const end = (mode === 'move') ? (hadEnd ? minToHHMM(ne) : null) : minToHHMM(ne);
            if (mode === 'move' && targetIso !== task.date) {
                await moveTaskToDay(view.app, task, targetIso, start, end, view.plugin.settings);
            } else {
                task.start = start; task.end = end;
                await rewriteTaskLine(view.app, task.file, task.line, task);
            }
            view.refresh();
        };

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    });
}

// ─── Calendar View ───────────────────────────────────────────────────────────

const CAL_MODES = [['month', 'Місяць'], ['agenda', 'Перелік'], ['week', 'Тиждень'], ['workweek', 'Робочий тиждень'], ['3day', '3 дні']];
const COLOR_OPTS = [['priority', 'Колір: пріоритет'], ['tag', 'Колір: тег'], ['group', 'Колір: група'], ['none', 'Без кольору']];

class CalendarView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.mode = 'month';        // month | agenda | week | workweek | 3day
        this.anchor = new Date();
        this.expanded = new Set();
        this.selectedDate = todayISO();
        this.showEarly = false;
        this.showLate = false;
        this.filter = null;
    }

    getViewType() { return CAL_VIEW; }
    getDisplayText() { return t('Календар'); }
    getIcon() { return 'calendar'; }

    async onOpen() { await this.refresh(); }

    isMonthish() { return this.mode === 'month' || this.mode === 'agenda'; }
    resetOffHours() { this.showEarly = false; this.showLate = false; }
    dayCount() { return this.mode === 'week' ? 7 : this.mode === 'workweek' ? 5 : 3; }
    rangeStartDate() { return this.mode === 'workweek' ? startOfWorkWeek(this.anchor) : this.mode === 'week' ? startOfWeek(this.anchor) : this.anchor; }

    shift(dir) {
        if (this.isMonthish()) {
            this.anchor = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + dir, 1);
        } else {
            this.anchor = addDays(this.anchor, dir * (this.mode === '3day' ? 3 : 7));
        }
        this.resetOffHours();
        this.refresh();
    }

    setMode(m) { this.mode = m; this.resetOffHours(); this.refresh(); }
    goToday() { this.anchor = new Date(); this.selectedDate = todayISO(); this.resetOffHours(); this.refresh(); }

    visibleRange() {
        if (this.isMonthish()) {
            const start = startOfWeek(new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1));
            return [toISO(start), toISO(addDays(start, 41))];
        }
        const start = this.rangeStartDate();
        return [toISO(start), toISO(addDays(start, this.dayCount() - 1))];
    }

    matchFilter(t) {
        const f = this.filter;
        if (!f) return true;
        if (f.kind === 'tag') return (t.tags || []).includes(f.value);
        if (f.kind === 'group') return t.group === f.value;
        return t.priority === f.value;
    }

    onResize() {
        const c = compactMode(this);
        if (c !== this._lastCompact) { this.refresh(); return; }
        // height-only resize (e.g. window made shorter): re-render the month so the
        // "+N" overflow trimming is recomputed for the new (smaller) cell heights
        if (this.mode === 'month') {
            clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.refresh(), 120);
        }
    }

    async refresh() {
        const mobile = compactMode(this);
        this._lastCompact = mobile;
        const map = await loadAllTasks(this.app);
        const [s, e] = this.visibleRange();
        addVirtuals(map, this.plugin.settings.recurrences, s, e);

        this._filterOpts = { tags: new Set(), groups: new Set(), priorities: new Set() };
        for (const { tasks } of map.values()) for (const t of tasks) {
            (t.tags || []).forEach(x => this._filterOpts.tags.add(x));
            if (t.group) this._filterOpts.groups.add(t.group);
            if (t.priority) this._filterOpts.priorities.add(t.priority);
        }
        if (this.filter) for (const entry of map.values()) entry.tasks = entry.tasks.filter(t => this.matchFilter(t));

        const root = this.containerEl.children[1];
        root.empty();
        root.addClass('tc-pane', 'tc-cal-pane');
        root.toggleClass('tc-cal-fill', this.mode === 'month' && !mobile);

        this.renderHeader(root, mobile);
        if (this.mode === 'month') this.renderMonth(root, map, mobile);
        else if (this.mode === 'agenda') this.renderAgenda(root, map);
        else { this._map = map; renderTimeline(this, root, this.dayCount()); }
    }

    renderHeader(root, mobile) {
        const s = this.plugin.settings;
        const bar = root.createEl('div', { cls: 'tc-cal-header' });

        if (mobile) {
            const modeBtn = bar.createEl('button', { cls: 'clickable-icon' });
            obsidian.setIcon(modeBtn, 'layout-grid');
            modeBtn.setAttribute('aria-label', 'Режим');
            modeBtn.onclick = e => this.modeMenu(e);

            const title = bar.createEl('div', { text: this.titleText(), cls: 'tc-cal-title' });
            title.onclick = () => this.goToday();

            const right = bar.createEl('div', { cls: 'tc-cal-controls' });
            const prev = right.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(prev, 'chevron-left'); prev.onclick = () => this.shift(-1);
            const next = right.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(next, 'chevron-right'); next.onclick = () => this.shift(1);
            const more = right.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(more, 'more-horizontal');
            if (this.filter) more.addClass('is-active');
            more.onclick = e => this.mobileMenu(e);
            return;
        }

        bar.createEl('div', { text: this.titleText(), cls: 'tc-cal-title' });
        const right = bar.createEl('div', { cls: 'tc-cal-controls' });

        const colorSel = right.createEl('select', { cls: 'dropdown' });
        for (const [v, l] of COLOR_OPTS) { const o = colorSel.createEl('option', { text: t(l) }); o.value = v; if (s.colorBy === v) o.selected = true; }
        colorSel.onchange = async () => { s.colorBy = colorSel.value; await this.plugin.saveSettings(); };

        const modeSel = right.createEl('select', { cls: 'dropdown' });
        for (const [v, l] of CAL_MODES) { const o = modeSel.createEl('option', { text: t(l) }); o.value = v; if (this.mode === v) o.selected = true; }
        modeSel.onchange = () => this.setMode(modeSel.value);

        const filterBtn = right.createEl('button', { cls: 'clickable-icon' });
        obsidian.setIcon(filterBtn, 'filter');
        filterBtn.setAttribute('aria-label', 'Фільтр');
        if (this.filter) filterBtn.addClass('is-active');
        filterBtn.onclick = e => this.filterMenu(e);

        const dispBtn = right.createEl('button', { cls: 'clickable-icon' });
        obsidian.setIcon(dispBtn, 'more-horizontal');
        dispBtn.setAttribute('aria-label', 'Відображення');
        dispBtn.onclick = e => this.displayMenu(e);

        const nav = right.createEl('div', { cls: 'tc-nav-group' });
        const prev = nav.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(prev, 'chevron-left'); prev.onclick = () => this.shift(-1);
        nav.createEl('button', { text: t('Сьогодні') }).onclick = () => this.goToday();
        const next = nav.createEl('button', { cls: 'clickable-icon' }); obsidian.setIcon(next, 'chevron-right'); next.onclick = () => this.shift(1);
    }

    modeMenu(e) {
        const m = new obsidian.Menu();
        for (const [v, l] of CAL_MODES) m.addItem(it => it.setTitle(t(l)).setChecked(this.mode === v).onClick(() => this.setMode(v)));
        m.showAtMouseEvent(e);
    }

    // mobile: colour + filter + display in one menu
    mobileMenu(e) {
        const s = this.plugin.settings;
        const m = new obsidian.Menu();
        m.addItem(it => it.setTitle(t('Колір')).setDisabled(true));
        for (const [v, l] of COLOR_OPTS) m.addItem(it => it.setTitle(t(l)).setChecked(s.colorBy === v).onClick(async () => { s.colorBy = v; await this.plugin.saveSettings(); }));
        m.addSeparator();
        m.addItem(it => it.setTitle(t('Показувати теги')).setChecked(s.showTags).onClick(async () => { s.showTags = !s.showTags; await this.plugin.saveSettings(); }));
        m.addItem(it => it.setTitle(t('Показувати групи')).setChecked(s.showGroups).onClick(async () => { s.showGroups = !s.showGroups; await this.plugin.saveSettings(); }));
        m.addItem(it => it.setTitle(t('Показувати пріоритети')).setChecked(s.showPriority).onClick(async () => { s.showPriority = !s.showPriority; await this.plugin.saveSettings(); }));
        m.addItem(it => it.setTitle(t('Крапка пріоритету')).setChecked(s.priorityDot).onClick(async () => { s.priorityDot = !s.priorityDot; await this.plugin.saveSettings(); }));
        m.addSeparator();
        m.addItem(it => it.setTitle(this.filter ? t('Фільтр: змінити/зняти') : t('Фільтр…')).onClick(() => setTimeout(() => this.filterMenu(e), 0)));
        m.showAtMouseEvent(e);
    }

    filterMenu(e) {
        const m = new obsidian.Menu();
        m.addItem(it => it.setTitle(t('Без фільтра')).setChecked(!this.filter).onClick(() => { this.filter = null; this.refresh(); }));
        const sect = (title, kind, values) => {
            const arr = [...values].sort();
            if (!arr.length) return;
            m.addSeparator();
            m.addItem(it => it.setTitle(title).setDisabled(true));
            for (const v of arr) {
                const active = this.filter && this.filter.kind === kind && this.filter.value === v;
                const label = kind === 'tag' ? `#${v}` : kind === 'group' ? `@${v}` : v;
                m.addItem(it => it.setTitle(label).setChecked(active).onClick(() => { this.filter = { kind, value: v }; this.refresh(); }));
            }
        };
        sect(t('Теги'), 'tag', this._filterOpts.tags);
        sect(t('Групи'), 'group', this._filterOpts.groups);
        sect(t('Пріоритети'), 'priority', this._filterOpts.priorities);
        m.showAtMouseEvent(e);
    }

    displayMenu(e) {
        const s = this.plugin.settings;
        const m = new obsidian.Menu();
        const toggle = (title, key) => m.addItem(it => it.setTitle(title).setChecked(s[key]).onClick(async () => { s[key] = !s[key]; await this.plugin.saveSettings(); }));
        toggle('Показувати теги', 'showTags');
        toggle('Показувати групи', 'showGroups');
        toggle('Показувати пріоритети', 'showPriority');
        m.addSeparator();
        toggle('Крапка пріоритету', 'priorityDot');
        m.showAtMouseEvent(e);
    }

    titleText() {
        if (this.isMonthish()) return `${MONTHS_UA[this.anchor.getMonth()]} ${this.anchor.getFullYear()}`;
        const start = this.rangeStartDate();
        return `${toISO(start)} → ${toISO(addDays(start, this.dayCount() - 1))}`;
    }

    monthDays() {
        const start = startOfWeek(new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1));
        return Array.from({ length: 42 }, (_, i) => addDays(start, i));
    }

    renderMonth(root, map, mobile) {
        const s = this.plugin.settings;
        const refresh = () => this.refresh();
        const grid = root.createEl('div', { cls: 'tc-month-grid' });
        for (const wd of weekdayHeaders()) grid.createEl('div', { text: wd, cls: 'tc-wd' });

        const days = this.monthDays();
        const todayStr = todayISO();

        for (let w = 0; w < 6; w++) {
            let weekHasSelected = false;
            for (let i = 0; i < 7; i++) {
                const day = days[w * 7 + i];
                const iso = toISO(day);
                if (iso === this.selectedDate) weekHasSelected = true;
                const cell = grid.createEl('div', { cls: 'tc-day-cell' });
                if (day.getMonth() !== this.anchor.getMonth()) cell.addClass('tc-outside');
                if (iso === todayStr) cell.addClass('tc-today');
                if (mobile && iso === this.selectedDate) cell.addClass('tc-selected');

                const head = cell.createEl('div', { cls: 'tc-day-head' });
                const num = head.createEl('span', { text: String(day.getDate()) });
                if (!mobile) num.onclick = ev => { ev.stopPropagation(); openDay(this.app, iso); };

                const entry = map.get(iso);
                if (entry && entry.tasks.length) {
                    const items = cell.createEl('div', { cls: 'tc-day-items' });
                    items.dataset.date = iso;
                    entry.tasks.slice().sort(dayOrder).forEach(t => {
                        const bar = items.createEl('div', { cls: 'tc-bar' });
                        if (t.done) bar.addClass('tc-bar-done');
                        if (t.virtual) bar.addClass('tc-virtual');
                        applyCardColor(bar, t, s.colorBy, s.priorityDot);
                        if (!mobile) {
                            const cbx = makeCheckbox(bar, t.done, async checked => {
                                if (t.virtual) await materializeVirtual(this.app, t, checked, s);
                                else if (t.subtasks && t.subtasks.length) await toggleTaskCascade(this.app, t.file, t, checked);
                                else await toggleTask(this.app, t.file, t.line, checked);
                                refresh();
                            }, 'tc-bar-cbx');
                            cbx.onclick = ev => ev.stopPropagation();
                        }
                        bar.createEl('span', { text: t.text || '(без назви)', cls: 'tc-bar-text' });
                        if (t.start) bar.createEl('span', { text: t.start, cls: 'tc-bar-time' });
                        if (!mobile && !t.virtual && t.file) {
                            bar.onclick = ev => { ev.stopPropagation(); new TaskEditorModal(this.app, t, refresh).open(); };
                        }
                    });
                }

                if (mobile) cell.onclick = () => { this.selectedDate = (this.selectedDate === iso ? null : iso); this.refresh(); };
            }
            // mobile: inline expansion under the week row holding the selected day
            if (mobile && weekHasSelected && this.selectedDate) this.renderMonthExpand(grid, map, this.selectedDate);
        }

        this.trimMonthOverflow(root, mobile);
    }

    // after layout: in each day cell keep as many task bars as fit, replace the rest with "+N"
    trimMonthOverflow(root, mobile) {
        let attempts = 0;
        const run = () => {
            // wait until the grid actually has a height (flex/grid layout settled);
            // otherwise clientHeight is 0 and trimming would be silently skipped
            const probe = root.querySelector('.tc-day-items');
            if (probe && probe.clientHeight === 0 && attempts++ < 10) {
                requestAnimationFrame(run);
                return;
            }
            root.querySelectorAll('.tc-day-items').forEach(items => {
                const bars = Array.from(items.children)
                    .filter(c => c.classList.contains('tc-bar') && !c.classList.contains('tc-bar-more'));
                if (bars.length < 2) return;
                const cs = getComputedStyle(items);
                const gap = parseFloat(cs.rowGap || cs.gap) || 2;
                const barH = bars[0].getBoundingClientRect().height + gap;
                const avail = items.clientHeight;
                if (!barH || !avail) return;
                const fit = Math.floor((avail + gap) / barH);
                if (bars.length <= fit) return;
                const keep = Math.max(1, fit - 1);
                for (let i = keep; i < bars.length; i++) bars[i].remove();
                const more = items.createEl('div', { cls: 'tc-bar tc-bar-more', text: `+${bars.length - keep}` });
                more.onclick = ev => {
                    if (mobile) { this.selectedDate = items.dataset.date; this.refresh(); }
                    else { ev.stopPropagation(); openDay(this.app, items.dataset.date); }
                };
            });
        };
        requestAnimationFrame(run);
    }

    renderMonthExpand(grid, map, iso) {
        const settings = this.plugin.settings;
        const refresh = () => this.refresh();
        const panel = grid.createEl('div', { cls: 'tc-month-expand' });
        const head = panel.createEl('div', { cls: 'tc-day-detail-head' });
        head.createEl('span', { text: humanDate(iso), cls: 'tc-day-detail-date' });
        head.createEl('button', { text: t('Нотатка') }).onclick = () => openDay(this.app, iso);
        const entry = map.get(iso);
        const tasks = entry ? entry.tasks.slice().sort(dayOrder) : [];
        if (tasks.length) {
            const list = panel.createEl('div', { cls: 'tc-list' });
            tasks.forEach(t => renderTaskRow(this.app, list, t, refresh, { settings }));
        } else {
            panel.createEl('div', { text: t('Задач немає'), cls: 'tc-col-empty' });
        }
        quickAdd(this.app, panel, iso, refresh, t('+ задача'), settings);
    }

    // "Перелік": compact month with done/undone dots + selected-day task list
    renderAgenda(root, map) {
        const s = this.plugin.settings;
        const grid = root.createEl('div', { cls: 'tc-month-grid tc-dots-grid' });
        for (const wd of weekdayHeaders()) grid.createEl('div', { text: wd, cls: 'tc-wd' });
        const todayStr = todayISO();

        for (const day of this.monthDays()) {
            const iso = toISO(day);
            const cell = grid.createEl('div', { cls: 'tc-day-cell tc-dots-cell' });
            if (day.getMonth() !== this.anchor.getMonth()) cell.addClass('tc-outside');
            if (iso === todayStr) cell.addClass('tc-today');
            if (iso === this.selectedDate) cell.addClass('tc-selected');
            cell.createEl('div', { text: String(day.getDate()), cls: 'tc-dots-num' });

            const entry = map.get(iso);
            if (entry && entry.tasks.length) {
                const dots = cell.createEl('div', { cls: 'tc-dots' });
                entry.tasks.slice(0, 10).forEach(t => {
                    const d = dots.createEl('span', { cls: 'tc-dot' });
                    const c = cardColor(t, s.colorBy) || 'var(--interactive-accent)';
                    if (t.done) { d.addClass('tc-dot-hollow'); d.style.borderColor = c; }
                    else d.style.background = c;
                });
            }
            cell.onclick = () => { this.selectedDate = iso; this.refresh(); };
        }

        this.renderDayDetail(root, map, this.selectedDate);
    }

    renderDayDetail(root, map, iso) {
        const settings = this.plugin.settings;
        const refresh = () => this.refresh();
        const panel = root.createEl('div', { cls: 'tc-day-detail' });
        const head = panel.createEl('div', { cls: 'tc-day-detail-head' });
        head.createEl('span', { text: humanDate(iso), cls: 'tc-day-detail-date' });
        head.createEl('button', { text: t('Відкрити нотатку') }).onclick = () => openDay(this.app, iso);

        const entry = map.get(iso);
        const tasks = entry ? entry.tasks.slice().sort(dayOrder) : [];
        if (tasks.length) {
            const list = panel.createEl('div', { cls: 'tc-list' });
            tasks.forEach(t => renderTaskRow(this.app, list, t, refresh, { settings }));
        } else {
            panel.createEl('div', { text: t('Задач немає'), cls: 'tc-col-empty' });
        }
        quickAdd(this.app, panel, iso, refresh, t('+ задача'), settings);
    }
}

// ─── Mini Calendar View (sidebar) ────────────────────────────────────────────

class MiniCalendarView extends obsidian.ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.anchor = new Date();
    }

    getViewType() { return MINI_VIEW; }
    getDisplayText() { return t('Міні-календар'); }
    getIcon() { return 'calendar-days'; }

    async onOpen() {
        await this.refresh();
        // keep dots/cards in sync when day files change (debounced to coalesce bursts)
        const bump = obsidian.debounce(() => this.refresh(), 250, true);
        this.registerEvent(this.app.vault.on('modify', bump));
        this.registerEvent(this.app.vault.on('create', bump));
        this.registerEvent(this.app.vault.on('delete', bump));
        this.registerEvent(this.app.vault.on('rename', bump));
    }

    shift(dir) {
        this.anchor = new Date(this.anchor.getFullYear(), this.anchor.getMonth() + dir, 1);
        this.refresh();
    }

    async refresh() {
        const map = await loadAllTasks(this.app);   // load before clearing DOM

        const root = this.containerEl.children[1];
        root.empty();
        root.addClass('tc-pane', 'tcm-pane');

        const bar = root.createEl('div', { cls: 'tcm-header' });
        bar.createEl('button', { text: '‹', cls: 'tcm-nav' }).onclick = () => this.shift(-1);
        const title = bar.createEl('div', { text: `${MONTHS_UA[this.anchor.getMonth()]} ${this.anchor.getFullYear()}`, cls: 'tcm-title' });
        title.onclick = () => { this.anchor = new Date(); this.refresh(); };
        bar.createEl('button', { text: '›', cls: 'tcm-nav' }).onclick = () => this.shift(1);

        const grid = root.createEl('div', { cls: 'tcm-grid' });
        for (const wd of weekdayHeaders()) grid.createEl('div', { text: wd, cls: 'tcm-wd' });

        const first = new Date(this.anchor.getFullYear(), this.anchor.getMonth(), 1);
        const start = startOfWeek(first);
        const todayStr = todayISO();

        for (let i = 0; i < 42; i++) {
            const day = addDays(start, i);
            const iso = toISO(day);
            const cell = grid.createEl('div', { cls: 'tcm-cell' });
            if (day.getMonth() !== this.anchor.getMonth()) cell.addClass('tcm-outside');
            if (iso === todayStr) cell.addClass('tcm-today');

            const entry = map.get(iso);
            if (entry) cell.addClass('tcm-has-file');   // file exists → distinct card

            cell.createEl('div', { text: String(day.getDate()), cls: 'tcm-num' });

            const dots = cell.createEl('div', { cls: 'tcm-dots' });
            if (entry && entry.tasks.length) {
                const total = entry.tasks.length;
                const done = entry.tasks.filter(t => t.done).length;
                if (done === 0) miniDot(dots, false);
                else if (done === total) miniDot(dots, true);
                else { miniDot(dots, true); miniDot(dots, false); }
            }

            cell.onclick = () => openDay(this.app, iso);
            cell.oncontextmenu = evt => this.showDayMenu(evt, iso);
        }
    }

    showDayMenu(evt, iso) {
        evt.preventDefault();
        const file = this.app.vault.getAbstractFileByPath(dateToPath(this.app, parseISO(iso)));
        const menu = new obsidian.Menu();
        if (file) {
            // populate with Obsidian's standard file-context items (open, rename, delete, move, …)
            this.app.workspace.trigger('file-menu', menu, file, 'mini-calendar');
        } else {
            menu.addItem(item => item
                .setTitle('Створити нотатку')
                .setIcon('file-plus')
                .onClick(async () => {
                    const f = await getOrCreateDateFile(this.app, iso);
                    this.app.workspace.getLeaf().openFile(f);
                }));
        }
        menu.showAtMouseEvent(evt);
    }
}

function miniDot(container, filled) {
    container.createEl('span', { cls: filled ? 'tcm-dot tcm-dot-filled' : 'tcm-dot tcm-dot-hollow' });
}

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

// ─── Plugin ──────────────────────────────────────────────────────────────────

class TaskCalendarPlugin extends obsidian.Plugin {
    async onload() {
        await this.loadSettings();

        this.registerView(LIST_VIEW, leaf => new ListView(leaf, this));
        this.registerView(CAL_VIEW, leaf => new CalendarView(leaf, this));
        this.registerView(HABITS_VIEW, leaf => new HabitsView(leaf, this));
        this.registerView(MINI_VIEW, leaf => new MiniCalendarView(leaf, this));
        this.registerView(SMART_VIEW, leaf => new SmartView(leaf, this));

        this.addRibbonIcon('list-todo', t('Markday — Розумний список'), () => this.openView(SMART_VIEW));
        this.addRibbonIcon('calendar', t('Markday — Календар'), () => this.openView(CAL_VIEW));
        this.addRibbonIcon('list-checks', t('Markday — Список'), () => this.openView(LIST_VIEW));
        this.addRibbonIcon('check-circle', t('Markday — Звички'), () => this.openView(HABITS_VIEW));
        this.addRibbonIcon('calendar-days', t('Markday — Міні-календар'), () => this.openView(MINI_VIEW, true));

        this.addCommand({ id: 'open-smart', name: t('Відкрити Розумний список'), callback: () => this.openView(SMART_VIEW) });
        this.addCommand({ id: 'open-calendar', name: t('Відкрити Календар'), callback: () => this.openView(CAL_VIEW) });
        this.addCommand({ id: 'open-list', name: t('Відкрити Список задач'), callback: () => this.openView(LIST_VIEW) });
        this.addCommand({ id: 'open-habits', name: t('Відкрити Звички'), callback: () => this.openView(HABITS_VIEW) });
        this.addCommand({ id: 'open-mini', name: t('Відкрити Міні-календар (бічна панель)'), callback: () => this.openView(MINI_VIEW, true) });
        this.addCommand({
            id: 'open-today-file', name: t('Відкрити/створити нотатку сьогодні'),
            callback: async () => {
                const file = await getOrCreateDateFile(this.app, todayISO());
                this.app.workspace.getLeaf().openFile(file);
            }
        });
        this.addCommand({
            id: 'create-task', name: t('Створити задачу'),
            callback: () => new TaskCreateModal(this.app, this).open()
        });
        this.addCommand({
            id: 'create-habit', name: t('Створити звичку'),
            callback: () => new HabitCreateModal(this.app, this).open()
        });

        this.addSettingTab(new TaskCalendarSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        // copy arrays/objects so we never mutate DEFAULT_SETTINGS
        this.settings.recurrences = (this.settings.recurrences || []).slice();
        this.settings.habits = (this.settings.habits || []).slice();
        this.settings.wordCount = Object.assign({}, DEFAULT_SETTINGS.wordCount, this.settings.wordCount);
        const c = this.settings.colors || {};
        this.settings.colors = {
            priorities: (c.priorities || DEFAULT_SETTINGS.colors.priorities).map(x => ({ ...x })),
            tags: (c.tags || []).map(x => ({ ...x })),
            groups: (c.groups || []).map(x => ({ ...x }))
        };
        applyConfig(this.settings);
    }

    async saveSettings() {
        await this.saveData(this.settings);
        applyConfig(this.settings);
        this.refreshViews();
    }

    refreshViews() {
        [LIST_VIEW, CAL_VIEW, HABITS_VIEW, MINI_VIEW, SMART_VIEW].forEach(t =>
            this.app.workspace.getLeavesOfType(t).forEach(l => {
                if (l.view && l.view.refresh) l.view.refresh();
            }));
    }

    async openView(type, left = false) {
        this.app.workspace.detachLeavesOfType(type);
        // on mobile open full-screen in the main area; on desktop use a side panel
        const leaf = obsidian.Platform.isMobile
            ? this.app.workspace.getLeaf(false)
            : (left ? this.app.workspace.getLeftLeaf(false) : this.app.workspace.getRightLeaf(false));
        await leaf.setViewState({ type, active: true });
        this.app.workspace.revealLeaf(leaf);
    }

    onunload() {
        this.app.workspace.detachLeavesOfType(LIST_VIEW);
        this.app.workspace.detachLeavesOfType(CAL_VIEW);
        this.app.workspace.detachLeavesOfType(HABITS_VIEW);
        this.app.workspace.detachLeavesOfType(MINI_VIEW);
        this.app.workspace.detachLeavesOfType(SMART_VIEW);
    }
}

module.exports = TaskCalendarPlugin;

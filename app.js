/* Wordlist — логика приложения.
   Зависит от data/a1.js, data/a2.js, data/b1.js, data/b2.js (англ.),
   data/ge_a1.js (нем.), data/tr_b2.js (тур.). */

/* ===== Supabase ===== */
const SUPABASE_URL = 'https://stojqwedqwijwjmneacy.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0b2pxd2VkcXdpandqbW5lYWN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4Mzc1MjMsImV4cCI6MjEwNzQxMzUyM30.i7x48BSVyHT2m9MRotbl2tLbpzxOLyU5ZPzSdj3tq44';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===== Состояние ===== */
let currentLevel = 'A1';
let screen = 'home';
let checkPhase = 'input';
let currentPerson = 0;

const HISTORY_MAX = 20;
let CHECK_COLS = 5;

let timerRemaining = 0;
let timerInterval  = null;

let sessionSnapshots = [];

/* ===== Пользователь ===== */
let currentUser = null;
let authMode = 'login';

/* ===== Язык ===== */
const LANG_KEY = 'wordlist_lang';

function loadLang() {
    try {
        const v = localStorage.getItem(LANG_KEY);
        if (v === 'en' || v === 'tr' || v === 'de') return v;
    } catch (_) {}
    return 'en';
}
function saveLang(v) {
    try { localStorage.setItem(LANG_KEY, v); } catch (_) {}
}
let currentLanguage = loadLang();

const langColors = {
    en: '#6b8cae',
    de: '#c89b54',
    tr: '#b56b6b',
};

function langColor(code) {
    return langColors[code] || '#888';
}
function langLabel(code) {
    if (code === 'en') return 'English';
    if (code === 'tr') return 'Türkçe';
    if (code === 'de') return 'Deutsch';
    return code;
}
function nextLang(code) {
    if (code === 'en') return 'tr';
    if (code === 'tr') return 'de';
    return 'en';
}
function langShort(code) {
    if (code === 'en') return 'EN';
    if (code === 'tr') return 'TR';
    if (code === 'de') return 'DE';
    return code.toUpperCase();
}

/* ===== Режим проверки: 'all' | 'one' ===== */
const CHECK_MODE_KEY = 'wordlist_check_mode';
function loadCheckMode() {
    try {
        const v = localStorage.getItem(CHECK_MODE_KEY);
        if (v === 'all' || v === 'one') return v;
    } catch (_) {}
    return 'one';
}
function saveCheckMode(v) {
    try { localStorage.setItem(CHECK_MODE_KEY, v); } catch (_) {}
}
let checkMode = loadCheckMode();

function checkModeLabel(m) {
    return m === 'one' ? 'По одной' : 'Все';
}

/* ===== Размер сессии ===== */
const SESSION_SIZE_KEY = 'wordlist_size';
function loadSessionSize() {
    try {
        const v = Number(localStorage.getItem(SESSION_SIZE_KEY));
        if (v === 20 || v === 40 || v === 60) return v;
    } catch (_) {}
    return 20;
}
function saveSessionSize(v) {
    try { localStorage.setItem(SESSION_SIZE_KEY, String(v)); } catch (_) {}
}
let sessionSize = loadSessionSize();

/* ===== Время на запоминание ===== */
const SESSION_TIME_KEY = 'wordlist_time';
function loadSessionTime() {
    try {
        const v = Number(localStorage.getItem(SESSION_TIME_KEY));
        if (v === 60 || v === 120 || v === 180 || v === 0) return v;
    } catch (_) {}
    return 60;
}
function saveSessionTime(v) {
    try { localStorage.setItem(SESSION_TIME_KEY, String(v)); } catch (_) {}
}
let sessionTime = loadSessionTime();

function timeLabel(sec) {
    if (sec === 0)   return '∞';
    if (sec === 60)  return '1м';
    if (sec === 120) return '2м';
    if (sec === 180) return '3м';
    return sec + 'с';
}

/* ===== Уровни ===== */
const levels = [
    { code: 'A1', enabled: true  },
    { code: 'A2', enabled: true  },
    { code: 'B1', enabled: true  },
    { code: 'B2', enabled: true  },
    { code: 'C1', enabled: false },
    { code: 'C2', enabled: false },
];

const levelColors = {
    A1: '#e57373',
    A2: '#e6a23c',
    B1: '#f5c518',
    B2: '#2ecc71',
    C1: '#e0e0e0',
    C2: '#e0e0e0',
};

const BANKS = {
    en: {
        A1: typeof WORDS_A1 !== 'undefined' ? WORDS_A1 : null,
        A2: typeof WORDS_A2 !== 'undefined' ? WORDS_A2 : null,
        B1: typeof WORDS_B1 !== 'undefined' ? WORDS_B1 : null,
        B2: typeof WORDS_B2 !== 'undefined' ? WORDS_B2 : null,
    },
    de: {
        A1: typeof WORDS_GE_A1 !== 'undefined' ? WORDS_GE_A1 : null,
    },
    tr: {
        B2: typeof WORDS_TR_B2 !== 'undefined' ? WORDS_TR_B2 : null,
    },
};

function hasBank(level) {
    const l = BANKS[currentLanguage];
    return !!(l && l[level] && l[level].length);
}
function getBank(level) {
    const l = BANKS[currentLanguage];
    return (l && l[level]) ? l[level] : null;
}

function storageLevelKey() {
    return currentLanguage.toUpperCase() + '_' + currentLevel;
}

let sessionWords = [];
let userAnswers  = [];

const view           = document.getElementById('view');
const trainSlot      = document.getElementById('trainSlot');
const finishBtn      = document.getElementById('finishBtn');
const timerWrap      = document.getElementById('timerWrap');
const timerValue     = document.getElementById('timerValue');
const historyBtn     = document.getElementById('historyBtn');
const loginBtn       = document.getElementById('loginBtn');
const signupBtn      = document.getElementById('signupBtn');
const settingsBtn    = document.getElementById('settingsBtn');
const topbarInner    = document.querySelector('.topbar-inner');
const homeLangBadge  = document.getElementById('homeLangBadge');
const homeLevelIcon  = document.getElementById('homeLevelIcon');

/* ===== Обработчики шапки ===== */
function inTrainingMode() {
    return screen === 'train' || screen === 'check';
}

function updateHeaderBadges() {
    if (homeLangBadge) {
        homeLangBadge.textContent = langShort(currentLanguage);
        homeLangBadge.style.background = langColor(currentLanguage);
    }
    if (homeLevelIcon) {
        homeLevelIcon.textContent = currentLevel;
        homeLevelIcon.dataset.level = currentLevel;
        homeLevelIcon.style.background = levelColors[currentLevel] || '#e0e0e0';
    }
}

function refreshCurrentScreen() {
    updateHeaderBadges();

    if (screen === 'home')          renderHome();
    else if (screen === 'settings') renderSettings();
    else if (screen === 'results')  renderResults();
    else if (screen === 'history' || screen === 'history-entry') renderHistory();

    updateProgressBar();
    updateHeader();
}

homeLangBadge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inTrainingMode()) return;

    currentLanguage = nextLang(currentLanguage);
    saveLang(currentLanguage);

    if (!hasBank(currentLevel)) {
        const available = levels.filter(l => l.enabled && hasBank(l.code));
        if (available.length) currentLevel = available[0].code;
    }

    refreshCurrentScreen();
});

homeLevelIcon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (inTrainingMode()) return;

    const available = levels.filter(l => l.enabled && hasBank(l.code));
    if (!available.length) return;

    const curIdx = available.findIndex(l => l.code === currentLevel);
    const next = available[(curIdx + 1) % available.length];
    currentLevel = next.code;

    refreshCurrentScreen();
});

/* ===== Модальное окно авторизации ===== */
const authOverlay  = document.getElementById('authOverlay');
const authTitle    = document.getElementById('authTitle');
const authEmail    = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError    = document.getElementById('authError');
const authSubmit   = document.getElementById('authSubmit');
const authCancel   = document.getElementById('authCancel');
const authForgot   = document.getElementById('authForgot');

/* ===== Модальное окно сброса пароля ===== */
const resetOverlay     = document.getElementById('resetOverlay');
const resetEmail       = document.getElementById('resetEmail');
const resetNewPassword = document.getElementById('resetNewPassword');
const resetError       = document.getElementById('resetError');
const resetSubmit      = document.getElementById('resetSubmit');
const resetCancel      = document.getElementById('resetCancel');
const resetHint        = document.getElementById('resetHint');

let resetMode = 'send';

/* ===== Настройки подсказок и озвучки ===== */
const HINTS_KEY  = 'wordlist_hints';
const LENGTH_KEY = 'wordlist_length';
const VOICE_KEY  = 'wordlist_voice';

function loadBool(key, def) {
    try {
        const v = localStorage.getItem(key);
        if (v === '1') return true;
        if (v === '0') return false;
    } catch (_) {}
    return def;
}
function saveBool(key, on) {
    try { localStorage.setItem(key, on ? '1' : '0'); } catch (_) {}
}
function loadHints()  { return loadBool(HINTS_KEY, false); }
function saveHints(v) { saveBool(HINTS_KEY, v); }
function loadLength() { return loadBool(LENGTH_KEY, false); }
function saveLength(v){ saveBool(LENGTH_KEY, v); }
function loadVoice()  { return loadBool(VOICE_KEY, true); }
function saveVoice(v) { saveBool(VOICE_KEY, v); }

/* ===== Утилиты ===== */
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normalize(s, lang) {
    let v = (s || '');

    if (lang === 'de') {
        v = v
            .replace(/ä/g, 'ae').replace(/Ä/g, 'ae')
            .replace(/ö/g, 'oe').replace(/Ö/g, 'oe')
            .replace(/ü/g, 'ue').replace(/Ü/g, 'ue')
            .replace(/ß/g, 'ss');
        v = v.toLowerCase();
        v = v.replace(/ae/g, 'a')
             .replace(/oe/g, 'o')
             .replace(/ue/g, 'u');
        v = v.replace(/\b(der|die|das)\b/g, '');
    } else if (lang === 'tr') {
        v = v
            .replace(/ç/g, 'c').replace(/Ç/g, 'c')
            .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
            .replace(/ı/g, 'i').replace(/İ/g, 'i')
            .replace(/ö/g, 'o').replace(/Ö/g, 'o')
            .replace(/ş/g, 's').replace(/Ş/g, 's')
            .replace(/ü/g, 'u').replace(/Ü/g, 'u');
        v = v.toLowerCase();
    } else {
        v = v.toLowerCase();
        v = v.replace(/\b(to|the)\b/g, '');
    }

    v = v.replace(/[^a-z]/g, '');
    return v;
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    return dp[m][n];
}

function evaluate(userAnswer, correctAnswer) {
    const cleaned = (userAnswer || '').replace(/\*/g, '');
    const u = normalize(cleaned, currentLanguage);
    const c = normalize(correctAnswer, currentLanguage);
    if (!u) return 'wrong';
    if (u === c) return 'correct';
    const dist = levenshtein(u, c);
    const allowed = Math.max(1, Math.round(c.length * 0.1));
    return dist <= allowed ? 'close' : 'wrong';
}

function updateCheckCols() {
    CHECK_COLS = (window.innerWidth <= 560) ? 3 : 5;
}

/* ===== Подсказка ===== */
function hintPrefix(word) {
    const w = word || '';
    if (currentLanguage === 'de') {
        if (w.startsWith('der ')) return 'der ';
        if (w.startsWith('die ')) return 'die ';
        if (w.startsWith('das ')) return 'das ';
    } else if (currentLanguage === 'tr') {
        // нет артиклей
    } else {
        if (w.startsWith('to '))  return 'to ';
        if (w.startsWith('the ')) return 'the ';
    }
    return '';
}

function buildHintVisible(correctAnswer) {
    if (!loadHints()) return '';
    const s = correctAnswer || '';
    if (!s) return '';
    const prefix = hintPrefix(s);
    if (prefix) {
        const rest = s.slice(prefix.length);
        if (!rest) return prefix.trim();
        return prefix + rest[0];
    }
    return s[0] || '';
}

function buildHintMask(correctAnswer) {
    const s = correctAnswer || '';
    const visible = buildHintVisible(s);
    const withLength = loadLength();
    if (!withLength) return visible;
    const stars = '*'.repeat(Math.max(0, s.length - visible.length));
    return visible + stars;
}

function hintLockLength(correctAnswer) {
    return buildHintVisible(correctAnswer).length;
}

/* ===== Озвучка (Speech Synthesis) ===== */
const voiceLangMap = { en: 'en-US', de: 'de-DE', tr: 'tr-TR' };

function speakWord(text) {
    if (!loadVoice()) return;
    if (!text || !('speechSynthesis' in window)) return;

    try { window.speechSynthesis.cancel(); } catch (_) {}

    const u = new SpeechSynthesisUtterance(text);
    u.lang = voiceLangMap[currentLanguage] || 'en-US';
    u.rate = 0.9;
    u.pitch = 1;

    const voices = window.speechSynthesis.getVoices();
    const match = voices.find(v =>
        v.lang && v.lang.toLowerCase().startsWith(u.lang.toLowerCase().slice(0, 2))
    );
    if (match) u.voice = match;

    try { window.speechSynthesis.speak(u); } catch (_) {}
}

/* ===== Прогресс (только Supabase) ===== */
async function loadProgress() {
    if (!currentUser) return { learned: [] };
    const { data, error } = await sb
        .from('progress')
        .select('learned')
        .eq('user_id', currentUser.id)
        .eq('lang', currentLanguage)
        .eq('level', currentLevel)
        .maybeSingle();
    if (!error && data) {
        return { learned: Array.isArray(data.learned) ? data.learned : [] };
    }
    if (error) console.warn('loadProgress error:', error.message);
    return { learned: [] };
}

async function saveProgress(progress) {
    if (!currentUser) return;
    const { error } = await sb.from('progress').upsert({
        user_id: currentUser.id,
        lang: currentLanguage,
        level: currentLevel,
        learned: progress.learned,
        updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,lang,level' });
    if (error) console.warn('saveProgress error:', error.message);
}

async function resetProgress() {
    if (!currentUser) return;
    const { error } = await sb.from('progress')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('lang', currentLanguage)
        .eq('level', currentLevel);
    if (error) console.warn('resetProgress error:', error.message);
}

async function resetAllProgress() {
    if (!currentUser) return;
    const { error } = await sb.from('progress')
        .delete()
        .eq('user_id', currentUser.id);
    if (error) console.warn('resetAllProgress error:', error.message);
}

/* ===== История (только Supabase) ===== */
async function loadHistory() {
    if (!currentUser) return [];
    const { data, error } = await sb
        .from('history')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('lang', currentLanguage)
        .eq('level', currentLevel)
        .order('created_at', { ascending: false })
        .limit(HISTORY_MAX);
    if (!error && Array.isArray(data)) {
        return data.map(r => ({
            date: r.date,
            correct: r.correct,
            close: r.close,
            wrong: r.wrong,
            total: r.total
        }));
    }
    if (error) console.warn('loadHistory error:', error.message);
    return [];
}

async function pushHistory(entry) {
    if (!currentUser) return;
    const { error } = await sb.from('history').insert({
        user_id: currentUser.id,
        lang: currentLanguage,
        level: currentLevel,
        date: entry.date,
        correct: entry.correct,
        close: entry.close,
        wrong: entry.wrong,
        total: entry.total
    });
    if (error) console.warn('pushHistory error:', error.message);
}

/* ===== Шапка ===== */
function updateHeader() {
    historyBtn.classList.toggle('active', screen === 'history' || screen === 'history-entry');
    settingsBtn.classList.toggle('active', screen === 'settings');

    // Кнопка «Результаты» на экране истории показывает «Назад»
    historyBtn.textContent = (screen === 'history' || screen === 'history-entry') ? 'Назад' : 'Результаты';

    // Кнопка настроек на экране настроек показывает иконку домика
    if (screen === 'settings') {
        settingsBtn.classList.add('home-mode');
        settingsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M3 12L12 3l9 9"/>
                <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/>
            </svg>
        `;
    } else {
        settingsBtn.classList.remove('home-mode');
        settingsBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
        `;
    }

    if (currentUser) {
        historyBtn.style.display = '';
        loginBtn.style.display = 'none';
        signupBtn.style.display = 'none';
    } else {
        historyBtn.style.display = 'none';
        loginBtn.style.display = '';
        signupBtn.style.display = '';
    }

    topbarInner.classList.toggle('mode-home',
        screen === 'home' || screen === 'history' || screen === 'history-entry' || screen === 'settings');
    topbarInner.classList.toggle('mode-train',
        screen === 'train' || screen === 'check' || screen === 'results');

    trainSlot.style.display = (screen === 'train' || screen === 'check' || screen === 'results') ? 'flex' : 'none';

    const showTimer = (screen === 'train') && sessionTime > 0;
    timerWrap.style.display = showTimer ? '' : 'none';

    if (screen === 'home') updateProgressBar();

    if (screen === 'results') {
        finishBtn.textContent = 'Продолжить';
        finishBtn.classList.add('continue');
    } else if (screen === 'check' && checkPhase === 'result') {
        finishBtn.textContent = 'К результатам';
        finishBtn.classList.add('continue');
    } else {
        finishBtn.textContent = 'Завершить';
        finishBtn.classList.remove('continue');
    }
}

/* ===== Таймер ===== */
function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function startTimer() {
    stopTimer();

    if (sessionTime === 0) {
        timerValue.textContent = '';
        return;
    }

    timerRemaining = sessionTime;
    timerValue.textContent = formatTime(timerRemaining);

    timerInterval = setInterval(() => {
        timerRemaining--;
        if (timerRemaining <= 0) {
            timerRemaining = 0;
            timerValue.textContent = formatTime(0);
            stopTimer();
            goToCheck();
            return;
        }
        timerValue.textContent = formatTime(timerRemaining);
    }, 1000);
}
function stopTimer() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

/* ===== Плашки языка и уровня + счётчик на главном ===== */
async function updateProgressBar() {
    const bank = getBank(currentLevel) || [];
    const total = bank.length;
    const prog = await loadProgress();
    const learned = prog.learned.length;

    const homeProgress = document.getElementById('homeProgress');
    if (homeProgress) homeProgress.textContent = `${learned} / ${total}`;

    updateHeaderBadges();
}

/* ===== Главный экран ===== */
function renderHome() {
    if (!hasBank(currentLevel)) {
        const first = levels.find(l => l.enabled && hasBank(l.code));
        if (first) currentLevel = first.code;
    }

    const levelsHtml = levels.map(lvl => {
        const bankExists = hasBank(lvl.code);
        const isActive = lvl.code === currentLevel && bankExists;

        let cls = 'level-btn';
        let style = '';

        if (!bankExists) {
            cls += ' disabled';
        } else if (isActive) {
            cls += ' active';
            style = `background:${levelColors[lvl.code] || '#e0e0e0'};`;
        }

        const disabled = bankExists ? '' : 'disabled';
        return `<button class="${cls}" data-level="${lvl.code}" style="${style}" ${disabled}>${lvl.code}</button>`;
    }).join('');

    const canStart = hasBank(currentLevel);
    const startCls = canStart ? 'start-btn' : 'start-btn disabled';

    view.innerHTML = `
        <div class="home-layout">
            <div class="levels-column">${levelsHtml}</div>
            <div class="start-column">
                <button class="${startCls}" id="startBtn">
                    <span class="start-btn-label">Начать тренировку</span>
                    <span class="start-btn-counter" id="homeProgress">0 / 0</span>
                </button>
            </div>
        </div>
    `;

    view.querySelectorAll('.level-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            const lvl = btn.dataset.level;
            if (lvl === currentLevel) return;
            currentLevel = lvl;
            renderHome();
            await updateProgressBar();
        });
    });

    document.getElementById('startBtn').addEventListener('click', () => {
        if (!hasBank(currentLevel)) {
            alert('База для уровня ' + currentLevel + ' на этом языке ещё не подключена.');
            return;
        }
        startSession();
    });

    updateHeader();
    updateProgressBar();
}

/* ===== Старт сессии ===== */
async function startSession() {
    const bank = getBank(currentLevel);
    if (!bank || !bank.length) {
        alert('База для уровня ' + currentLevel + ' на этом языке ещё не подключена.');
        return;
    }

    const size = sessionSize;

    const prog = await loadProgress();
    const learnedSet = new Set(prog.learned);

    let fresh = bank.filter(w => !learnedSet.has(w.en));
    if (fresh.length < size) {
        await resetProgress();
        fresh = bank.slice();
    }

    const pool = shuffle(fresh);
    sessionWords = pool.slice(0, size);
    userAnswers  = sessionWords.map(() => '');
    currentPerson = 0;
    screen = 'train';
    renderTrain();
    startTimer();
}

/* ===== Лента миниатюр ===== */
function buildThumbsHTML() {
    return sessionWords.map((item, i) => `
        <div class="thumb${i === currentPerson ? ' active' : ''}" data-index="${i}">
            <div class="thumb-img">${item.ru}</div>
            <div class="thumb-name">${item.en}</div>
        </div>
    `).join('');
}

function updateThumbsActive() {
    const bar = document.getElementById('thumbsBar');
    if (!bar) return;
    bar.querySelectorAll('.thumb').forEach(el => {
        el.classList.toggle('active', Number(el.dataset.index) === currentPerson);
    });
}

function ensureThumbVisible() {
    const bar = document.getElementById('thumbsBar');
    if (!bar) return;
    const active = bar.querySelector('.thumb.active');
    if (!active) return;

    const barRect = bar.getBoundingClientRect();
    const thumbRect = active.getBoundingClientRect();

    const outLeft  = thumbRect.left  < barRect.left;
    const outRight = thumbRect.right > barRect.right;

    if (outLeft || outRight) {
        const target = active.offsetLeft
            - (bar.clientWidth - active.clientWidth) / 2;
        bar.scrollLeft = Math.max(0, target);
    }
}

function counterHTML() {
    return `<span class="card-counter">${currentPerson + 1} / ${sessionWords.length}</span>`;
}

/* ===== Экран тренировки ===== */
function renderTrain() {
    view.innerHTML = `
        <div class="train-screen">
            <div class="thumbs" id="thumbsBar">${buildThumbsHTML()}</div>
            <div class="train-area">
                <div class="train-main">
                    <div class="face-square" id="faceSquare"></div>
                    <div class="name-plate" id="namePlate"></div>
                    <div class="train-controls">
                        <button class="ctrl-btn" id="btnFirst">⏮</button>
                        <button class="ctrl-btn" id="btnPrev">◀</button>
                        ${counterHTML()}
                        <button class="ctrl-btn" id="btnNext">▶</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const thumbsBar = document.getElementById('thumbsBar');
    thumbsBar.addEventListener('click', (e) => {
        const t = e.target.closest('.thumb');
        if (!t) return;
        currentPerson = Number(t.dataset.index);
        updateTrainCard();
    });

    document.getElementById('btnFirst').addEventListener('click', () => {
        currentPerson = 0;
        updateTrainCard();
    });
    document.getElementById('btnPrev').addEventListener('click', () => {
        currentPerson = Math.max(0, currentPerson - 1);
        updateTrainCard();
    });
    document.getElementById('btnNext').addEventListener('click', () => {
        if (currentPerson >= sessionWords.length - 1) {
            goToCheck();
            return;
        }
        currentPerson++;
        updateTrainCard();
    });

    const faceSquare = document.getElementById('faceSquare');
    faceSquare.addEventListener('click', () => {
        const w = sessionWords[currentPerson];
        speakWord(w.en);
    });

    const namePlate = document.getElementById('namePlate');
    namePlate.addEventListener('click', () => {
        const w = sessionWords[currentPerson];
        speakWord(w.en);
    });

    updateTrainCard();
    updateHeader();
}

function updateTrainCard() {
    const w = sessionWords[currentPerson];

    const fs = document.getElementById('faceSquare');
    const np = document.getElementById('namePlate');
    if (!fs || !np) return;

    const hasExample = !!(w.ex && w.ex.trim());
    fs.innerHTML = hasExample
        ? `<span class="fs-word">${w.ru}</span><span class="fs-example">${w.ex}</span>`
        : `<span class="fs-word">${w.ru}</span>`;

    np.innerHTML = `${w.en} <span style="font-size:0.7em;opacity:0.65">(${w.pos})</span>`;

    fitFontSize(fs, 40, 14);
    fitFontSize(np, 34, 12);

    const counterEl = document.querySelector('.card-counter');
    if (counterEl) counterEl.textContent = `${currentPerson + 1} / ${sessionWords.length}`;

    updateThumbsActive();
    ensureThumbVisible();

    speakWord(w.en);
}

/* ===== Навигация клавишами на тренировке ===== */
function handleTrainKeys(e) {
    if (screen !== 'train') return;

    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

    if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (currentPerson < sessionWords.length - 1) {
            currentPerson++;
            updateTrainCard();
        } else if (e.key === 'Enter') {
            goToCheck();
        }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentPerson > 0) {
            currentPerson--;
            updateTrainCard();
        }
    }
}

/* ===== Переход в проверку ===== */
function goToCheck() {
    stopTimer();
    updateCheckCols();
    screen = 'check';
    checkPhase = 'input';
    sessionWords = shuffle(sessionWords);

    userAnswers = sessionWords.map(item => buildHintMask(item.en));

    currentPerson = 0;
    renderCheck();
}

/* ===== Экран проверки: разводка all/one ===== */
function renderCheck() {
    if (checkMode === 'one') {
        renderCheckOne();
    } else {
        renderCheckAll();
    }
    updateHeader();
}

/* ---------- Режим "Все" (сетка) ---------- */
function renderCheckAll() {
    const hintsOn = loadHints();
    const lengthOn = loadLength();

    const cellsHtml = sessionWords.map((item, i) => {
        const answer = userAnswers[i] || '';
        const cls = ['check-input'];

        if (checkPhase === 'result') {
            cls.push(evaluate(answer, item.en));
        }

        const disabled = (checkPhase === 'result') ? 'disabled' : '';
        const current  = (i === currentPerson && checkPhase === 'input') ? ' current' : '';
        const hintMode = (hintsOn || lengthOn) && checkPhase === 'input';

        return `
            <div class="check-cell${current}" data-index="${i}">
                <div class="check-img">${item.ru}</div>
                <input
                    class="${cls.join(' ')}"
                    type="text"
                    value="${answer.replace(/"/g, '&quot;')}"
                    data-index="${i}"
                    data-hint="${hintMode ? '1' : '0'}"
                    ${disabled}
                >
            </div>
        `;
    }).join('');

    view.innerHTML = `
        <div class="check-area">
            <div class="check-grid">${cellsHtml}</div>
        </div>
    `;

    view.querySelectorAll('.check-img').forEach(el => {
        fitFontSize(el, 13, 8);
    });

    if (checkPhase === 'input') {
        view.querySelectorAll('.check-input').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = Number(e.target.dataset.index);
                userAnswers[idx] = e.target.value;
            });

            inp.addEventListener('focus', (e) => {
                const idx = Number(e.target.dataset.index);
                if (idx === currentPerson) return;
                currentPerson = idx;
                updateCheckHighlight();
            });

            inp.addEventListener('keydown', handleCheckKey);

            if (inp.dataset.hint === '1') {
                setupHintInput(inp);
            }
        });
    }
}

/* ---------- Режим "По одной" (карточка) ---------- */
function renderCheckOne() {
    const item = sessionWords[currentPerson];
    const answer = userAnswers[currentPerson] || '';

    let inputCls = 'check-input check-input-one';
    if (checkPhase === 'result') {
        inputCls += ' ' + evaluate(answer, item.en);
    }

    const disabled = (checkPhase === 'result') ? 'disabled' : '';
    const hintMode = (loadHints() || loadLength()) && checkPhase === 'input';

    view.innerHTML = `
        <div class="train-screen">
            <div class="thumbs" id="thumbsBar">${buildThumbsHTML()}</div>
            <div class="train-area">
                <div class="train-main">
                    <div class="face-square" id="faceSquare"><span class="fs-word">${item.ru}</span></div>
                    <input
                        class="${inputCls}"
                        id="oneInput"
                        type="text"
                        value="${answer.replace(/"/g, '&quot;')}"
                        data-index="${currentPerson}"
                        data-hint="${hintMode ? '1' : '0'}"
                        ${disabled}
                    >
                    <div class="train-controls">
                        <button class="ctrl-btn" id="btnFirst">⏮</button>
                        <button class="ctrl-btn" id="btnPrev">◀</button>
                        ${counterHTML()}
                        <button class="ctrl-btn" id="btnNext">▶</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const thumbsBar = document.getElementById('thumbsBar');
    thumbsBar.addEventListener('click', (e) => {
        const t = e.target.closest('.thumb');
        if (!t) return;
        saveOneInput();
        currentPerson = Number(t.dataset.index);
        renderCheckOne();
        updateHeader();
    });

    document.getElementById('btnFirst').addEventListener('click', () => {
        saveOneInput();
        currentPerson = 0;
        renderCheckOne();
        updateHeader();
    });
    document.getElementById('btnPrev').addEventListener('click', () => {
        saveOneInput();
        currentPerson = Math.max(0, currentPerson - 1);
        renderCheckOne();
        updateHeader();
    });
    document.getElementById('btnNext').addEventListener('click', () => {
        saveOneInput();
        if (currentPerson < sessionWords.length - 1) {
            currentPerson++;
            renderCheckOne();
            updateHeader();
        } else {
            checkPhase = 'result';
            renderCheckOne();
            updateHeader();
        }
    });

    const inp = document.getElementById('oneInput');
    if (inp) {
        if (checkPhase === 'input' && inp.dataset.hint === '1') {
            setupHintInput(inp);
        } else {
            inp.addEventListener('input', () => {
                userAnswers[currentPerson] = inp.value;
            });
        }

        try { inp.focus({ preventScroll: true }); } catch (_) {}

        if (window.visualViewport && window.innerWidth <= 720) {
            setTimeout(() => {
                const fs = document.getElementById('faceSquare');
                if (fs) {
                    try { fs.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (_) {}
                }
            }, 300);
        }
    }

    const fs = document.getElementById('faceSquare');
    if (fs) {
        fs.addEventListener('click', () => {
            const w = sessionWords[currentPerson];
            speakWord(w.en);
        });
    }

    ensureThumbVisible();
}

function saveOneInput() {
    const inp = document.getElementById('oneInput');
    if (inp) userAnswers[currentPerson] = inp.value;
}

/* ===== Режим подсказки ===== */
function setupHintInput(inp) {
    const idx = Number(inp.dataset.index);
    const correct = sessionWords[idx].en;
    const maxLen = correct.length;
    const lockLen = hintLockLength(correct);
    const visiblePart = buildHintVisible(correct);
    const withLength = loadLength();

    const countUserTyped = (v) => {
        let n = 0;
        for (let i = lockLen; i < v.length; i++) {
            if (v[i] !== '*') n++;
            else break;
        }
        return n;
    };

    const caretPos = () => lockLen + countUserTyped(inp.value);
    const putCaret = () => {
        try { inp.setSelectionRange(caretPos(), caretPos()); } catch (_) {}
    };
    const putCaretSoon = () => setTimeout(putCaret, 0);

    const normalizeValue = (v) => {
        let userChars = '';
        for (let i = lockLen; i < v.length; i++) {
            if (v[i] !== '*') userChars += v[i];
            else break;
        }
        if (withLength) {
            userChars = userChars.slice(0, maxLen - lockLen);
        }
        if (!withLength) {
            return visiblePart + userChars;
        }
        const stars = '*'.repeat(Math.max(0, maxLen - lockLen - userChars.length));
        return visiblePart + userChars + stars;
    };

    const setValue = (v) => {
        inp.value = v;
        userAnswers[idx] = v;
    };

    setValue(normalizeValue(inp.value));
    putCaretSoon();

    inp.addEventListener('input', () => {
        let raw = inp.value;

        if (withLength && raw.length > maxLen) {
            raw = raw.slice(0, maxLen);
        }
        if (!raw.startsWith(visiblePart)) {
            raw = visiblePart + raw.slice(lockLen);
        }
        if (raw.length < lockLen) {
            raw = visiblePart;
        }

        setValue(normalizeValue(raw));
        putCaretSoon();
    });

    inp.addEventListener('keydown', (e) => {
        if (e.key === 'Home' || e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' || e.key === 'End') {
            e.preventDefault();
            putCaret();
            return;
        }
    });

    inp.addEventListener('paste', (e) => e.preventDefault());
    inp.addEventListener('cut',   (e) => e.preventDefault());
    inp.addEventListener('drop',  (e) => e.preventDefault());

    inp.addEventListener('focus', putCaretSoon);
    inp.addEventListener('click', putCaretSoon);

    putCaretSoon();
}

function handleCheckKey(e) {
    if (checkPhase !== 'input') return;
    if (checkMode === 'one') return;

    let next = null;

    if (e.key === 'Enter' || e.key === 'ArrowRight') {
        next = currentPerson + 1;
    } else if (e.key === 'ArrowLeft') {
        next = currentPerson - 1;
    } else if (e.key === 'ArrowDown') {
        next = currentPerson + CHECK_COLS;
    } else if (e.key === 'ArrowUp') {
        next = currentPerson - CHECK_COLS;
    } else {
        return;
    }

    e.preventDefault();
    if (next < 0 || next >= sessionWords.length) return;

    currentPerson = next;
    updateCheckHighlight();
    focusCurrentInput(true);
}

/* ===== Клавиши в режиме «По одной» ===== */
function handleCheckOneKey(e) {
    if (screen !== 'check') return;
    if (checkMode !== 'one') return;
    if (checkPhase !== 'input') return;

    const tag = (e.target && e.target.tagName) || '';
    const inInput = (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable));

    if (inInput && e.key === 'Enter') {
        e.preventDefault();
        saveOneInput();
        if (currentPerson < sessionWords.length - 1) {
            currentPerson++;
            renderCheckOne();
            updateHeader();
        } else {
            checkPhase = 'result';
            renderCheckOne();
            updateHeader();
        }
        return;
    }

    if (inInput) return;

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        saveOneInput();
        if (currentPerson < sessionWords.length - 1) {
            currentPerson++;
            renderCheckOne();
            updateHeader();
        } else {
            checkPhase = 'result';
            renderCheckOne();
            updateHeader();
        }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        saveOneInput();
        if (currentPerson > 0) {
            currentPerson--;
            renderCheckOne();
            updateHeader();
        }
    }
}

function focusCurrentInput(scrollIfNeeded) {
    if (checkMode === 'one') {
        const inp = document.getElementById('oneInput');
        if (inp) {
            try { inp.focus({ preventScroll: true }); } catch (_) {}
        }
        return;
    }
    const el = view.querySelector(`.check-input[data-index="${currentPerson}"]`);
    if (!el) return;

    try {
        el.focus({ preventScroll: true });
    } catch (_) {
        el.focus();
    }

    if (el.dataset.hint === '1') {
        const lockLen = hintLockLength(sessionWords[currentPerson].en);
        let userTyped = 0;
        for (let i = lockLen; i < el.value.length; i++) {
            if (el.value[i] !== '*') userTyped++;
            else break;
        }
        const pos = lockLen + userTyped;
        try { el.setSelectionRange(pos, pos); } catch (_) {}
    } else {
        const val = el.value;
        try { el.setSelectionRange(val.length, val.length); } catch (_) {}
    }

    if (scrollIfNeeded) scrollCurrentInputIntoView();
}

function scrollCurrentInputIntoView() {
    const el = view.querySelector(`.check-input[data-index="${currentPerson}"]`);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth  || document.documentElement.clientWidth;

    const outTop    = rect.top    < 0;
    const outBottom = rect.bottom > vh;
    const outLeft   = rect.left   < 0;
    const outRight  = rect.right  > vw;

    if (outTop || outBottom || outLeft || outRight) {
        el.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
    }
}

function updateCheckHighlight() {
    view.querySelectorAll('.check-cell').forEach(cell => {
        cell.classList.toggle('current', Number(cell.dataset.index) === currentPerson);
    });
}

/* ===== Прогресс после проверки ===== */
async function commitProgress() {
    const prog = await loadProgress();
    const learnedSet = new Set(prog.learned);

    sessionWords.forEach((item, i) => {
        const verdict = evaluate(userAnswers[i] || '', item.en);
        if (verdict === 'correct') learnedSet.add(item.en);
    });

    prog.learned = Array.from(learnedSet);
    await saveProgress(prog);
}

/* ===== Результаты ===== */
function renderResults() {
    let correct = 0, close = 0, wrong = 0;

    const rows = sessionWords.map((item, i) => {
        const userAns = userAnswers[i] || '';
        const verdict = evaluate(userAns, item.en);

        if (verdict === 'correct') correct++;
        else if (verdict === 'close') close++;
        else wrong++;

        const displayUserRaw = userAns.replace(/\*/g, '').trim();
        const displayUser = displayUserRaw ? displayUserRaw : '—';
        const userCls = displayUserRaw ? verdict : 'empty';

        return `
            <tr>
                <td>${item.ru}</td>
                <td class="${userCls}">${displayUser}</td>
                <td class="answer-ok">${item.en}</td>
            </tr>
        `;
    }).join('');

    const total = sessionWords.length;
    const pct = (n) => total ? Math.round(n / total * 100) : 0;

    view.innerHTML = `
        <div class="results-area">
            <div class="results-summary">
                <span class="pill total">${langShort(currentLanguage)} ${currentLevel} · ${total}</span>
                <span class="pill green">${correct} · ${pct(correct)}%</span>
                <span class="pill orange">${close} · ${pct(close)}%</span>
                <span class="pill red">${wrong} · ${pct(wrong)}%</span>
            </div>

            <table class="results-table">
                <thead>
                    <tr>
                        <th>Значение</th>
                        <th>Ваш ответ</th>
                        <th>Правильный ответ</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    updateHeader();
}

/* ===== История ===== */
async function renderHistory() {
    const history = await loadHistory();

    let body = '';
    if (!history.length) {
        body = `<div class="history-empty">Пока нет ни одной попытки для ${langShort(currentLanguage)} ${currentLevel}.</div>`;
    } else {
        const rows = history.map((rec, i) => {
            const total = rec.total || 0;
            const pct = (n) => total ? Math.round(n / total * 100) : 0;
            return `
                <tr data-index="${i}" class="history-row">
                    <td>${rec.date}</td>
                    <td class="ok">${rec.correct} (${pct(rec.correct)}%)</td>
                    <td class="close">${rec.close} (${pct(rec.close)}%)</td>
                    <td class="wrong">${rec.wrong} (${pct(rec.wrong)}%)</td>
                </tr>
            `;
        }).join('');

        body = `
            <table class="history-table">
                <thead>
                    <tr>
                        <th class="col-date">Дата и время</th>
                        <th class="col-num">Правильно</th>
                        <th class="col-num">Недочёты</th>
                        <th class="col-num">Ошибки</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        `;
    }

    view.innerHTML = `
        <div class="history-area">
            ${body}
        </div>
    `;

    view.querySelectorAll('.history-row').forEach(row => {
        row.addEventListener('click', () => {
            const idx = Number(row.dataset.index);
            showHistoryEntry(idx);
        });
    });

    updateHeader();
}

/* ===== Просмотр одной попытки из истории ===== */
async function showHistoryEntry(historyIndex) {
    const history = await loadHistory();
    const rec = history[historyIndex];
    if (!rec) { renderHistory(); return; }

    const snap = sessionSnapshots.find(s =>
        s.lang === currentLanguage &&
        s.level === currentLevel &&
        s.date === rec.date
    );

    if (!snap) {
        const total = rec.total || 0;
        const pct = (n) => total ? Math.round(n / total * 100) : 0;
        view.innerHTML = `
            <div class="results-area">
                <div class="results-summary">
                    <span class="pill total">${rec.date} · ${rec.total}</span>
                    <span class="pill green">${rec.correct} · ${pct(rec.correct)}%</span>
                    <span class="pill orange">${rec.close} · ${pct(rec.close)}%</span>
                    <span class="pill red">${rec.wrong} · ${pct(rec.wrong)}%</span>
                </div>
                <div class="history-empty" style="margin-top:1em">Детали попытки недоступны — страница была перезагружена.</div>
            </div>
        `;
        updateHeader();
        return;
    }

    let correct = 0, close = 0, wrong = 0;

    const rows = snap.items.map(it => {
        const userAns = it.userAnswer || '';
        const lang = snap.lang;
        const cleaned = userAns.replace(/\*/g, '');
        const u = normalize(cleaned, lang);
        const c = normalize(it.en, lang);
        let verdict;
        if (!u) verdict = 'wrong';
        else if (u === c) verdict = 'correct';
        else {
            const dist = levenshtein(u, c);
            const allowed = Math.max(1, Math.round(c.length * 0.1));
            verdict = dist <= allowed ? 'close' : 'wrong';
        }

        if (verdict === 'correct') correct++;
        else if (verdict === 'close') close++;
        else wrong++;

        const displayUserRaw = userAns.replace(/\*/g, '').trim();
        const displayUser = displayUserRaw ? displayUserRaw : '—';
        const userCls = displayUserRaw ? verdict : 'empty';

        return `
            <tr>
                <td>${it.ru}</td>
                <td class="${userCls}">${displayUser}</td>
                <td class="answer-ok">${it.en}</td>
            </tr>
        `;
    }).join('');

    const total = snap.items.length;
    const pct = (n) => total ? Math.round(n / total * 100) : 0;

    view.innerHTML = `
        <div class="results-area">
            <div class="results-summary">
                <span class="pill total">${snap.date} · ${total}</span>
                <span class="pill green">${correct} · ${pct(correct)}%</span>
                <span class="pill orange">${close} · ${pct(close)}%</span>
                <span class="pill red">${wrong} · ${pct(wrong)}%</span>
            </div>

            <table class="results-table">
                <thead>
                    <tr>
                        <th>Значение</th>
                        <th>Ваш ответ</th>
                        <th>Правильный ответ</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    `;

    updateHeader();
}

/* ===== Аутентификация ===== */
async function initAuth() {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session?.user || null;

    sb.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;

        if (event === 'PASSWORD_RECOVERY') {
            resetMode = 'update';
            resetEmail.value = session?.user?.email || '';
            resetEmail.disabled = true;
            resetNewPassword.value = '';
            resetNewPassword.style.display = '';
            resetError.textContent = '';
            resetHint.textContent = 'Задайте новый пароль для аккаунта.';
            resetSubmit.textContent = 'Сохранить пароль';
            resetOverlay.classList.add('open');
            setTimeout(() => resetNewPassword.focus(), 50);
        }

        if (screen === 'settings') renderSettings();
        updateHeader();
    });
}

function openAuthModal(mode) {
    authMode = mode;
    authTitle.textContent = mode === 'login' ? 'Вход' : 'Регистрация';
    authSubmit.textContent = mode === 'login' ? 'Войти' : 'Зарегистрироваться';
    authError.textContent = '';
    authEmail.value = '';
    authPassword.value = '';
    authOverlay.classList.add('open');
    setTimeout(() => authEmail.focus(), 50);
}

function closeAuthModal() {
    authOverlay.classList.remove('open');
}

async function submitAuth() {
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
        authError.textContent = 'Заполните email и пароль';
        return;
    }
    if (password.length < 6) {
        authError.textContent = 'Пароль минимум 6 символов';
        return;
    }

    authSubmit.disabled = true;
    authError.textContent = '';

    try {
        if (authMode === 'login') {
            const { error } = await sb.auth.signInWithPassword({ email, password });
            if (error) { authError.textContent = error.message; return; }
        } else {
            const { data, error } = await sb.auth.signUp({ email, password });
            if (error) { authError.textContent = error.message; return; }
            if (data.user && !data.session) {
                authError.textContent = 'Проверьте почту для подтверждения.';
                return;
            }
        }
        closeAuthModal();
    } finally {
        authSubmit.disabled = false;
    }
}

async function signOut() {
    const ok = confirm('Выйти из аккаунта?');
    if (!ok) return;

    await sb.auth.signOut();
    currentUser = null;
    closeAuthModal();
    if (screen === 'settings') renderSettings();
    updateHeader();
}

/* ===== Восстановление пароля ===== */
function openResetModal() {
    resetMode = 'send';
    resetEmail.value = '';
    resetEmail.disabled = false;
    resetNewPassword.value = '';
    resetNewPassword.style.display = 'none';
    resetError.textContent = '';
    resetHint.textContent = 'Мы отправим ссылку на вашу почту. Перейдите по ней — и задайте новый пароль.';
    resetSubmit.textContent = 'Отправить ссылку';
    resetOverlay.classList.add('open');
    setTimeout(() => resetEmail.focus(), 50);
}

function closeResetModal() {
    resetOverlay.classList.remove('open');
}

async function submitReset() {
    resetError.textContent = '';

    if (resetMode === 'send') {
        const email = resetEmail.value.trim();
        if (!email) { resetError.textContent = 'Введите email'; return; }

        resetSubmit.disabled = true;
        try {
            const { error } = await sb.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + window.location.pathname
            });
            if (error) { resetError.textContent = error.message; return; }
            resetHint.textContent = 'Ссылка отправлена. Проверьте почту.';
            resetEmail.disabled = true;
        } finally {
            resetSubmit.disabled = false;
        }
    } else {
        const pwd = resetNewPassword.value;
        if (!pwd || pwd.length < 6) {
            resetError.textContent = 'Пароль минимум 6 символов';
            return;
        }
        resetSubmit.disabled = true;
        try {
            const { error } = await sb.auth.updateUser({ password: pwd });
            if (error) { resetError.textContent = error.message; return; }
            closeResetModal();
            alert('Пароль обновлён.');
        } finally {
            resetSubmit.disabled = false;
        }
    }
}

/* Обработчики модальных окон */
loginBtn.addEventListener('click', () => openAuthModal('login'));
signupBtn.addEventListener('click', () => openAuthModal('signup'));
authCancel.addEventListener('click', closeAuthModal);
authSubmit.addEventListener('click', submitAuth);
authForgot.addEventListener('click', openResetModal);

authOverlay.addEventListener('click', (e) => {
    if (e.target === authOverlay) closeAuthModal();
});
authPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitAuth();
});
authEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') authPassword.focus();
});

resetCancel.addEventListener('click', closeResetModal);
resetSubmit.addEventListener('click', submitReset);
resetOverlay.addEventListener('click', (e) => {
    if (e.target === resetOverlay) closeResetModal();
});
resetEmail.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && resetMode === 'send') submitReset();
});
resetNewPassword.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && resetMode === 'update') submitReset();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (authOverlay.classList.contains('open')) closeAuthModal();
        if (resetOverlay.classList.contains('open')) closeResetModal();
    }
});

/* ===== Настройки ===== */
function renderSettings() {
    const hintsOn  = loadHints();
    const lengthOn = loadLength();
    const voiceOn  = loadVoice();

    view.innerHTML = `
        <div class="settings-area">
            <h1 class="settings-title">Настройки</h1>

            <div class="settings-row" id="rowCheckMode">
                <span>Режим проверки</span>
                <button class="size-btn" id="checkModeBtn">${checkModeLabel(checkMode)}</button>
            </div>

            <div class="settings-row" id="rowHints">
                <label class="switch">
                    <input type="checkbox" id="hintsToggle" ${hintsOn ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                </label>
                <span>Показывать первую букву</span>
            </div>

            <div class="settings-row" id="rowLength">
                <label class="switch">
                    <input type="checkbox" id="lengthToggle" ${lengthOn ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                </label>
                <span>Показывать длину слова</span>
            </div>

            <div class="settings-row" id="rowVoice">
                <label class="switch">
                    <input type="checkbox" id="voiceToggle" ${voiceOn ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                </label>
                <span>Озвучивать слова</span>
            </div>

            <div class="settings-row" id="rowSize">
                <span>Слов за тренировку</span>
                <button class="size-btn" id="sizeBtn">${sessionSize}</button>
            </div>

            <div class="settings-row" id="rowTime">
                <span>Время на запоминание</span>
                <button class="size-btn" id="timeBtn">${timeLabel(sessionTime)}</button>
            </div>
        </div>
    `;

    const switchCheckMode = () => {
        checkMode = (checkMode === 'all') ? 'one' : 'all';
        saveCheckMode(checkMode);
        renderSettings();
    };
    document.getElementById('rowCheckMode').addEventListener('click', (e) => {
        if (e.target.closest('.size-btn')) return;
        switchCheckMode();
    });
    document.getElementById('checkModeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        switchCheckMode();
    });

    document.getElementById('rowHints').addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return;
        const input = document.getElementById('hintsToggle');
        input.checked = !input.checked;
        saveHints(input.checked);
    });
    document.getElementById('hintsToggle').addEventListener('change', (e) => {
        saveHints(e.target.checked);
    });

    document.getElementById('rowLength').addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return;
        const input = document.getElementById('lengthToggle');
        input.checked = !input.checked;
        saveLength(input.checked);
    });
    document.getElementById('lengthToggle').addEventListener('change', (e) => {
        saveLength(e.target.checked);
    });

    document.getElementById('rowVoice').addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return;
        const input = document.getElementById('voiceToggle');
        input.checked = !input.checked;
        saveVoice(input.checked);
    });
    document.getElementById('voiceToggle').addEventListener('change', (e) => {
        saveVoice(e.target.checked);
    });

    const nextSize = () => {
        sessionSize = (sessionSize === 20) ? 40 :
                      (sessionSize === 40) ? 60 : 20;
        saveSessionSize(sessionSize);
        renderSettings();
    };
    document.getElementById('rowSize').addEventListener('click', (e) => {
        if (e.target.closest('.size-btn')) return;
        nextSize();
    });
    document.getElementById('sizeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        nextSize();
    });

    const nextTime = () => {
        sessionTime = (sessionTime === 60)  ? 120 :
                      (sessionTime === 120) ? 180 :
                      (sessionTime === 180) ? 0   : 60;
        saveSessionTime(sessionTime);
        renderSettings();
    };
    document.getElementById('rowTime').addEventListener('click', (e) => {
        if (e.target.closest('.size-btn')) return;
        nextTime();
    });
    document.getElementById('timeBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        nextTime();
    });

    const settingsArea = view.querySelector('.settings-area');

    const resetRow = document.createElement('div');
    resetRow.className = 'settings-row';
    resetRow.id = 'rowReset';
    resetRow.style.cursor = 'pointer';
    resetRow.innerHTML = `
        <span>Сбросить прогресс</span>
        <span style="margin-left:auto;display:inline-flex;gap:0.4em;align-items:center;">
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:80px;height:24px;padding:0 0.6em;border-radius:4px;background:${langColor(currentLanguage)};color:#fff;font-size:12px;font-weight:700;">${langLabel(currentLanguage)}</span>
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:24px;padding:0 0.5em;border-radius:4px;background:${levelColors[currentLevel] || '#e0e0e0'};color:${currentLevel === 'B1' ? '#000' : '#fff'};font-size:12px;font-weight:700;">${currentLevel}</span>
        </span>
    `;
    resetRow.addEventListener('click', async () => {
        const ok = confirm(
            `Сбросить прогресс для ${langLabel(currentLanguage)} ${currentLevel}?\n\n` +
            `Все выученные слова этого уровня будут забыты.\n` +
            `История попыток сохранится.`
        );
        if (!ok) return;

        await resetProgress();
        await updateProgressBar();
        alert('Прогресс сброшен.');
        renderSettings();
    });
    settingsArea.appendChild(resetRow);

    const resetAllRow = document.createElement('div');
    resetAllRow.className = 'settings-row';
    resetAllRow.id = 'rowResetAll';
    resetAllRow.style.cursor = 'pointer';
    resetAllRow.innerHTML = `
        <span style="color:#c0392b;">Сбросить весь прогресс</span>
        <span style="margin-left:auto;font-size:13px;color:#c0392b;font-weight:600;">Все языки, все уровни</span>
    `;
    resetAllRow.addEventListener('click', async () => {
        const ok = confirm(
            `Сбросить весь прогресс?\n\n` +
            `Все выученные слова по всем языкам и уровням будут забыты.\n` +
            `История попыток сохранится.\n\n` +
            `Действие нельзя отменить.`
        );
        if (!ok) return;

        await resetAllProgress();
        await updateProgressBar();
        alert('Весь прогресс сброшен.');
        renderSettings();
    });
    settingsArea.appendChild(resetAllRow);

    if (currentUser) {
        const logoutRow = document.createElement('div');
        logoutRow.className = 'settings-row';
        logoutRow.id = 'rowLogout';
        logoutRow.style.cursor = 'pointer';
        logoutRow.innerHTML = `
            <span>Выйти из аккаунта</span>
            <span style="margin-left:auto;font-size:13px;color:#777;max-width:160px;overflow:hidden;text-overflow:ellipsis;">${currentUser.email}</span>
        `;
        logoutRow.addEventListener('click', signOut);
        settingsArea.appendChild(logoutRow);
    }

    updateHeader();
}

/* ===== Авто-уменьшение шрифта ===== */
function fitFontSize(el, max, min) {
    if (!el) return;
    let size = max;
    el.style.fontSize = size + 'px';
    let guard = 0;
    while (
        size > min &&
        (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) &&
        guard < 80
    ) {
        size -= 1;
        el.style.fontSize = size + 'px';
        guard++;
    }
}

/* ===== Кнопка Домой ===== */
document.getElementById('homeBtn').addEventListener('click', (e) => {
    e.preventDefault();
    stopTimer();
    screen = 'home';
    renderHome();
});

/* ===== Кнопка «Результаты» ===== */
historyBtn.addEventListener('click', () => {
    if (screen === 'history' || screen === 'history-entry') {
        screen = 'home';
        renderHome();
    } else {
        stopTimer();
        screen = 'history';
        renderHistory();
    }
});

/* ===== Кнопка «Настройки» ===== */
settingsBtn.addEventListener('click', () => {
    if (screen === 'settings') {
        screen = 'home';
        renderHome();
    } else {
        stopTimer();
        screen = 'settings';
        renderSettings();
    }
});

/* ===== Завершить / Продолжить ===== */
finishBtn.addEventListener('click', async () => {
    if (screen === 'train') { goToCheck(); return; }

    if (screen === 'check' && checkPhase === 'input') {
        if (checkMode === 'one') saveOneInput();

        checkPhase = 'result';

        if (checkMode === 'one') {
            renderCheckOne();
        } else {
            renderCheckAll();
        }
        updateHeader();
        return;
    }

    if (screen === 'check' && checkPhase === 'result') {
        let correct = 0, close = 0, wrong = 0;
        sessionWords.forEach((item, i) => {
            const v = evaluate(userAnswers[i] || '', item.en);
            if (v === 'correct') correct++;
            else if (v === 'close') close++;
            else wrong++;
        });

        const total = sessionWords.length;

        if (wrong === total) {
            screen = 'results';
            renderResults();
            return;
        }

        await commitProgress();

        const now = new Date();
        const dateStr = now.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        await pushHistory({ date: dateStr, correct, close, wrong, total });

        sessionSnapshots.unshift({
            lang: currentLanguage,
            level: currentLevel,
            date: dateStr,
            correct, close, wrong, total,
            items: sessionWords.map((item, i) => ({
                ru: item.ru,
                en: item.en,
                userAnswer: userAnswers[i] || ''
            }))
        });

        screen = 'results';
        renderResults();
        return;
    }

    if (screen === 'results') {
        screen = 'home';
        renderHome();
    }
});

/* ===== Глобальные клавиши ===== */
document.addEventListener('keydown', handleTrainKeys);
document.addEventListener('keydown', handleCheckOneKey);

/* ===== Мобильная клавиатура: поднять контент ===== */
(function setupVisualViewport() {
    if (!window.visualViewport) return;

    const root = document.documentElement;
    const stage = document.querySelector('.stage');
    const wrapper = document.querySelector('.wrapper');

    const update = () => {
        const vv = window.visualViewport;
        const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        root.style.setProperty('--keyboard-offset', hidden + 'px');

        if (hidden > 50) {
            stage.style.height = vv.height + 'px';
            stage.style.minHeight = '0';
            stage.style.overflow = 'hidden';
            wrapper.style.overflowY = 'auto';
            wrapper.style.paddingBottom = '0.5em';
        } else {
            stage.style.height = '';
            stage.style.minHeight = '';
            stage.style.overflow = '';
            wrapper.style.overflowY = '';
            wrapper.style.paddingBottom = '';
        }
    };

    window.visualViewport.addEventListener('resize', update);
    window.visualViewport.addEventListener('scroll', update);
    update();
})();

/* ===== Старт ===== */
window.addEventListener('DOMContentLoaded', async () => {
    updateCheckCols();
    await initAuth();
    renderHome();

    if ('speechSynthesis' in window) {
        window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
            window.speechSynthesis.getVoices();
        };
    }
});

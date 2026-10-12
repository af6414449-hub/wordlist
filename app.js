/* Wordlist — логика приложения.
   Зависит от a1.js, a2.js, b1.js, b2.js (англ.),
   ge_a1.js (нем.), tr_b2.js (тур.). */

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
    return 'all';
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

function levelIconLabel() {
    return langShort(currentLanguage) + ' ' + currentLevel;
}

let sessionWords = [];
let userAnswers  = [];

const view          = document.getElementById('view');
const trainSlot     = document.getElementById('trainSlot');
const finishBtn     = document.getElementById('finishBtn');
const timerWrap     = document.getElementById('timerWrap');
const timerValue    = document.getElementById('timerValue');
const historyBtn    = document.getElementById('historyBtn');
const settingsBtn   = document.getElementById('settingsBtn');
const topbarInner   = document.querySelector('.topbar-inner');
const progressWrap  = document.getElementById('progressWrap');
const progressFill  = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');
const homeLevelIcon = document.getElementById('homeLevelIcon');
const levelsTabs    = document.getElementById('levelsTabs');

/* ===== Настройки подсказок ===== */
const HINTS_KEY  = 'wordlist_hints';
const LENGTH_KEY = 'wordlist_length';

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

/* ===== Прогресс ===== */
function progressKey() { return 'wordlist_progress_' + storageLevelKey(); }

function loadProgress() {
    try {
        const raw = localStorage.getItem(progressKey());
        if (!raw) return { learned: [] };
        const obj = JSON.parse(raw);
        return { learned: Array.isArray(obj.learned) ? obj.learned : [] };
    } catch (_) {
        return { learned: [] };
    }
}
function saveProgress(progress) {
    try { localStorage.setItem(progressKey(), JSON.stringify(progress)); } catch (_) {}
}
function resetProgress() {
    try { localStorage.removeItem(progressKey()); } catch (_) {}
}

/* ===== История ===== */
function historyKey() { return 'wordlist_history_' + storageLevelKey(); }

function loadHistory() {
    try {
        const raw = localStorage.getItem(historyKey());
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}
function saveHistory(list) {
    try {
        localStorage.setItem(historyKey(), JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (_) {}
}
function pushHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    saveHistory(list.slice(0, HISTORY_MAX));
}

/* ===== Шапка ===== */
function updateHeader() {
    historyBtn.classList.toggle('active', screen === 'history' || screen === 'history-entry');
    settingsBtn.classList.toggle('active', screen === 'settings');

    topbarInner.classList.toggle('mode-home',
        screen === 'home' || screen === 'history' || screen === 'history-entry' || screen === 'settings');
    topbarInner.classList.toggle('mode-train',
        screen === 'train' || screen === 'check' || screen === 'results');

    trainSlot.style.display = (screen === 'train' || screen === 'check' || screen === 'results') ? 'flex' : 'none';

    const showTimer = (screen === 'train') && sessionTime > 0;
    timerWrap.style.display = showTimer ? '' : 'none';

    progressWrap.style.display = (screen === 'home') ? 'flex' : 'none';
    levelsTabs.style.display   = (screen === 'history' || screen === 'history-entry') ? 'flex' : 'none';

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

/* ===== Прогресс-бар + иконка уровня ===== */
function updateProgressBar() {
    const bank = getBank(currentLevel) || [];
    const total = bank.length;
    const prog = loadProgress();
    const learned = prog.learned.length;

    const pct = total ? Math.round(learned / total * 100) : 0;

    progressFill.style.width = pct + '%';
    progressCount.textContent = `${learned} / ${total}`;

    const color = levelColors[currentLevel] || '#e0e0e0';
    homeLevelIcon.textContent = levelIconLabel();
    homeLevelIcon.dataset.level = currentLevel;
    homeLevelIcon.style.background = color;
}

/* ===== Кнопки уровней в шапке истории ===== */
function renderLevelTabs() {
    const enabled = levels.filter(l => l.enabled && hasBank(l.code));

    levelsTabs.innerHTML = enabled.map(lvl => {
        const color = levelColors[lvl.code] || '#e0e0e0';
        const isActive = lvl.code === currentLevel;
        const cls = isActive ? 'level-tab active' : 'level-tab';
        const style = isActive ? `background:${color};` : '';
        return `<button class="${cls}" data-level="${lvl.code}" style="${style}">${lvl.code}</button>`;
    }).join('');

    levelsTabs.querySelectorAll('.level-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const lvl = tab.dataset.level;
            if (lvl === currentLevel) return;
            currentLevel = lvl;
            renderLevelTabs();
            updateProgressBar();
            if (screen === 'history') renderHistory();
            if (screen === 'history-entry') { screen = 'history'; renderHistory(); }
        });
    });
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
            <button class="${startCls}" id="startBtn">
                Начать тренировку
            </button>
        </div>
    `;

    view.querySelectorAll('.level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            const lvl = btn.dataset.level;
            if (lvl === currentLevel) return;
            currentLevel = lvl;
            renderHome();
            updateProgressBar();
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
}

/* ===== Старт сессии ===== */
function startSession() {
    const bank = getBank(currentLevel);
    if (!bank || !bank.length) {
        alert('База для уровня ' + currentLevel + ' на этом языке ещё не подключена.');
        return;
    }

    const size = sessionSize;

    const prog = loadProgress();
    const learnedSet = new Set(prog.learned);

    let fresh = bank.filter(w => !learnedSet.has(w.en));
    if (fresh.length < size) {
        resetProgress();
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
        if (currentPerson < sessionWords.length - 1) {
            currentPerson++;
            updateTrainCard();
        } else {
            goToCheck();
        }
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

    updateThumbsActive();
    ensureThumbVisible();
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
        if (currentPerson >= sessionWords.length - 1) return;
        currentPerson++;
        renderCheckOne();
        updateHeader();
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
    }

    ensureThumbVisible();
}

/* Сохранить текущее значение большого поля в userAnswers */
function saveOneInput() {
    const inp = document.getElementById('oneInput');
    if (inp) userAnswers[currentPerson] = inp.value;
}

/* ===== Режим подсказки (общий для сетки и одиночного) ===== */
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
function commitProgress() {
    const prog = loadProgress();
    const learnedSet = new Set(prog.learned);

    sessionWords.forEach((item, i) => {
        const verdict = evaluate(userAnswers[i] || '', item.en);
        if (verdict === 'correct') learnedSet.add(item.en);
    });

    prog.learned = Array.from(learnedSet);
    saveProgress(prog);
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
function renderHistory() {
    renderLevelTabs();

    const history = loadHistory();

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
function showHistoryEntry(historyIndex) {
    const history = loadHistory();
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

/* ===== Настройки ===== */
function renderSettings() {
    const hintsOn  = loadHints();
    const lengthOn = loadLength();

    view.innerHTML = `
        <div class="settings-area">
            <h1 class="settings-title">Настройки</h1>

            <div class="settings-row" id="rowLang">
                <span>Язык</span>
                <button class="size-btn" id="langBtn">${langLabel(currentLanguage)}</button>
            </div>

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

    /* Язык */
    const switchLang = () => {
        currentLanguage = nextLang(currentLanguage);
        saveLang(currentLanguage);
        renderSettings();
    };
    document.getElementById('rowLang').addEventListener('click', (e) => {
        if (e.target.closest('.size-btn')) return;
        switchLang();
    });
    document.getElementById('langBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        switchLang();
    });

    /* Режим проверки */
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

    /* Первая буква */
    document.getElementById('rowHints').addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return;
        const input = document.getElementById('hintsToggle');
        input.checked = !input.checked;
        saveHints(input.checked);
    });
    document.getElementById('hintsToggle').addEventListener('change', (e) => {
        saveHints(e.target.checked);
    });

    /* Длина слова */
    document.getElementById('rowLength').addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return;
        const input = document.getElementById('lengthToggle');
        input.checked = !input.checked;
        saveLength(input.checked);
    });
    document.getElementById('lengthToggle').addEventListener('change', (e) => {
        saveLength(e.target.checked);
    });

    /* Размер */
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

    /* Время */
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
finishBtn.addEventListener('click', () => {
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

        commitProgress();

        const now = new Date();
        const dateStr = now.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        pushHistory({ date: dateStr, correct, close, wrong, total });

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

/* ===== Старт ===== */
window.addEventListener('DOMContentLoaded', () => {
    updateCheckCols();
    renderHome();
});

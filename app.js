/* Wordlist — логика приложения.
   Зависит от a1.js (WORDS_A1), a2.js (WORDS_A2), b1.js (WORDS_B1), b2.js (WORDS_B2). */

/* ===== Состояние ===== */
let currentLevel = 'A1';
let screen = 'home';           // 'home' | 'train' | 'check' | 'results' | 'history' | 'settings'
let checkPhase = 'input';
let currentPerson = 0;

const TRAIN_SECONDS = 60;
const HISTORY_MAX   = 20;
let CHECK_COLS = 5;

let timerRemaining = TRAIN_SECONDS;
let timerInterval  = null;

/* ===== Размер сессии (20 / 40 / 60) ===== */
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

function sizeToSeconds(n) {
    if (n === 40) return 120;
    if (n === 60) return 180;
    return 60;
}

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
    A1: typeof WORDS_A1 !== 'undefined' ? WORDS_A1 : null,
    A2: typeof WORDS_A2 !== 'undefined' ? WORDS_A2 : null,
    B1: typeof WORDS_B1 !== 'undefined' ? WORDS_B1 : null,
    B2: typeof WORDS_B2 !== 'undefined' ? WORDS_B2 : null,
};

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
const progressBadge = document.getElementById('progressBadge');
const levelsTabs    = document.getElementById('levelsTabs');

/* ===== Настройки подсказки ===== */
const HINTS_KEY = 'wordlist_hints';

function loadHints() {
    try { return localStorage.getItem(HINTS_KEY) === '1'; }
    catch (_) { return false; }
}
function saveHints(on) {
    try { localStorage.setItem(HINTS_KEY, on ? '1' : '0'); } catch (_) {}
}

/* ===== Утилиты ===== */
function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function normalize(s) {
    return (s || '')
        .toLowerCase()
        .replace(/\b(to|the)\b/g, '')
        .replace(/[^a-z]/g, '');
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
    const u = normalize(userAnswer);
    const c = normalize(correctAnswer);
    if (!u) return 'wrong';
    if (u === c) return 'correct';
    const dist = levenshtein(u, c);
    const allowed = Math.max(1, Math.round(c.length * 0.1));
    return dist <= allowed ? 'close' : 'wrong';
}

function updateCheckCols() {
    CHECK_COLS = (window.innerWidth <= 560) ? 3 : 5;
}

/* Подсказка */
function buildHint(correctAnswer) {
    const s = correctAnswer || '';
    if (!s) return '';
    if (s.startsWith('to ') && s.length > 3)  return 'to ' + s[3];
    if (s.startsWith('the ') && s.length > 4) return 'the ' + s[4];
    return s[0] || '';
}

/* ===== Прогресс ===== */
function progressKey(level) { return 'wordlist_progress_' + level; }

function loadProgress(level) {
    try {
        const raw = localStorage.getItem(progressKey(level));
        if (!raw) return { learned: [] };
        const obj = JSON.parse(raw);
        return { learned: Array.isArray(obj.learned) ? obj.learned : [] };
    } catch (_) {
        return { learned: [] };
    }
}

function saveProgress(level, progress) {
    try { localStorage.setItem(progressKey(level), JSON.stringify(progress)); } catch (_) {}
}

function resetProgress(level) {
    try { localStorage.removeItem(progressKey(level)); } catch (_) {}
}

/* ===== История ===== */
function historyKey(level) { return 'wordlist_history_' + level; }

function loadHistory(level) {
    try {
        const raw = localStorage.getItem(historyKey(level));
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function saveHistory(level, list) {
    try {
        localStorage.setItem(historyKey(level), JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (_) {}
}

function pushHistory(level, entry) {
    const list = loadHistory(level);
    list.unshift(entry);
    saveHistory(level, list.slice(0, HISTORY_MAX));
}

/* ===== Шапка ===== */
function updateHeader() {
    historyBtn.classList.toggle('active', screen === 'history');
    settingsBtn.classList.toggle('active', screen === 'settings');

    topbarInner.classList.toggle('mode-home',  screen === 'home' || screen === 'history' || screen === 'settings');
    topbarInner.classList.toggle('mode-train', screen === 'train' || screen === 'check' || screen === 'results');

    trainSlot.style.display = (screen === 'train' || screen === 'check' || screen === 'results') ? 'flex' : 'none';

    const showTimer = (screen === 'train');
    timerWrap.style.display = showTimer ? '' : 'none';

    progressWrap.style.display = (screen === 'home') ? 'flex' : 'none';
    levelsTabs.style.display   = (screen === 'history') ? 'flex' : 'none';

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
    timerRemaining = sizeToSeconds(sessionSize);
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
    const bank = BANKS[currentLevel] || [];
    const total = bank.length;
    const prog = loadProgress(currentLevel);
    const learned = prog.learned.length;

    const pct = total ? Math.round(learned / total * 100) : 0;

    progressFill.style.width = pct + '%';
    progressCount.textContent = `${learned} / ${total}`;

    const color = levelColors[currentLevel] || '#e0e0e0';
    progressBadge.textContent = currentLevel;
    progressBadge.dataset.level = currentLevel;
    progressBadge.style.background = color;
}

/* ===== Кнопки уровней в шапке истории ===== */
function renderLevelTabs() {
    const enabled = levels.filter(l => l.enabled);

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
            if (screen === 'history') renderHistory();
        });
    });
}

/* ===== Главный экран ===== */
function renderHome() {
    const levelsHtml = levels.map(lvl => {
        const hasBank = !!BANKS[lvl.code];
        const isActive = lvl.code === currentLevel && hasBank;

        let cls = 'level-btn';
        let style = '';

        if (!hasBank) {
            cls += ' disabled';
        } else if (isActive) {
            cls += ' active';
            style = `background:${levelColors[lvl.code] || '#e0e0e0'};`;
        }

        const disabled = hasBank ? '' : 'disabled';
        return `<button class="${cls}" data-level="${lvl.code}" style="${style}" ${disabled}>${lvl.code}</button>`;
    }).join('');

    const hasBank = !!BANKS[currentLevel];
    const startCls = hasBank ? 'start-btn' : 'start-btn disabled';

    view.innerHTML = `
        <div class="home-layout">
            <div class="levels-grid">${levelsHtml}</div>
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
        if (!BANKS[currentLevel]) {
            alert('База для уровня ' + currentLevel + ' ещё не подключена.');
            return;
        }
        startSession();
    });

    updateHeader();
}

/* ===== Старт сессии ===== */
function startSession() {
    const bank = BANKS[currentLevel];
    if (!bank || !bank.length) {
        alert('База для уровня ' + currentLevel + ' ещё не подключена.');
        return;
    }

    const size = sessionSize;

    const prog = loadProgress(currentLevel);
    const learnedSet = new Set(prog.learned);

    let fresh = bank.filter(w => !learnedSet.has(w.en));
    if (fresh.length < size) {
        resetProgress(currentLevel);
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

    const btnFirst = document.getElementById('btnFirst');
    const btnPrev  = document.getElementById('btnPrev');
    const btnNext  = document.getElementById('btnNext');
    const faceSquare = document.getElementById('faceSquare');

    btnFirst.addEventListener('click', () => {
        currentPerson = 0;
        updateTrainCard();
    });
    btnPrev.addEventListener('click', () => {
        currentPerson = Math.max(0, currentPerson - 1);
        updateTrainCard();
    });
    btnNext.addEventListener('click', () => {
        if (currentPerson >= sessionWords.length - 1) {
            goToCheck();
            return;
        }
        currentPerson++;
        updateTrainCard();
    });
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

    fs.textContent = w.ru;
    np.innerHTML = `${w.en} <span style="font-size:0.7em;opacity:0.65">(${w.pos})</span>`;

    fitFontSize(fs, 40, 14);
    fitFontSize(np, 38, 12);

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

    const hintsOn = loadHints();
    userAnswers = sessionWords.map(item => {
        if (hintsOn) return buildHint(item.en);
        return '';
    });

    currentPerson = 0;
    renderCheck();
}

/* ===== Экран проверки ===== */
function renderCheck() {
    const cellsHtml = sessionWords.map((item, i) => {
        const answer = userAnswers[i] || '';
        const cls = ['check-input'];

        if (checkPhase === 'result') {
            cls.push(evaluate(answer, item.en));
        }

        const disabled = (checkPhase === 'result') ? 'disabled' : '';
        const current  = (i === currentPerson && checkPhase === 'input') ? ' current' : '';

        return `
            <div class="check-cell${current}" data-index="${i}">
                <div class="check-img">${item.ru}</div>
                <input
                    class="${cls.join(' ')}"
                    type="text"
                    value="${answer.replace(/"/g, '&quot;')}"
                    data-index="${i}"
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
        });
    }

    updateHeader();
}

function handleCheckKey(e) {
    if (checkPhase !== 'input') return;

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
    const el = view.querySelector(`.check-input[data-index="${currentPerson}"]`);
    if (!el) return;

    try {
        el.focus({ preventScroll: true });
    } catch (_) {
        el.focus();
    }

    const val = el.value;
    try { el.setSelectionRange(val.length, val.length); } catch (_) {}

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
    const prog = loadProgress(currentLevel);
    const learnedSet = new Set(prog.learned);

    sessionWords.forEach((item, i) => {
        const verdict = evaluate(userAnswers[i] || '', item.en);
        if (verdict === 'correct') learnedSet.add(item.en);
    });

    prog.learned = Array.from(learnedSet);
    saveProgress(currentLevel, prog);
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

        const displayUser = userAns.trim() ? userAns : '—';
        const userCls = userAns.trim() ? verdict : 'empty';

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
                <span class="pill total">${currentLevel} · ${total}</span>
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

    const history = loadHistory(currentLevel);

    let body = '';
    if (!history.length) {
        body = `<div class="history-empty">Пока нет ни одной попытки для уровня ${currentLevel}.</div>`;
    } else {
        const rows = history.map(rec => {
            const total = rec.total || 0;
            const pct = (n) => total ? Math.round(n / total * 100) : 0;
            return `
                <tr>
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

    updateHeader();
}

/* ===== Настройки ===== */
function renderSettings() {
    const hintsOn = loadHints();

    view.innerHTML = `
        <div class="settings-area">
            <h1 class="settings-title">Настройки</h1>

            <div class="settings-row">
                <label class="switch">
                    <input type="checkbox" id="hintsToggle" ${hintsOn ? 'checked' : ''}>
                    <span class="switch-slider"></span>
                </label>
                <span>Подсказка</span>
            </div>

            <div class="settings-row" style="margin-top: 0.75em">
                <span>Слов за тренировку</span>
                <button class="size-btn" id="sizeBtn">${sessionSize}</button>
            </div>
        </div>
    `;

    document.getElementById('hintsToggle').addEventListener('change', (e) => {
        saveHints(e.target.checked);
    });

    document.getElementById('sizeBtn').addEventListener('click', () => {
        sessionSize = (sessionSize === 20) ? 40 :
                      (sessionSize === 40) ? 60 : 20;
        saveSessionSize(sessionSize);
        renderSettings();
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
    if (screen === 'history') {
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
        checkPhase = 'result';
        renderCheck();
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
        pushHistory(currentLevel, { date: dateStr, correct, close, wrong, total });

        screen = 'results';
        renderResults();
        return;
    }

    if (screen === 'results') {
        screen = 'home';
        renderHome();
        return;
    }
});

/* ===== Глобальные клавиши ===== */
document.addEventListener('keydown', handleTrainKeys);

/* ===== Старт ===== */
window.addEventListener('DOMContentLoaded', () => {
    updateCheckCols();
    renderHome();
});

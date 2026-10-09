/* Wordlist — логика приложения.
   Зависит от a1.js (WORDS_A1), a2.js (WORDS_A2), b1.js (WORDS_B1). */

/* ===== Состояние ===== */
let currentLevel = 'A1';
let screen = 'home';
let checkPhase = 'input';
let currentPerson = 0;

const TRAIN_SECONDS = 60;
const SESSION_SIZE  = 20;
const HISTORY_MAX   = 20;

let CHECK_COLS = 5;

let timerRemaining = TRAIN_SECONDS;
let timerInterval  = null;

const levels = [
    { code: 'A1', enabled: true  },
    { code: 'A2', enabled: true  },
    { code: 'B1', enabled: true  },
    { code: 'B2', enabled: false },
    { code: 'C1', enabled: false },
    { code: 'C2', enabled: false },
];

const levelColors = {
    A1: '#e57373',   // красный
    A2: '#e6a23c',   // оранжевый
    B1: '#f5c518',   // жёлтый
    B2: '#e0e0e0', C1: '#e0e0e0', C2: '#e0e0e0',
};

const BANKS = {
    A1: typeof WORDS_A1 !== 'undefined' ? WORDS_A1 : null,
    A2: typeof WORDS_A2 !== 'undefined' ? WORDS_A2 : null,
    B1: typeof WORDS_B1 !== 'undefined' ? WORDS_B1 : null,
};

let sessionWords = [];
let userAnswers  = [];

const view          = document.getElementById('view');
const trainSlot     = document.getElementById('trainSlot');
const finishBtn     = document.getElementById('finishBtn');
const timerWrap     = document.getElementById('timerWrap');
const timerValue    = document.getElementById('timerValue');
const historyBtn    = document.getElementById('historyBtn');
const topbarInner   = document.querySelector('.topbar-inner');

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

/* ===== Прогресс (по уровням) ===== */
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

/* ===== История (по уровням) ===== */
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

    topbarInner.classList.toggle('mode-home',  screen === 'home' || screen === 'history');
    topbarInner.classList.toggle('mode-train', screen === 'train' || screen === 'check' || screen === 'results');

    trainSlot.style.display = (screen === 'train' || screen === 'check' || screen === 'results') ? 'flex' : 'none';

    const showTimer = (screen === 'train');
    timerWrap.style.display = showTimer ? '' : 'none';

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
    timerRemaining = TRAIN_SECONDS;
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

/* ===== Главный экран: сетка кнопок уровней ===== */
function renderHome() {
    const enabled = levels.filter(l => l.enabled);

    const buttonsHtml = enabled.map(lvl => {
        const color = levelColors[lvl.code] || '#e0e0e0';
        const hasBank = !!BANKS[lvl.code];
        const cls = hasBank ? 'level-btn' : 'level-btn disabled';
        return `<button class="${cls}" data-level="${lvl.code}" style="background:${color}">${lvl.code}</button>`;
    }).join('');

    view.innerHTML = `
        <div class="levels-grid">${buttonsHtml}</div>
    `;

    view.querySelectorAll('.level-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const lvl = btn.dataset.level;
            if (!BANKS[lvl]) {
                alert('База для уровня ' + lvl + ' ещё не подключена.');
                return;
            }
            currentLevel = lvl;
            startSession();
        });
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

    const prog = loadProgress(currentLevel);
    const learnedSet = new Set(prog.learned);

    let fresh = bank.filter(w => !learnedSet.has(w.en));
    if (fresh.length < SESSION_SIZE) {
        resetProgress(currentLevel);
        fresh = bank.slice();
    }

    const pool = shuffle(fresh);
    sessionWords = pool.slice(0, SESSION_SIZE);
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
    userAnswers  = sessionWords.map(() => '');
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
                <td class="answer-ok">${item.en} <span style="opacity:0.7;font-size:0.9em">(${item.pos})</span></td>
            </tr>
        `;
    }).join('');

    const total = sessionWords.length;
    const pct = (n) => total ? Math.round(n / total * 100) : 0;

    view.innerHTML = `
        <div class="results-area">
            <div class="results-summary">
                <span class="pill total">Уровень ${currentLevel} — всего: ${total}</span>
                <span class="pill green">Правильно: ${correct} (${pct(correct)}%)</span>
                <span class="pill orange">Недочёты: ${close} (${pct(close)}%)</span>
                <span class="pill red">Ошибки: ${wrong} (${pct(wrong)}%)</span>
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

/* ===== История (по текущему уровню) ===== */
function renderHistory() {
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
            <div class="history-header">
                <span>Уровень ${currentLevel} — последние ${HISTORY_MAX} попыток</span>
                <span style="font-weight:400;color:#777;font-size:13px">
                    Всего сохранено: ${history.length}
                </span>
            </div>
            ${body}
        </div>
    `;

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

/* ===== Завершить / Продолжить ===== */
finishBtn.addEventListener('click', () => {
    if (screen === 'train') { goToCheck(); return; }

    if (screen === 'check' && checkPhase === 'input') {
        checkPhase = 'result';
        renderCheck();
        return;
    }

    if (screen === 'check' && checkPhase === 'result') {
        commitProgress();

        let correct = 0, close = 0, wrong = 0;
        sessionWords.forEach((item, i) => {
            const v = evaluate(userAnswers[i] || '', item.en);
            if (v === 'correct') correct++;
            else if (v === 'close') close++;
            else wrong++;
        });
        const now = new Date();
        const dateStr = now.toLocaleString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        pushHistory(currentLevel, { date: dateStr, correct, close, wrong, total: sessionWords.length });

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

/* Wordlist — логика приложения.
   Зависит от a1.js (массив WORDS_A1). */

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
    { code: 'A2', enabled: false },
    { code: 'B1', enabled: false },
    { code: 'B2', enabled: false },
    { code: 'C1', enabled: false },
    { code: 'C2', enabled: false },
];

const levelColors = {
    A1: '#e57373',
    A2: '#e0e0e0', B1: '#e0e0e0', B2: '#e0e0e0', C1: '#e0e0e0', C2: '#e0e0e0',
};

const BANKS = {
    A1: WORDS_A1,
};

let sessionWords = [];
let userAnswers  = [];

const view          = document.getElementById('view');
const levelsNav     = document.getElementById('levelsNav');
const trainSlot     = document.getElementById('trainSlot');
const finishBtn     = document.getElementById('finishBtn');
const timerWrap     = document.getElementById('timerWrap');
const timerValue    = document.getElementById('timerValue');
const historyBtn    = document.getElementById('historyBtn');
const levelCycleBtn = document.getElementById('levelCycleBtn');
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
function loadHistory() {
    try {
        const raw = localStorage.getItem('wordlist_history');
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (_) {
        return [];
    }
}

function saveHistory(list) {
    try {
        localStorage.setItem('wordlist_history', JSON.stringify(list.slice(0, HISTORY_MAX)));
    } catch (_) {}
}

function pushHistory(entry) {
    const list = loadHistory();
    list.unshift(entry);
    saveHistory(list.slice(0, HISTORY_MAX));
}

/* ===== Уровни ===== */
function renderLevels() {
    levelsNav.innerHTML = levels.map(lvl => {
        const cls   = lvl.enabled ? 'level active' : 'level disabled';
        const attrs = lvl.enabled ? '' : 'disabled';
        return `<button class="${cls}" data-level="${lvl.code}" ${attrs}>${lvl.code}</button>`;
    }).join('');

    levelsNav.querySelectorAll('.level.active').forEach(btn => {
        btn.addEventListener('click', () => {
            currentLevel = btn.dataset.level;
            renderLevels();
            updateLevelCycleBtn();
            if (screen === 'home') renderHome();
        });
    });

    updateLevelCycleBtn();
}

function updateLevelCycleBtn() {
    levelCycleBtn.textContent = currentLevel;
}

function cycleLevel() {
    const enabled = levels.filter(l => l.enabled).map(l => l.code);
    if (!enabled.length) return;
    const idx = enabled.indexOf(currentLevel);
    const next = enabled[(idx + 1) % enabled.length];
    currentLevel = next;
    updateLevelCycleBtn();
    if (screen === 'home') renderHome();
}

levelCycleBtn.addEventListener('click', cycleLevel);

/* ===== Шапка: управляем ТОЛЬКО классами, без display =====
   CSS сам решает, что показать на широких/узких. */

function updateHeader() {
    historyBtn.classList.toggle('active', screen === 'history');

    // Классы режима на inner
    topbarInner.classList.toggle('mode-home',    screen === 'home' || screen === 'history');
    topbarInner.classList.toggle('mode-train',   screen === 'train' || screen === 'check' || screen === 'results');

    // Показываем/скрываем слот таймера+кнопки
    trainSlot.style.display = (screen === 'train' || screen === 'check' || screen === 'results') ? 'flex' : 'none';

    // Таймер — только на тренировке
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

/* ===== Главный экран ===== */
function renderHome() {
    const color = levelColors[currentLevel] || '#e0e0e0';
    view.innerHTML = `
        <button class="quick-train" id="quickTrain" style="background:${color}">
            Быстрая тренировка
        </button>
    `;
    document.getElementById('quickTrain').addEventListener('click', startSession);
    updateHeader();
}

/* ===== Старт сессии ===== */
function startSession() {
    const bank = BANKS[currentLevel] || [];
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

/* ===== Лента миниатюр: рендерим ОДИН раз, потом только класс .active ===== */

function buildThumbsHTML() {
    return sessionWords.map((item, i) => `
        <div class="thumb${i === currentPerson ? ' active' : ''}" data-index="${i}">
            <div class="thumb-img">${item.ru}</div>
            <div class="thumb-name">${item.en}</div>
        </div>
    `).join('');
}

function updateThumbsActive() {
    document.querySelectorAll('.thumbs .thumb').forEach(el => {
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
        bar.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
    }
}

/* ===== Экран тренировки ===== */
function renderTrain() {
    const w = sessionWords[currentPerson];

    // Если лента ещё не создана (новая сессия) — строим её
    // Иначе — просто обновляем активный класс и центральную карточку
    let thumbsBar = document.getElementById('thumbsBar');

    if (!thumbsBar) {
        // Первый рендер этой сессии
        view.innerHTML = `
            <div class="train-screen">
                <div class="thumbs" id="thumbsBar">${buildThumbsHTML()}</div>
                <div class="train-area">
                    <div class="train-main">
                        <div class="face-square" id="faceSquare">${w.ru}</div>
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

        // Делегированный обработчик кликов по миниатюрам
        thumbsBar.addEventListener('click', (e) => {
            const t = e.target.closest('.thumb');
            if (!t) return;
            currentPerson = Number(t.dataset.index);
            updateTrainCard();
        });

        document.getElementById('btnFirst').addEventListener('click', () => {
            currentPerson = 0; updateTrainCard();
        });
        document.getElementById('btnPrev').addEventListener('click', () => {
            currentPerson = Math.max(0, currentPerson - 1); updateTrainCard();
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
    }

    updateTrainCard();
    updateHeader();
}

/* Обновляет центральную карточку, активный класс и скролл — БЕЗ пересоздания ленты */
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

        // Ставим фокус в первое поле БЕЗ скролла
        setTimeout(() => focusCurrentInput(false), 0);
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
    focusCurrentInput(true);   // со скроллом — только при явной навигации
}

/* Фокус БЕЗ автоскролла (preventScroll), чтобы браузер не прыгал */
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

/* Скролл ТОЛЬКО если поле вне видимой области */
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
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
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
                <span class="pill total">Всего: ${total}</span>
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

/* ===== История ===== */
function renderHistory() {
    const history = loadHistory();

    let body = '';
    if (!history.length) {
        body = `<div class="history-empty">Пока нет ни одной попытки.</div>`;
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
                <span>Последние ${HISTORY_MAX} попыток</span>
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
        pushHistory({ date: dateStr, correct, close, wrong, total: sessionWords.length });

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

/* ===== Реакция на resize ===== */
window.addEventListener('resize', () => {
    updateCheckCols();
    if (screen === 'check' && checkPhase === 'input') {
        renderCheck();
    }
});

/* ===== Старт ===== */
window.addEventListener('DOMContentLoaded', () => {
    updateCheckCols();
    renderLevels();
    renderHome();
});

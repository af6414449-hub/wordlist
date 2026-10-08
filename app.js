/* Wordlist — логика приложения.
   Зависит от a1.js (массив WORDS_A1). */

/* ===== Состояние ===== */
let currentLevel = 'A1';
let screen = 'home';           // 'home' | 'train' | 'check' | 'results'
let checkPhase = 'input';      // 'input' | 'result'
let currentPerson = 0;

const TRAIN_SECONDS = 60;
const SESSION_SIZE  = 20;      // 20 слов на сессию → 4 строки по 5 в проверке

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

/* Базы по уровням. Пока — только A1. */
const BANKS = {
    A1: WORDS_A1,
};

let sessionWords = [];
let userAnswers  = [];

const view       = document.getElementById('view');
const levelsNav  = document.getElementById('levelsNav');
const trainSlot  = document.getElementById('trainSlot');
const finishBtn  = document.getElementById('finishBtn');
const timerWrap  = document.getElementById('timerWrap');
const timerValue = document.getElementById('timerValue');

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
            if (screen === 'home') renderHome();
        });
    });
}

/* ===== Шапка ===== */
function updateHeader() {
    if (screen === 'home') {
        levelsNav.style.display = 'flex';
        trainSlot.style.display = 'none';
        return;
    }
    levelsNav.style.display = 'none';
    trainSlot.style.display = 'flex';

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
    const pool = shuffle(bank);
    sessionWords = pool.slice(0, SESSION_SIZE);
    userAnswers  = sessionWords.map(() => '');
    currentPerson = 0;
    screen = 'train';
    renderTrain();
    startTimer();
}

/* ===== Экран тренировки ===== */
function renderTrain() {
    const w = sessionWords[currentPerson];

    const thumbsHtml = sessionWords.map((item, i) => `
        <div class="thumb${i === currentPerson ? ' active' : ''}" data-index="${i}">
            <div class="thumb-img">${item.ru}</div>
            <div class="thumb-name">${item.en}</div>
        </div>
    `).join('');

    view.innerHTML = `
        <div class="train-screen">
            <div class="thumbs">${thumbsHtml}</div>
            <div class="train-area">
                <div class="train-main">
                    <div class="face-square" id="faceSquare">${w.ru}</div>
                    <div class="name-plate">${w.en} <span style="font-size:0.7em;opacity:0.65">(${w.pos})</span></div>
                    <div class="train-controls">
                        <button class="ctrl-btn" id="btnFirst">⏮</button>
                        <button class="ctrl-btn" id="btnPrev">◀</button>
                        <button class="ctrl-btn" id="btnNext">▶</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    fitFontSize(document.getElementById('faceSquare'), 40, 14);

    document.getElementById('btnFirst').addEventListener('click', () => {
        currentPerson = 0; renderTrain();
    });
    document.getElementById('btnPrev').addEventListener('click', () => {
        currentPerson = Math.max(0, currentPerson - 1); renderTrain();
    });
    document.getElementById('btnNext').addEventListener('click', () => {
        if (currentPerson >= sessionWords.length - 1) {
            goToCheck();
            return;
        }
        currentPerson++;
        renderTrain();
    });

    document.querySelectorAll('.thumb').forEach(t => {
        t.addEventListener('click', () => {
            currentPerson = Number(t.dataset.index);
            renderTrain();
        });
    });

    // Прокрутить ленту так, чтобы активная карточка была видна
    const activeThumb = document.querySelector('.thumb.active');
    if (activeThumb) {
        activeThumb.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
        });
    }

    updateHeader();
}

/* ===== Переход в проверку ===== */
function goToCheck() {
    stopTimer();
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

            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (currentPerson < sessionWords.length - 1) {
                        currentPerson++;
                        renderCheck();
                        focusCurrentInput();
                    }
                } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (currentPerson > 0) {
                        currentPerson--;
                        renderCheck();
                        focusCurrentInput();
                    }
                }
            });
        });

        focusCurrentInput();
    }

    updateHeader();
}

function focusCurrentInput() {
    const el = view.querySelector(`.check-input[data-index="${currentPerson}"]`);
    if (el) {
        el.focus();
        const val = el.value;
        el.setSelectionRange(val.length, val.length);
    }
}

function updateCheckHighlight() {
    view.querySelectorAll('.check-cell').forEach(cell => {
        cell.classList.toggle('current', Number(cell.dataset.index) === currentPerson);
    });
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
                <td class="${verdict}">${item.en} <span style="opacity:0.7;font-size:0.9em">(${item.pos})</span></td>
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

/* ===== Авто-уменьшение шрифта ===== */
function fitFontSize(el, max, min) {
    let size = max;
    el.style.fontSize = size + 'px';
    let guard = 0;
    while (
        size > min &&
        (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight) &&
        guard < 60
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

/* ===== Завершить / Продолжить ===== */
finishBtn.addEventListener('click', () => {
    if (screen === 'train') { goToCheck(); return; }

    if (screen === 'check' && checkPhase === 'input') {
        checkPhase = 'result';
        renderCheck();
        return;
    }

    if (screen === 'check' && checkPhase === 'result') {
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

/* ===== Старт ===== */
window.addEventListener('DOMContentLoaded', () => {
    renderLevels();
    renderHome();
});

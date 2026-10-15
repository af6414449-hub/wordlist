// generate-examples.js
// Запуск:  node generate-examples.js
// Результат: data/b2.js перезапишется с полем ex

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'b2.js');

// --- 1. Читаем исходный файл и вытаскиваем массив ---
const src = fs.readFileSync(FILE, 'utf8');

const match = src.match(/const\s+WORDS_B2\s*=\s*(\[[\s\S]*?\]);/);
if (!match) {
    console.error('Не нашёл const WORDS_B2 = [...] в файле');
    process.exit(1);
}

// eval — быстро и достаточно безопасно, т.к. файл твой
const WORDS_B2 = eval(match[1]);

console.log('Слов в базе:', WORDS_B2.length);

// --- 2. Утилиты ---

// Очистка слова для запроса в API
function cleanForApi(en) {
    let w = en
        .replace(/^to\s+/i, '')
        .replace(/^the\s+/i, '')
        .replace(/^a\s+/i, '')
        .replace(/^an\s+/i, '')
        .replace(/^in\s+spite\s+of$/i, 'spite')
        .trim();
    return w;
}

async function fetchExample(en) {
    const word = cleanForApi(en);
    if (!word) return null;

    const url = 'https://api.dictionaryapi.dev/api/v2/entries/en/' +
                encodeURIComponent(word);

    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        if (!Array.isArray(data)) return null;

        for (const entry of data) {
            for (const meaning of entry.meanings || []) {
                for (const def of meaning.definitions || []) {
                    if (def.example && def.example.length > 5) {
                        return def.example.trim();
                    }
                }
            }
        }
    } catch (_) {}
    return null;
}

// Экранирование строки для JS-литерала
function q(s) {
    return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

// --- 3. Основной проход ---
(async () => {
    const out = [];

    for (let i = 0; i < WORDS_B2.length; i++) {
        const w = WORDS_B2[i];
        const ex = await fetchExample(w.en);

        out.push({
            en: w.en,
            pos: w.pos,
            ru: w.ru,
            ex: ex || w.ex || ''   // если вдруг уже был ex — сохраняем
        });

        process.stdout.write(
            `[${i + 1}/${WORDS_B2.length}] ${w.en} ${ex ? '✓' : '·'}\n`
        );

        // мягкий rate-limit, чтобы не долбить API
        await new Promise(r => setTimeout(r, 150));
    }

    // --- 4. Записываем обратно ---
    const lines = [];
    lines.push('/* Wordlist — база слов уровня B2.');
    lines.push('   Формат: { en, pos, ru, ex } */');
    lines.push('');
    lines.push('const WORDS_B2 = [');

    for (const w of out) {
        const parts = [
            `en: ${q(w.en)}`,
            `pos: ${q(w.pos)}`,
            `ru: ${q(w.ru)}`,
            w.ex ? `ex: ${q(w.ex)}` : `ex: ''`
        ];
        lines.push('    { ' + parts.join(', ') + ' },');
    }

    lines.push('];');
    lines.push('');

    fs.writeFileSync(FILE, lines.join('\n'), 'utf8');
    console.log('\nГотово. Записано в', FILE);
})();

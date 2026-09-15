/**
 * Тесты разбора ввода адресной строки.
 *
 *     node tools/test-url-parse.mjs
 *
 * Логика решает, уйдёт ли ввод в поисковую систему. Ошибка означает утечку
 * внутреннего хоста наружу, поэтому набор случаев здесь только растёт.
 */

import { looksLikeUrl, resolveTarget, nameFromUrl } from '../ui/pages/newtab/url-parse.js';

const DDG = 'https://duckduckgo.com/?q=';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else failures.push({ name, expected, actual });
}

/* --- Адреса: должны открываться напрямую -------------------------------- */

const URLS = [
  ['https://example.com',              'явная схема'],
  ['http://example.com',               'http тоже адрес'],
  ['example.com',                      'голый домен'],
  ['www.example.com',                  'домен с www'],
  ['sub.example.co.uk/path',           'поддомен и путь'],
  ['example.com/path?a=1&b=2',         'строка запроса'],
  ['example.com:8080',                 'порт'],
  ['localhost',                        'локальный хост'],
  ['localhost:3000',                   'локальный хост с портом'],
  ['localhost/admin',                  'локальный хост с путём'],
  ['127.0.0.1',                        'адрес обратной петли'],
  ['192.168.1.1:8006',                 'адрес в локальной сети'],
  ['router.local',                     'хост в домашней сети'],
  ['intranet.company.ru/wiki',         'корпоративный ресурс'],
  ['github.io',                        'зона, похожая на расширение'],
  ['example.sh',                       'зона .sh существует'],
  ['notes.example.md',                 'две точки — домен, не файл'],
];

for (const [input, note] of URLS) {
  check(`адрес: ${input} (${note})`, looksLikeUrl(input), true);
}

/* --- Запросы: должны уходить в поиск ------------------------------------ */

const QUERIES = [
  ['как собрать firefox',        'запрос с пробелами'],
  ['gecko',                      'одно слово'],
  ['что такое MPL 2.0',          'слова и цифры'],
  ['3.14',                       'число, не домен'],
  ['file.txt',                   'имя файла'],
  ['notes.md',                   'файл заметок'],
  ['report.pdf',                 'документ'],
  ['photo.jpeg',                 'изображение'],
  ['archive.zip',                'архив'],
  ['setup.exe',                  'исполняемый файл'],
  ['config.json',                'файл настроек'],
  ['script.py',                  'исходный файл'],
  ['example.com and more',       'домен внутри фразы'],
  ['',                           'пустой ввод'],
];

for (const [input, note] of QUERIES) {
  check(`запрос: "${input}" (${note})`, looksLikeUrl(input), false);
}

/* --- resolveTarget ------------------------------------------------------- */

check('схема достраивается как https',
  resolveTarget('example.com', DDG), 'https://example.com');

check('существующая схема не трогается',
  resolveTarget('http://example.com', DDG), 'http://example.com');

check('запрос уходит в поиск',
  resolveTarget('gecko engine', DDG), DDG + 'gecko%20engine');

check('кириллица кодируется',
  resolveTarget('движок гекко', DDG), DDG + '%D0%B4%D0%B2%D0%B8%D0%B6%D0%BE%D0%BA%20%D0%B3%D0%B5%D0%BA%D0%BA%D0%BE');

check('пустой ввод не даёт перехода', resolveTarget('   ', DDG), null);

check('края обрезаются', resolveTarget('  example.com  ', DDG), 'https://example.com');

/* --- nameFromUrl --------------------------------------------------------- */

check('имя из домена', nameFromUrl('https://github.com'), 'github');
check('www отбрасывается', nameFromUrl('https://www.example.com'), 'example');
check('составная зона', nameFromUrl('https://example.co.uk'), 'example');
check('localhost остаётся целиком', nameFromUrl('http://localhost:3000'), 'localhost');
check('мусор возвращается как есть', nameFromUrl('не адрес'), 'не адрес');

/* --- Итог ---------------------------------------------------------------- */

const total = passed + failures.length;

if (failures.length === 0) {
  console.log(`Все проверки пройдены: ${passed}/${total}`);
  process.exit(0);
}

console.error(`Провалено ${failures.length} из ${total}:\n`);
for (const f of failures) {
  console.error(`  ${f.name}`);
  console.error(`    ожидалось: ${JSON.stringify(f.expected)}`);
  console.error(`    получено:  ${JSON.stringify(f.actual)}\n`);
}
process.exit(1);

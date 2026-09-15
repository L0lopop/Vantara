/* ==========================================================================
 * Vantara — разбор ввода: адрес или поисковый запрос
 *
 * Почему это отдельный модуль с тестами: ошибка здесь приводит к утечке.
 * Если внутренний хост (router.local, intranet.company.ru) ошибочно сочтён
 * запросом, он уходит в поисковую систему вместе со всем, что после него.
 * Обратная ошибка мягче, но тоже плоха: запрос уходит в несуществующий домен.
 *
 * Модуль чистый — без DOM и без сети, поэтому проверяется в Node:
 *     node tools/test-url-parse.mjs
 * ========================================================================== */

/** Схема вида "https://", "about:blank" разбирается отдельно. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/** localhost с необязательным портом и путём. */
const LOCALHOST = /^localhost(:\d+)?([/?#]|$)/i;

/** IPv4 с необязательным портом и путём. */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}(:\d+)?([/?#]|$)/;

/** host.tld — зона минимум из двух букв. */
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.([a-z]{2,})(:\d+)?([/?#]|$)/i;

/**
 * Расширения файлов, которые по формату похожи на доменную зону.
 * Без этого списка "file.txt" и "notes.md" уходили бы на https://file.txt.
 *
 * В списке только те расширения, которые НЕ являются реальными доменными
 * зонами. Спорные (io, co, me, tv, ai, sh, pl, rs) намеренно пропущены:
 * это существующие зоны, и считать их именами файлов — худшая из двух ошибок.
 */
const FILE_EXTENSIONS = new Set([
  'txt', 'md', 'log', 'csv', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini',
  'conf', 'cfg', 'lock', 'sql', 'bak', 'tmp',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf', 'rtf', 'odt',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'ico', 'psd',
  'mp3', 'mp4', 'wav', 'flac', 'avi', 'mkv', 'mov', 'webm',
  'zip', 'rar', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg',
  'exe', 'dll', 'msi', 'deb', 'rpm', 'apk', 'bat', 'cmd', 'ps1',
  'css', 'scss', 'html', 'htm', 'php', 'jsp', 'asp', 'aspx',
  'py', 'rb', 'java', 'class', 'jar', 'cpp', 'hpp', 'rs',
]);

/**
 * Похож ли ввод на адрес, а не на поисковый запрос.
 * @param {string} text ввод пользователя, уже обрезанный по краям
 * @returns {boolean}
 */
export function looksLikeUrl(text) {
  if (!text) return false;

  // Пробел означает запрос. Настоящий адрес пробелов не содержит:
  // в нём они были бы закодированы как %20.
  if (/\s/.test(text)) return false;

  if (HAS_SCHEME.test(text)) return true;
  if (LOCALHOST.test(text)) return true;
  if (IPV4.test(text)) return true;

  const match = DOMAIN.exec(text);
  if (!match) return false;

  // Единственная точка и «зона» из списка расширений — это имя файла.
  // У "sub.example.txt" точек больше одной, и это уже похоже на домен.
  const dots = (text.split(/[/?#]/)[0].match(/\./g) || []).length;
  if (dots === 1 && FILE_EXTENSIONS.has(match[2].toLowerCase())) return false;

  return true;
}

/**
 * Превращает ввод в адрес для перехода.
 * @param {string} input ввод пользователя
 * @param {string} searchUrl база поисковой системы, оканчивается на "="
 * @returns {string|null} адрес перехода или null для пустого ввода
 */
export function resolveTarget(input, searchUrl) {
  const value = String(input ?? '').trim();
  if (!value) return null;

  if (looksLikeUrl(value)) {
    // Схему достраиваем как https, а не http: незашифрованное соединение
    // не должно возникать само по себе, без решения пользователя.
    return HAS_SCHEME.test(value) ? value : 'https://' + value;
  }

  return searchUrl + encodeURIComponent(value);
}

/**
 * Читаемое имя сайта из адреса: домен без www и без доменной зоны.
 * @param {string} url
 * @returns {string}
 */
export function nameFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    // Для "example.co.uk" берём "example", для "localhost" — его целиком.
    return parts.length > 1 ? parts[0] : host;
  } catch {
    return url;
  }
}

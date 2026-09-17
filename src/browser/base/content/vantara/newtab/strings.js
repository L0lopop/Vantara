/* ==========================================================================
 * Vantara — строки новой вкладки
 *
 * Язык страницы совпадает с языком интерфейса браузера. В сборке браузер
 * кладёт его в атрибут vn-locale (AboutNewTabChild.sys.mjs); в прототипе
 * его нет, и берётся язык из navigator.language.
 *
 * Разметка помечает переводимое:
 *   data-l10n="ключ"                     — текст элемента
 *   data-l10n-attrs="атрибут:ключ, ..."  — атрибуты
 * В HTML остаётся русский текст: страница читается и без скрипта.
 * ========================================================================== */

const STRINGS = {
  ru: {
    title: 'Новая вкладка',
    search: 'Поиск или адрес',
    engineSwitch: 'Сменить поисковую систему',
    pinned: 'Закреплённые сайты',
    pinnedHint: 'Здесь только те сайты, которые вы добавили сами. ' +
                'Список «часто посещаемых» строится из слежки за вашей ' +
                'историей, поэтому его нет.',
    tileRemove: 'Убрать',
    tileAdd: 'Добавить ссылку',
    tileAddShort: 'Добавить',
    blockedLabel: 'Заблокировано попыток слежки',
    sentLabel: 'Отправлено о вас',
    reset: 'Сбросить счётчик',
    dialogTitle: 'Новая ссылка',
    fieldUrl: 'Адрес',
    fieldName: 'Название',
    fieldNameHint: 'необязательно',
    cancel: 'Отмена',
    save: 'Сохранить',
  },
  en: {
    title: 'New Tab',
    search: 'Search or enter address',
    engineSwitch: 'Change search engine',
    pinned: 'Pinned sites',
    pinnedHint: 'Only the sites you added yourself live here. ' +
                'A “most visited” list is built by tracking your history, ' +
                'so there is none.',
    tileRemove: 'Remove',
    tileAdd: 'Add a link',
    tileAddShort: 'Add',
    blockedLabel: 'Tracking attempts blocked',
    sentLabel: 'Sent about you',
    reset: 'Reset counter',
    dialogTitle: 'New link',
    fieldUrl: 'Address',
    fieldName: 'Name',
    fieldNameHint: 'optional',
    cancel: 'Cancel',
    save: 'Save',
  },
};

const requested = document.documentElement.getAttribute('vn-locale') ||
                  navigator.language || 'ru';

/** Язык страницы: русский для ru-*, для остальных — английский. */
export const lang = requested.toLowerCase().startsWith('ru') ? 'ru' : 'en';

/** Строка по ключу; неизвестный ключ виден сразу, а не пустым местом. */
export function t(key) {
  return STRINGS[lang][key] ?? key;
}

/** Числа в формате языка страницы: «1 284» и «1,284». */
export function formatNumber(value) {
  return value.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US');
}

/** Переводит размеченные элементы внутри root. */
export function localize(root = document) {
  document.documentElement.lang = lang;

  for (const el of root.querySelectorAll('[data-l10n]')) {
    el.textContent = t(el.dataset.l10n);
  }

  for (const el of root.querySelectorAll('[data-l10n-attrs]')) {
    for (const pair of el.dataset.l10nAttrs.split(',')) {
      const [attr, key] = pair.split(':').map(s => s.trim());
      el.setAttribute(attr, t(key));
    }
  }
}

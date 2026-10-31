// Page language: English source strings plus five translations, picked from the visitor's choice or browser.
import en from "./locales/en.js";

// Eager glob, so a locale file simply appears in the picker once it exists.
const files = import.meta.glob("./locales/*.js", { eager: true, import: "default" });

export const LANGS = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "hi", name: "हिन्दी" },
  { code: "es", name: "Español" },
  { code: "ar", name: "العربية", rtl: true },
  { code: "tr", name: "Türkçe" },
].filter((l) => files[`./locales/${l.code}.js`]);

const KEY = "squeek-garden:lang";

function pick() {
  const known = (code) => LANGS.some((l) => l.code === code);
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && known(saved)) return saved;
  } catch {
    /* storage unavailable: fall back to the browser languages */
  }
  for (const tag of navigator.languages ?? [navigator.language]) {
    const code = String(tag).toLowerCase().split("-")[0];
    if (known(code)) return code;
  }
  return "en";
}

export const lang = pick();
const dict = files[`./locales/${lang}.js`] ?? en;
export const isRtl = Boolean(LANGS.find((l) => l.code === lang)?.rtl);

/** The string for `key` in the page language (English if missing), with {placeholders} filled from `vars`. */
export function t(key, vars = {}) {
  const s = dict[key] ?? en[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Count-dependent string: `key.one` for 1, `key.other` otherwise. `vars.n` defaults to the count. */
export function tp(key, count, vars = {}) {
  return t(`${key}.${Number(count) === 1 ? "one" : "other"}`, { n: count, ...vars });
}

/** Display name of a seed; on-chain names stay English, unknown seeds show as they are. */
export function seedName(name) {
  return dict[`seed.${name}`] ?? en[`seed.${name}`] ?? name;
}

/** Fills the page's static text from data-i18n* attributes and sets the document language and direction. */
export function applyStatic(root = document) {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl ? "rtl" : "ltr";
  for (const el of root.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml);
  for (const [attr, name] of [
    ["i18nPlaceholder", "placeholder"],
    ["i18nAria", "aria-label"],
    ["i18nTitle", "title"],
    ["i18nAlt", "alt"],
  ]) {
    for (const el of root.querySelectorAll(`[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`)) {
      el.setAttribute(name, t(el.dataset[attr]));
    }
  }
}

/** A compact language picker; choosing reloads the page in that language. */
export function languagePicker() {
  const select = document.createElement("select");
  select.className = "lang-select";
  select.setAttribute("aria-label", t("lang.label"));
  select.innerHTML = LANGS.map((l) => `<option value="${l.code}" ${l.code === lang ? "selected" : ""}>${l.name}</option>`).join("");
  select.addEventListener("change", () => {
    try {
      localStorage.setItem(KEY, select.value);
    } catch {
      /* storage unavailable: the choice lasts for this page only */
    }
    location.reload();
  });
  return select;
}

// Shared header for every page: translated static text, the language picker, the pixel logo, the current page marked,
// and ?net=local&dev=1 kept on page links.
import { logoURL } from "./art.js";
import { applyStatic, languagePicker } from "./i18n.js";
import { img } from "./pixel.js";

export function initNav() {
  applyStatic();
  document.querySelector(".top-right")?.prepend(languagePicker());
  const logo = document.querySelector(".logo");
  if (logo) logo.innerHTML = img(logoURL(), "art");
  const icon = document.querySelector("link[rel=icon]");
  if (icon) icon.href = logoURL();
  const here = location.pathname.split("/").pop() || "index.html";
  for (const a of document.querySelectorAll(".nav a, a.page-link")) {
    const target = a.getAttribute("href");
    if (a.closest(".nav") && (target === "./" ? "index.html" : target) === here) a.setAttribute("aria-current", "page");
    if (location.search) a.href = `${target}${location.search}`;
  }
}

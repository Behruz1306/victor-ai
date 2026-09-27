// pnpm brand — renders the Victor AI mark and the Open Graph card to public/ with Playwright.
// Everything is local: the mark is SVG, the font is Geist from node_modules (no network).
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const pub = (f) => path.join(root, "public", f);
const font = (w) =>
  readFileSync(path.join(root, `node_modules/geist/dist/fonts/geist-sans/Geist-${w}.woff2`)).toString("base64");

const ACCENT = "#4b42d6";
const MARK = (fg = "#fff", tile = ACCENT, rx = 8) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rx}" fill="${tile}"/>
  <g fill="none" stroke="${fg}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8.6 14.2 L14.1 23.4"/><path d="M17.2 23.4 L24.2 9"/>
  </g>
</svg>`;

// Monochrome-safe favicon SVG (tile) — also served as /icon.svg.
writeFileSync(pub("icon.svg"), MARK());
writeFileSync(pub("mark-mono.svg"), MARK("currentColor", "none"));

const css = `
@font-face { font-family: Geist; font-weight: 500; src: url(data:font/woff2;base64,${font("Medium")}) format("woff2"); }
@font-face { font-family: Geist; font-weight: 600; src: url(data:font/woff2;base64,${font("SemiBold")}) format("woff2"); }
@font-face { font-family: Geist; font-weight: 400; src: url(data:font/woff2;base64,${font("Regular")}) format("woff2"); }
* { margin: 0; box-sizing: border-box; }
body { font-family: Geist, sans-serif; -webkit-font-smoothing: antialiased; }`;

const rows = [30, 72, 114, 156, 198, 240, 282, 324];
const pills = [[[20, 62], [96, 34], [144, 70]], [[0, 44], [58, 96], [168, 44]], [[36, 78], [128, 58]], [[8, 56], [78, 44], [136, 82]], [[48, 90], [152, 36]], [[14, 50], [78, 68], [160, 58]], [[40, 84], [138, 50]], [[4, 66], [84, 36], [134, 76]]];
const art = `<svg viewBox="0 0 600 354" width="600" height="354" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="f" x1="0" x2="1"><stop offset="0" stop-color="#e9ebf1" stop-opacity=".04"/><stop offset=".75" stop-color="#e9ebf1" stop-opacity=".18"/><stop offset="1" stop-color="#e9ebf1" stop-opacity=".05"/></linearGradient>
    <linearGradient id="a" x1="0" x2="1"><stop offset="0" stop-color="#8c84ff" stop-opacity="0"/><stop offset="1" stop-color="#8c84ff"/></linearGradient>
  </defs>
  ${rows.map((y, r) => pills[r].map(([x, w]) => `<rect x="${x}" y="${y - 6}" width="${w}" height="12" rx="6" fill="url(#f)"/>`).join("")).join("")}
  ${rows.map((y, i) => `<path d="M232 ${y} C 310 ${y}, 330 177, 420 177" fill="none" stroke="#e9ebf1" stroke-opacity="${0.12 + (i % 3) * 0.04}" stroke-width="1.2"/>`).join("")}
  <path d="M330 177 L 430 177" stroke="url(#a)" stroke-width="2.5" stroke-linecap="round"/>
  <g transform="translate(434 133) scale(2.6)" fill="none" stroke="#8c84ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8.6 14.2 L14.1 23.4"/><path d="M17.2 23.4 L24.2 9"/></g>
</svg>`;

const og = `<!doctype html><html><head><style>${css}
  body { width: 1200px; height: 630px; background: #0b0d12; color: #e9ebf1; position: relative; overflow: hidden; }
  .brand { position: absolute; top: 64px; left: 72px; display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 600; letter-spacing: -0.02em; }
  .brand b { color: #8c95a6; font-weight: 500; }
  .brand svg { width: 44px; height: 44px; }
  h1 { position: absolute; top: 184px; left: 72px; width: 600px; font-size: 52px; line-height: 1.12; font-weight: 600; letter-spacing: -0.02em; }
  p { position: absolute; top: 470px; left: 72px; font-size: 26px; color: #b4bac7; }
  .art { position: absolute; right: -40px; top: 150px; opacity: .95; }
  .foot { position: absolute; bottom: 44px; left: 72px; font-size: 18px; color: #8c95a6; }
</style></head><body>
  <div class="brand">${MARK("#fff", "#8c84ff").replace("<svg", '<svg width="44" height="44"')}<span>Victor<b> AI</b></span></div>
  <h1>We read your team's chats for you and drive every customer task to completion.</h1>
  <p>You never have to open the chats again.</p>
  <div class="art">${art}</div>
  <div class="foot">For US trucking — carriers and freight brokers</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function shot(html, w, h, out) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, omitBackground: true });
}
const tile = (size, rx) =>
  `<!doctype html><html><head><style>*{margin:0}body{width:${size}px;height:${size}px}svg{width:${size}px;height:${size}px;display:block}</style></head><body>${MARK("#fff", ACCENT, rx)}</body></html>`;
await shot(tile(32, 8), 32, 32, pub("favicon-32.png"));
// Apple masks the corners itself: full-bleed square.
await shot(tile(180, 0), 180, 180, pub("apple-icon.png"));
await shot(og, 1200, 630, pub("og.png"));
await browser.close();
console.log("brand assets written to public/: icon.svg, mark-mono.svg, favicon-32.png, apple-icon.png, og.png");

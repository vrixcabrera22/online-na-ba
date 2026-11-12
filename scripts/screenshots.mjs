// README screenshots of the live site, in docs/screenshots/.
//
//   npm run screenshots
//   CHROME_PATH="/path/to/chrome" BASE=https://... npm run screenshots
//
// Uses an installed Chrome (puppeteer-core downloads no browser). The dashboard
// shots use the public demo account, so no personal data ends up in the repo.

import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = (process.env.BASE ?? "https://online-na-ba.vercel.app").replace(/\/$/, "");
const CHROME =
  process.env.CHROME_PATH ??
  {
    win32: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    linux: "/usr/bin/google-chrome",
  }[process.platform];
const OUT = "docs/screenshots";
mkdirSync(OUT, { recursive: true });

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1280, height: 860, deviceScaleFactor: 1 };

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));

async function shot(name, path, viewport, { fullPage = false, dark = false, before } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  if (dark) await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "dark" }]);
  if (before) await before(page);
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("footer");
  await settle();
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`saved ${OUT}/${name}.png`);
  await page.close();
}

async function demoLogin(page) {
  await page.goto(`${BASE}/fil/login`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("form:has(input[name=locale]):not(:has(#email))"));
  await Promise.all([
    page.waitForNavigation(),
    page.$eval("form:has(input[name=locale]):not(:has(#email))", (f) => f.requestSubmit()),
  ]);
}

try {
  await shot("home-fil-phone", "/fil", PHONE);
  await shot("home-en-desktop", "/en", DESKTOP);
  await shot("site-en-desktop", "/en/status/virtual-pag-ibig", DESKTOP, { fullPage: true });
  await shot("site-fil-phone-dark", "/fil/status/philhealth", PHONE, { fullPage: true, dark: true });
  await shot("about-en-desktop", "/en/about", DESKTOP);
  await shot("dashboard-fil-phone", "/fil/dashboard", PHONE, { fullPage: true, before: demoLogin });
} finally {
  await browser.close();
}

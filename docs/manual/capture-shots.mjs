// Captures the three-pane stills used by the manual. Requires `playwright` (npm i playwright) and the app on :3000 + API on :8000.
// Usage: OUT=docs/manual/assets/ui node docs/manual/capture-shots.mjs  (dock crops were then cut from the 2x home/bell shots with PIL).
import { chromium } from "playwright";
const OUT = process.env.OUT || "/workspace/shots";
const URL = process.env.CODA_URL || "http://localhost:3000";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForSelector(".preset-chip", { timeout: 30000 });
await page.waitForFunction(() => [...document.querySelectorAll(".preset-chip")].some(b => !b.disabled), null, { timeout: 30000 });
await page.waitForTimeout(6000);
await page.mouse.move(1590, 10);
await page.screenshot({ path: `${OUT}/manual-3pane-home.png` });
const dock = async (name) => {
  const b = await page.evaluate(() => {
    const c = document.querySelector(".chat-chips"); const r = c.getBoundingClientRect();
    const t = document.querySelector("textarea, input[placeholder^='Type a goal']"); const r2 = t.getBoundingClientRect();
    return { top: r.top, bottom: Math.max(r.bottom, r2.bottom) };
  });
  const y = Math.max(0, b.top - 150);
  await page.screenshot({ path: `${OUT}/${name}`, clip: { x: 0, y, width: 1600, height: Math.min(960 - y, b.bottom - y + 40) } });
};
await dock("manual-3pane-dock-chips.png");
// typed goal
const input = page.locator("textarea, input[placeholder^='Type a goal']").first();
await input.click();
await input.fill("Bring qubit 0 to ready");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/manual-3pane-typed.png` });
await input.fill("");
// calibrate via chip
await page.locator(".preset-chip", { hasText: "Calibrate Q0" }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/manual-3pane-calibrating.png` });
await page.waitForFunction(() => /READY/.test(document.body.innerText) && ![...document.querySelectorAll(".preset-chip")].every(b => b.disabled), null, { timeout: 90000 });
await page.waitForTimeout(5000);
await page.mouse.move(1590, 10);
await page.screenshot({ path: `${OUT}/manual-3pane-ready.png` });
// bell
await page.waitForFunction(() => [...document.querySelectorAll(".preset-chip")].some(b => !b.disabled), null, { timeout: 60000 });
await page.locator(".preset-chip", { hasText: "Bell pair" }).click();
await page.waitForTimeout(12000);
await page.mouse.move(1590, 10);
await page.screenshot({ path: `${OUT}/manual-3pane-bell.png` });
await dock("manual-3pane-dock-transcript.png");
console.log(await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await browser.close();

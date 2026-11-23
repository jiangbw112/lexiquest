import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const chrome = ["/usr/bin/google-chrome-stable", "/usr/local/bin/google-chrome"].find((path) => existsSync(path));
const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));

async function eventCount() {
  return page.evaluate(() => (window.__LEXIQUEST__?.events ?? []).length);
}

async function waitEvent(needle, timeout = 15000) {
  const start = Math.max(0, (await eventCount()) - 5);
  await page.waitForFunction(
    (payload) => (window.__LEXIQUEST__?.events ?? []).slice(payload.start).some((event) => event.includes(payload.needle)),
    { start, needle },
    { timeout },
  );
}

async function scene() {
  return page.evaluate(() => window.__LEXIQUEST__?.scene ?? "");
}

const base = process.argv[2] ?? "http://127.0.0.1:5175/";
await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
const renderer = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return "no-canvas";
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  return gl ? "webgl" : "canvas";
});
console.log("renderer", renderer);
await page.waitForFunction(() => (window.__LEXIQUEST__?.events ?? []).some((event) => event.includes("forest:loaded:3:idle,walk,attack,hit,victory:ui_title_forest")), null, { timeout: 15000 });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });
await page.waitForTimeout(300);

await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const enterIgnored = (await scene()) === "profiles" && (await page.locator("#name-form.open").count()) === 0;
if (!enterIgnored) throw new Error("Enter left the character picker or opened the name form");

await page.keyboard.press("KeyN");
await waitEvent("scene:grades");
await page.keyboard.press("Digit3");
await page.keyboard.press("Enter");
await page.waitForSelector("#name-form.open", { timeout: 8000 });
await page.fill("#hero-name", "小林");
await page.locator("#name-form button[type=submit]").click();
await waitEvent("scene:overworld");

const stamped = await page.evaluate(() => {
  const roster = JSON.parse(localStorage.getItem("lexiquest.profiles.v1") || "null");
  const slot = roster?.slots?.[0];
  if (!slot) return null;
  const key = `lexiquest.profile.v1.${slot.id}`;
  const save = JSON.parse(localStorage.getItem(key) || "null");
  if (!save) return null;
  save.xp = 17;
  save.unlockedCosmeticIds = ["forest_leaf_cape", "acorn_pin", "forest_wreath"];
  save.equippedCosmeticIds = ["forest_leaf_cape", "acorn_pin", "forest_wreath"];
  save.unlockedTitleIds = ["title_forest_word_star"];
  save.equippedTitleId = "title_forest_word_star";
  localStorage.setItem(key, JSON.stringify(save));
  return {
    key,
    legacy: localStorage.getItem("lexiquest.save.v1"),
    xp: JSON.parse(localStorage.getItem(key)).xp,
  };
});
if (!stamped || stamped.legacy !== null || stamped.xp !== 17) {
  throw new Error(`active profile was not stamped: ${JSON.stringify(stamped)}`);
}

await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });
await page.waitForTimeout(300);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const reloadStillPicker = (await scene()) === "profiles";
if (!reloadStillPicker) throw new Error(`reload scene ${await scene()}`);

await page.keyboard.press("Digit1");
await waitEvent("scene:title");
await page.keyboard.press("Enter");
await waitEvent("scene:overworld");
await page.keyboard.press("Digit6");
await waitEvent("forest:equip:");
await page.waitForTimeout(500);
mkdirSync("/opt/cursor/artifacts", { recursive: true });
await page.screenshot({ path: "/opt/cursor/artifacts/wardrobe-equipped-v0.1.png" });

const restored = await page.evaluate((key) => {
  const save = JSON.parse(localStorage.getItem(key) || "null");
  const events = window.__LEXIQUEST__?.events ?? [];
  return {
    scene: window.__LEXIQUEST__?.scene ?? "",
    xp: save?.xp ?? null,
    cosmetics: save?.equippedCosmeticIds ?? [],
    legacy: localStorage.getItem("lexiquest.save.v1"),
    equip: events.filter((event) => event.includes("forest:equip:")).at(-1) ?? "",
  };
}, stamped.key);
console.log(JSON.stringify({ errors, renderer, enterIgnored, reloadStillPicker, restored }, null, 2));
const equipOk = restored.equip.includes("forest_leaf_cape,acorn_pin,forest_wreath");
if (errors.length > 0 || restored.scene !== "wardrobe" || restored.xp !== 17 || !equipOk || restored.legacy !== null) {
  throw new Error("forest reload did not restore the selected character");
}
await browser.close();

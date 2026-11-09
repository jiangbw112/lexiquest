import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") errors.push(`${message.type()}: ${message.text()}`);
});

async function waitEvent(needle, timeout = 12000) {
  await page.waitForFunction((text) => (window.__LEXIQUEST__?.events ?? []).some((event) => event.includes(text)), needle, {
    timeout,
  });
}

const base = process.argv[2] ?? "http://127.0.0.1:5175/";
await page.goto(base, { waitUntil: "networkidle" });
const renderer = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return "no-canvas";
  const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
  return gl ? "webgl" : "canvas";
});
console.log("renderer", renderer);
await waitEvent("forest:loaded:3:idle,walk,attack,hit,victory:ui_title_forest");
await waitEvent("warrior:loaded:11:idle,walk,attack,hit,victory");
const boot = await page.evaluate(() => window.__LEXIQUEST__);

await page.keyboard.press("Enter");
await page.waitForSelector("#name-form.open", { timeout: 8000 });
await page.fill("#hero-name", "小林");
await page.locator("#name-form button[type=submit]").click();
await waitEvent("scene:overworld");
await page.evaluate(() => {
  const key = "lexiquest.save.v1";
  const save = JSON.parse(localStorage.getItem(key) ?? "{}");
  save.unlockedCosmeticIds = ["forest_leaf_cape", "acorn_pin", "forest_wreath"];
  save.equippedCosmeticIds = ["forest_leaf_cape", "acorn_pin", "forest_wreath"];
  save.unlockedTitleIds = ["title_forest_word_star"];
  save.equippedTitleId = "title_forest_word_star";
  localStorage.setItem(key, JSON.stringify(save));
});
await page.reload({ waitUntil: "networkidle" });
await waitEvent("forest:loaded:3:idle,walk,attack,hit,victory:ui_title_forest");
await page.keyboard.press("Enter");
await waitEvent("scene:overworld");
await page.keyboard.press("6");
await waitEvent("forest:equip:forest_leaf_cape,acorn_pin,forest_wreath:helmet=hidden:back=absent");
await page.waitForTimeout(500);
mkdirSync("/opt/cursor/artifacts", { recursive: true });
await page.screenshot({ path: "/opt/cursor/artifacts/wardrobe-equipped-v0.1.png" });
const wardrobe = await page.evaluate(() => window.__LEXIQUEST__);
console.log(JSON.stringify({ errors, boot, wardrobe }, null, 2));
await browser.close();

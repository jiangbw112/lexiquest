import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const chrome = ["/usr/bin/google-chrome-stable", "/usr/local/bin/google-chrome"].find((path) => existsSync(path));
const base = process.argv[2] ?? "http://127.0.0.1:5175/";
const out = "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: chrome,
  args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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

async function clickGame(x, y) {
  const box = await page.locator("canvas").boundingBox();
  if (!box) throw new Error("no canvas");
  await page.mouse.click(box.x + (x / 1280) * box.width, box.y + (y / 800) * box.height);
}

async function shot(name) {
  await page.screenshot({ path: `${out}/${name}.png` });
}

async function profiles() {
  return page.evaluate(() => {
    const roster = JSON.parse(localStorage.getItem("lexiquest.profiles.v1") || "{\"slots\":[]}");
    return (roster.slots ?? []).map((slot) => {
      const key = `lexiquest.profile.v1.${slot.id}`;
      const raw = localStorage.getItem(key);
      const save = JSON.parse(raw || "null");
      return {
        id: slot.id,
        raw,
        name: save?.player?.name ?? "",
        grades: save?.selectedGrades ?? [],
        classId: save?.player?.classId ?? "",
        learned: Object.keys(save?.wordCards ?? {}).length,
        hair: save?.player?.appearance?.hairStyle ?? "",
      };
    });
  });
}

async function canvasText() {
  return page.evaluate(() => {
    const game = window.__LEXI_GAME__;
    const scene = game?.scene?.getScenes?.(true)?.[0];
    const texts = [];
    const walk = (nodes) => {
      for (const child of nodes ?? []) {
        if (typeof child.text === "string" && child.text) texts.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk(scene?.children?.list);
    return texts.join(" | ");
  });
}

await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });
await page.waitForTimeout(300);
await shot("isolation-startup");

await page.keyboard.press("KeyN");
await waitEvent("scene:grades");
await page.keyboard.press("Digit3");
await page.keyboard.press("Enter");
await page.waitForSelector("#name-form.open");
await page.fill("#hero-name", "小林");
await page.locator("#name-form button[type=submit]").click();
await waitEvent("scene:overworld");
await page.waitForTimeout(300);
await clickGame(1100, 250);
await waitEvent("scene:profiles");
await page.keyboard.press("KeyN");
await waitEvent("scene:grades");
await page.keyboard.press("Digit5");
await page.keyboard.press("Enter");
await page.waitForSelector("#name-form.open");
await page.fill("#hero-name", "Ada");
await page.locator("#hero-name").blur();
await page.keyboard.press("Digit2");
await page.locator("#name-form button[type=submit]").click();
await waitEvent("scene:overworld");
await page.waitForTimeout(300);
await clickGame(1100, 250);
await waitEvent("scene:profiles");
await page.waitForTimeout(400);
await shot("isolation-two-characters");

const beforeSwitch = await profiles();
if (beforeSwitch.length !== 2) throw new Error(`expected two characters ${JSON.stringify(beforeSwitch)}`);
await page.keyboard.press("Digit1");
await waitEvent("scene:title");
await page.keyboard.press("Enter");
await waitEvent("scene:overworld");
await clickGame(1100, 250);
await waitEvent("scene:profiles");
const afterSwitch = await profiles();
if (afterSwitch[0].raw !== beforeSwitch[0].raw || afterSwitch[1].raw !== beforeSwitch[1].raw) {
  throw new Error("switching rewrote a character file");
}

await page.keyboard.press("Digit2");
await waitEvent("scene:title");
await page.keyboard.press("Enter");
await waitEvent("scene:overworld");
await page.keyboard.press("Digit8");
await waitEvent("scene:guide");
await page.waitForTimeout(400);
await shot("isolation-parent-locked");
const lockedText = await canvasText();
if (lockedText.includes("删除这个角色")) throw new Error("delete was visible before the parent PIN");
const blocked = await page.evaluate(() => {
  const game = window.__LEXI_GAME__;
  const guide = game?.scene?.getScene?.("guide");
  const before = localStorage.getItem("lexiquest.profiles.v1");
  guide?.deleteCharacter?.();
  return {
    unlocked: guide?.pinSession?.unlocked === true,
    roster: localStorage.getItem("lexiquest.profiles.v1") === before,
  };
});
if (blocked.unlocked || !blocked.roster) throw new Error(`locked delete changed storage ${JSON.stringify(blocked)}`);

await page.fill("#pin-input", "2580");
await page.fill("#pin-confirm", "2580");
await page.locator("#pin-submit").click();
await page.waitForFunction(() => !document.getElementById("pin-form")?.classList.contains("open"), null, { timeout: 8000 });
await page.waitForTimeout(300);
await clickGame(580, 96);
await page.waitForTimeout(300);
const armedRaw = await profiles();
await clickGame(900, 640);
await page.waitForTimeout(300);
await shot("isolation-delete-armed");
const armedText = await canvasText();
const afterArm = await profiles();
if (!armedText.includes("再按一次，删除这个角色")) throw new Error(`first press did not arm: ${armedText}`);
if (afterArm.map((item) => item.raw).join() !== armedRaw.map((item) => item.raw).join()) {
  throw new Error("first delete press changed a character file");
}

await clickGame(900, 640);
await waitEvent("scene:profiles");
await page.waitForTimeout(400);
const afterDelete = await profiles();
await shot("isolation-after-delete");
const kept = afterDelete[0];
const removed = armedRaw.find((item) => item.name === "Ada");
const other = armedRaw.find((item) => item.name === "小林");
if (afterDelete.length !== 1 || kept?.name !== "小林" || kept.raw !== other?.raw || !removed) {
  throw new Error(`delete did not keep the other character ${JSON.stringify(afterDelete.map((item) => item.name))}`);
}
if (kept.grades.join() !== "G3" || kept.classId !== "warrior" || afterSwitch.find((item) => item.name === "Ada")?.grades.join() !== "G5") {
  throw new Error(`grades crossed ${JSON.stringify(afterSwitch)}`);
}

await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });
const restart = await page.evaluate(() => window.__LEXIQUEST__?.scene);
if (restart !== "profiles") throw new Error(`restart scene ${restart}`);

console.log(JSON.stringify({
  errors,
  beforeSwitch: beforeSwitch.map(({ name, grades, classId, learned, hair }) => ({ name, grades, classId, learned, hair })),
  locked: blocked,
  afterDelete: afterDelete.map(({ name, grades, classId }) => ({ name, grades, classId })),
  restart,
}, null, 2));
if (errors.length > 0) throw new Error(errors.join("\n"));
await browser.close();

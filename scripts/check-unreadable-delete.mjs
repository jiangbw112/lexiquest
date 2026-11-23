import { chromium } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";

const chrome = ["/usr/bin/google-chrome-stable", "/usr/local/bin/google-chrome"].find((path) => existsSync(path));
const base = process.argv[2] ?? "http://127.0.0.1:5173/";
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

async function buttonEnabled(label) {
  return page.evaluate((wanted) => {
    const game = window.__LEXI_GAME__;
    const scene = game?.scene?.getScenes?.(true)?.[0];
    let enabled = null;
    const walk = (nodes) => {
      for (const child of nodes ?? []) {
        if (child.text === wanted) enabled = child.parentContainer?.input?.enabled === true;
        if (child.list) walk(child.list);
      }
    };
    walk(scene?.children?.list);
    return enabled;
  }, label);
}

function rawMap() {
  return page.evaluate(() => {
    const roster = JSON.parse(localStorage.getItem("lexiquest.profiles.v1") || "{\"slots\":[]}").slots ?? [];
    const files = {};
    for (const slot of roster) files[slot.id] = localStorage.getItem(`lexiquest.profile.v1.${slot.id}`);
    return { ids: roster.map((slot) => slot.id), files };
  });
}

async function unlockPin() {
  await page.waitForSelector("#pin-form.open");
  await page.fill("#pin-input", "2580");
  const confirmHidden = await page.locator("#pin-confirm-label").evaluate((node) => node.classList.contains("hidden"));
  if (!confirmHidden) await page.fill("#pin-confirm", "2580");
  await page.locator("#pin-submit").click();
  await page.waitForFunction(() => !document.getElementById("pin-form")?.classList.contains("open"), null, { timeout: 8000 });
}

await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });

await page.keyboard.press("KeyN");
await waitEvent("scene:grades");
await page.keyboard.press("Digit3");
await page.keyboard.press("Enter");
await page.waitForSelector("#name-form.open");
await page.fill("#hero-name", "小林");
await page.locator("#name-form button[type=submit]").click();
await waitEvent("scene:overworld");
await clickGame(1100, 250);
await waitEvent("scene:profiles");

const badId = "p_badbadbadbadbadbadbadbadbadbad";
await page.evaluate((id) => {
  const roster = JSON.parse(localStorage.getItem("lexiquest.profiles.v1") || "{\"slots\":[]}");
  roster.slots.push({ id, createdAt: 1 });
  localStorage.setItem("lexiquest.profiles.v1", JSON.stringify(roster));
  localStorage.setItem(`lexiquest.profile.v1.${id}`, "{");
}, badId);
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });
await page.waitForTimeout(400);
const before = await rawMap();
if (before.ids.length !== 2 || before.files[badId] !== "{") throw new Error(`mixed roster ${JSON.stringify(before.ids)}`);
const goodId = before.ids[0];
const opening = await canvasText();
if (!opening.includes("请家长删") || !opening.includes("选这个") || !opening.includes("小林")) {
  throw new Error(`picker did not show a parent delete for the bad slot: ${opening}`);
}
await shot("unreadable-mixed");

await clickGame(640, 358);
await page.waitForSelector("#pin-form.open");
await shot("unreadable-pin");
const locked = await rawMap();
if (locked.files[goodId] !== before.files[goodId] || locked.files[badId] !== "{") {
  throw new Error("opening the parent PIN changed a character file");
}
await unlockPin();
const afterPin = await rawMap();
if (afterPin.files[goodId] !== before.files[goodId] || afterPin.files[badId] !== "{") {
  throw new Error("unlocking deleted a slot");
}

await clickGame(640, 358);
await page.waitForTimeout(300);
const armedText = await canvasText();
const armed = await rawMap();
if (!armedText.includes("再按一次，删除这个角色")) throw new Error(`first press did not arm: ${armedText}`);
if (armed.files[goodId] !== before.files[goodId] || armed.files[badId] !== "{") throw new Error("first press deleted a slot");
await shot("unreadable-armed");

await clickGame(640, 358);
await page.waitForTimeout(300);
const removed = await rawMap();
if (removed.ids.includes(badId) || removed.files[badId]) throw new Error("bad slot was not removed");
if (removed.files[goodId] !== before.files[goodId]) throw new Error("the readable character file changed");
if (!(await canvasText()).includes("小林")) throw new Error("the readable character left the picker");
await shot("unreadable-after-delete");

const badIds = [
  "p_bad00000000000000000000000001",
  "p_bad00000000000000000000000002",
  "p_bad00000000000000000000000003",
  "p_bad00000000000000000000000004",
  "p_bad00000000000000000000000005",
  "p_bad00000000000000000000000006",
];
await page.evaluate((ids) => {
  const roster = JSON.parse(localStorage.getItem("lexiquest.profiles.v1"));
  roster.slots = ids.map((id) => ({ id, createdAt: 1 }));
  localStorage.setItem("lexiquest.profiles.v1", JSON.stringify(roster));
  for (const id of ids) localStorage.setItem(`lexiquest.profile.v1.${id}`, `{${id}`);
}, badIds);
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__LEXIQUEST__?.scene === "profiles", null, { timeout: 15000 });
await page.waitForTimeout(400);
const fullText = await canvasText();
if (!fullText.includes("请家长删") || fullText.includes("选这个")) throw new Error(`six bad slots were selectable: ${fullText}`);
if (await buttonEnabled("新建角色") !== false || await buttonEnabled("读入存档") !== false) {
  throw new Error("new and import stayed available while every slot was full");
}
await clickGame(420, 700);
await page.waitForTimeout(300);
if ((await page.evaluate(() => window.__LEXIQUEST__?.scene)) !== "profiles") throw new Error("new character opened while all six slots were bad");
await shot("unreadable-six");
const fullFiles = await rawMap();

await clickGame(250, 358);
await unlockPin();
await clickGame(250, 358);
await page.waitForTimeout(200);
const stillFull = await rawMap();
if (stillFull.ids.length !== 6) throw new Error("first press removed a full-picker slot");
await clickGame(250, 358);
await page.waitForTimeout(300);
const reclaimed = await rawMap();
if (reclaimed.ids.length !== 5 || reclaimed.ids.includes(badIds[0])) throw new Error(`slot was not reclaimed ${reclaimed.ids.length}`);
for (const id of badIds.slice(1)) {
  if (reclaimed.files[id] !== fullFiles.files[id]) throw new Error(`another bad file changed: ${id}`);
}
if (await buttonEnabled("新建角色") !== true) throw new Error("new character stayed disabled after a slot was freed");
await clickGame(420, 700);
await waitEvent("scene:grades");
await shot("unreadable-reclaimed");

if (errors.length > 0) throw new Error(errors.join("\n"));
console.log(JSON.stringify({
  mixedDeleted: badId,
  goodUnchanged: true,
  sixReclaimed: true,
  scene: await page.evaluate(() => window.__LEXIQUEST__?.scene),
  errors,
}));
await browser.close();

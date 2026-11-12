import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const exe = process.env.LEXIQUEST_EXE ?? path.resolve("dist-desktop/linux-unpacked/lexiquest");
const shots = process.env.LEXIQUEST_SHOTS ?? "/opt/cursor/artifacts";
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "lexiquest-desktop-"));
const probe = "lexiquest.desktop.probe";
const saveKey = "lexiquest.save.v1";
const save = JSON.stringify({
  version: 1,
  createdAt: 1_700_000_000_000,
  player: {
    name: "小林",
    classId: "warrior",
    appearance: {
      skinId: "peach",
      hairStyle: "bob",
      hairColorId: "brown",
      eyeStyle: "bright",
      clothColorId: "fern",
      glasses: false,
      freckles: true,
    },
  },
  wordCards: {},
  memory: {},
  skillLevels: { "warrior-bash": 1 },
  unlockedSkillIds: ["warrior-bash"],
  equippedSkillIds: ["warrior-bash"],
  ownedOutfitIds: ["traveler"],
  equippedOutfitId: "traveler",
  rewardQueue: [],
  xp: 0,
  clockOffsetMs: 0,
  battlesWon: 0,
  battlesLost: 0,
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function shot(page, name) {
  fs.mkdirSync(shots, { recursive: true });
  return page.screenshot({ path: path.join(shots, name) });
}

async function waitForCdp(port) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // The port is not open yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("devtools port did not open");
}

async function launch() {
  const port = await freePort();
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userData}`,
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ];
  const child = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const collect = (chunk) => {
    log += chunk.toString();
    if (log.length > 20000) log = log.slice(-20000);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  const exited = new Promise((_, reject) => {
    child.once("exit", (code) => reject(new Error(`electron exited ${code}\n${log}`)));
  });
  await Promise.race([waitForCdp(port), exited]);
  exited.catch(() => {});
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? (await context.waitForEvent("page"));
  await page.waitForSelector("#game", { timeout: 20000 });
  await page.waitForTimeout(800);
  return { child, browser, page };
}

async function closeApp(session) {
  await session.page.close({ runBeforeUnload: true }).catch(() => {});
  await session.browser.close().catch(() => {});
  if (session.child.exitCode === null) session.child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (session.child.exitCode !== null) resolve();
    else session.child.once("exit", () => resolve());
  });
}

if (!fs.existsSync(exe)) {
  console.error(`missing packaged executable: ${exe}`);
  process.exit(1);
}

const first = await launch();
const origin = await first.page.evaluate(() => location.origin);
await shot(first.page, "elec2-boot.png");
const written = await first.page.evaluate(
  ({ probe, saveKey, save }) => {
    localStorage.setItem(probe, "kept");
    localStorage.setItem(saveKey, save);
    return localStorage.getItem(probe) === "kept" && localStorage.getItem(saveKey) === save;
  },
  { probe, saveKey, save },
);
const csp = await first.page.evaluate(() => {
  return new Promise((resolve) => {
    let violation = null;
    document.addEventListener("securitypolicyviolation", (event) => {
      violation = event.violatedDirective || event.effectiveDirective;
    });
    const script = document.createElement("script");
    script.textContent = "window.__cspInline = 1";
    document.documentElement.appendChild(script);
    setTimeout(() => {
      resolve({
        violation,
        ran: window.__cspInline === 1,
      });
    }, 300);
  });
});
const opened = await first.page.evaluate(() => window.open("https://example.com/") !== null);
const header = await first.page.evaluate(async () => {
  const response = await fetch("app://lexiquest/index.html");
  return response.headers.get("content-security-policy");
});
await first.page.evaluate(
  ({ origin, written, csp, opened }) => {
    const panel = document.createElement("div");
    panel.textContent = [
      `origin ${origin}`,
      `storage ${written ? "wrote" : "failed"}`,
      `inline ${csp.ran ? "ran" : "blocked"} ${csp.violation ?? ""}`,
      `window.open ${opened ? "opened" : "denied"}`,
    ].join(" · ");
    panel.style.cssText =
      "position:fixed;left:24px;right:24px;bottom:24px;z-index:9;padding:16px 20px;background:#fff4dc;color:#3b2a20;border:3px solid #3b2a20;border-radius:16px;font:24px/1.4 sans-serif;";
    document.body.append(panel);
  },
  { origin, written, csp, opened },
);
await shot(first.page, "elec2-checks.png");

async function poke(page, target) {
  await page.evaluate((next) => {
    location.href = next;
  }, target).catch((error) => {
    console.log("navigate threw", target, error.message);
  });
  await page.waitForTimeout(1200);
  try {
    await page.waitForSelector("#game", { timeout: 20000 });
  } catch (error) {
    const href = await page.evaluate(() => location.href).catch((failure) => failure.message);
    console.log("left the game", target, href);
    throw error;
  }
  return page.evaluate(() => ({
    href: location.href,
    game: Boolean(document.querySelector("#game")),
    label: document.documentElement.dataset.clearCacheLabel ?? "",
    notice: document.documentElement.dataset.saveCacheNotice ?? "",
  }));
}

function stayedHome(state) {
  return Boolean(state && state.game && typeof state.href === "string" && state.href.startsWith("app://lexiquest/"));
}

const afterBlank = await poke(first.page, "about:blank");
await first.page.evaluate((state) => {
  const panel = document.createElement("div");
  panel.textContent = `about:blank ${state.href}`;
  panel.style.cssText =
    "position:fixed;left:24px;right:24px;bottom:24px;z-index:9;padding:16px 20px;background:#fff4dc;color:#3b2a20;border:3px solid #3b2a20;border-radius:16px;font:24px/1.4 sans-serif;";
  document.body.append(panel);
}, afterBlank);
await shot(first.page, "elec2-about-blank.png");

const afterSrcdoc = await poke(first.page, "about:srcdoc");
await first.page.evaluate((state) => {
  const panel = document.createElement("div");
  panel.textContent = `about:srcdoc ${state.href}`;
  panel.style.cssText =
    "position:fixed;left:24px;right:24px;bottom:24px;z-index:9;padding:16px 20px;background:#fff4dc;color:#3b2a20;border:3px solid #3b2a20;border-radius:16px;font:24px/1.4 sans-serif;";
  document.body.append(panel);
}, afterSrcdoc);
await shot(first.page, "elec2-about-srcdoc.png");

const desktopCopy = await first.page.evaluate(() => ({
  label: document.documentElement.dataset.clearCacheLabel ?? "",
  notice: document.documentElement.dataset.saveCacheNotice ?? "",
  pinNote: document.getElementById("pin-note")?.textContent ?? "",
}));
await first.page.evaluate((copy) => {
  const panel = document.createElement("div");
  panel.textContent = `${copy.label} · ${copy.notice}`;
  panel.style.cssText =
    "position:fixed;left:24px;right:24px;bottom:24px;z-index:9;padding:16px 20px;background:#fff4dc;color:#3b2a20;border:3px solid #3b2a20;border-radius:16px;font:24px/1.4 sans-serif;";
  document.body.append(panel);
}, desktopCopy);
await shot(first.page, "elec2-copy.png");
await closeApp(first);

const second = await launch();
const restored = await second.page.evaluate(
  ({ probe, saveKey }) => ({
    probe: localStorage.getItem(probe),
    name: JSON.parse(localStorage.getItem(saveKey) ?? "{}")?.player?.name ?? null,
  }),
  { probe, saveKey },
);
await second.page.evaluate((name) => {
  const panel = document.createElement("div");
  panel.textContent = `restart save ${name ?? "missing"}`;
  panel.style.cssText =
    "position:fixed;left:24px;right:24px;bottom:24px;z-index:9;padding:16px 20px;background:#fff4dc;color:#3b2a20;border:3px solid #3b2a20;border-radius:16px;font:24px/1.4 sans-serif;";
  document.body.append(panel);
}, restored.name);
await shot(second.page, "elec2-restart.png");
await closeApp(second);

const report = {
  origin,
  storageWritten: written,
  inlineBlocked: csp.ran === false,
  cspViolation: csp.violation,
  cspHeader: header,
  windowOpenDenied: opened === false,
  probeRestored: restored.probe === "kept",
  saveNameRestored: restored.name === "小林",
  aboutBlankStayed: stayedHome(afterBlank),
  aboutSrcdocStayed: stayedHome(afterSrcdoc),
  aboutBlankHref: afterBlank?.href ?? null,
  aboutSrcdocHref: afterSrcdoc?.href ?? null,
  desktopLabel: desktopCopy.label,
  desktopNotice: desktopCopy.notice,
  pinNote: desktopCopy.pinNote,
};
console.log(JSON.stringify(report, null, 2));
const desktopWording =
  report.desktopLabel === "清除这台电脑上的存档" &&
  report.desktopNotice.includes("这台电脑") &&
  report.desktopNotice.includes("游戏数据") &&
  !report.desktopNotice.includes("站点数据") &&
  report.pinNote.includes("这台电脑") &&
  !report.pinNote.includes("浏览器") &&
  !report.desktopLabel.includes("浏览器") &&
  !report.desktopNotice.includes("浏览器");
const ok =
  report.origin === "app://lexiquest" &&
  report.storageWritten &&
  report.inlineBlocked &&
  report.windowOpenDenied &&
  report.probeRestored &&
  report.saveNameRestored &&
  report.aboutBlankStayed &&
  report.aboutSrcdocStayed &&
  desktopWording;
if (!ok) process.exit(1);

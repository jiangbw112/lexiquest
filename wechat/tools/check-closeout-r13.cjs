/**
 * 原来：村子按钮带数字、确认和上一章只是说明、换职业贴在旋风斩下面、给家长右侧空着，战斗结算没真正点进去。
 * 现在：同一套横屏规则下点真实按钮，Chrome 画布留下 844×390。
 * 为什么：这是 Node/Chrome 适配器的 paintFrame 回放，不是微信开发者工具，也不是真机。
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const evidence = path.join(root, "evidence");
const shots = "/opt/cursor/artifacts";
const lines = [];
const problems = [];
function log(message) {
  lines.push(message);
  console.log(message);
}
function problem(message) {
  problems.push(message);
  log(`PROBLEM ${message}`);
}

async function main() {
  const gameSrc = fs.readFileSync(path.join(root, "lib", "game.cjs.js"), "utf8");
  fs.mkdirSync("/tmp/lexi-phone-r13", { recursive: true });
  fs.writeFileSync(
    "/tmp/lexi-phone-r13/game.js",
    `var module={exports:{}};var exports=module.exports;\ntry{\n${gameSrc}\nwindow.__GAME__=module.exports;\n}catch(error){window.__GAME_ERR__=String(error&&error.stack||error);}\n`,
  );
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    if (url === "/" || url === "/index.html") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><body style="margin:0;background:#000">
        <canvas id="c"></canvas>
        <form id="spell-form"><input id="spell-input"></form>
        <form id="name-form"><input id="hero-name"><p id="name-error"></p></form>
        <form id="pin-form"><p id="pin-title">先设一个家长密码</p><input id="pin-input" value=""><input id="pin-confirm" value=""><p id="pin-error"></p><span id="pin-confirm-label"></span></form>
      </body>`);
      return;
    }
    const file = path.join(root, url.replace(/^\/+/, ""));
    if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const type = file.endsWith(".webp") ? "image/webp" : file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".js") ? "text/javascript" : "image/png";
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  const saved = [];
  async function paint(name) {
    await page.evaluate(() => {
      const scene = window.__close.runtime.active();
      if (scene && scene.key === "battle-results" && scene.update) scene.update(0, 500);
    });
    const result = await page.evaluate(async () => {
      const { game, canvas, ctx, runtime, loadBitmaps } = window.__close;
      const scene = runtime.active();
      await loadBitmaps(scene);
      const view = { w: 844, h: 390 };
      canvas.width = view.w;
      canvas.height = view.h;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, view.w, view.h);
      const plan = game.paintFrame(scene, ctx, view);
      const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
      const box = (item) => ({
        text: item.text || "",
        x: Math.round(item.x),
        y: Math.round(item.y),
        w: Math.round(item.w),
        h: Math.round(item.h),
        on: Boolean(item.node && item.node.inputEnabled),
      });
      return {
        key: scene && scene.key,
        png: canvas.toDataURL("image/png"),
        texts: plan.texts.filter((item) => item.w > 0 && item.h > 0).map(box),
        hits: plan.hits.filter((item) => item.w >= 1 && item.h >= 1).map(box),
        overflow: plan.overflow,
        left: pixel(2, 195),
        right: pixel(841, 195),
        center: pixel(420, 195),
        phase: scene && scene.phase,
        picking: scene && scene.picking,
        notice: scene && scene.noticeText,
      };
    });
    const file = path.join(evidence, name);
    fs.writeFileSync(file, Buffer.from(result.png.split(",")[1], "base64"));
    fs.mkdirSync(shots, { recursive: true });
    fs.copyFileSync(file, path.join(shots, name));
    saved.push(name);
    const dark = (pixel) => pixel[0] < 12 && pixel[1] < 12 && pixel[2] < 12;
    log(`${name} scene=${result.key} overflow=${result.overflow} phase=${result.phase || "-"} edge=${result.left.join(",")} | ${result.center.join(",")} | ${result.right.join(",")}`);
    log(`  texts ${result.texts.map((item) => item.text).join(" / ")}`);
    log(`  hits ${result.hits.map((item) => `${item.text}${item.on ? "" : "*"}@${item.x},${item.y} ${item.w}x${item.h}`).join(" | ")}`);
    if (dark(result.left) && dark(result.right) && dark(result.center)) problem(`${name} looks letterboxed`);
    if (result.overflow) problem(`${name} overflow ${result.overflow}`);
    const shortcuts = [...result.texts, ...result.hits].map((item) => item.text).filter((text) => /Enter|Esc|这台电脑|词境冒险/.test(text) || /^(学堂|对战|词卡册|复习桌|技能|衣柜|同机练习|给家长) \d$/.test(text) || /^\d (攻击|格挡|治疗)$/.test(text));
    if (shortcuts.length) problem(`${name} shortcut copy ${shortcuts.join(" / ")}`);
    return result;
  }
  async function press(label) {
    const result = await page.evaluate((wanted) => {
      const { game, runtime } = window.__close;
      const scene = runtime.active();
      const plan = game.layoutFrame(scene, { w: 844, h: 390 });
      const hits = plan.hits.filter((item) => item.w >= 1 && item.h >= 1);
      const hit = hits.find((item) => item.text === wanted) || hits.find((item) => item.text.includes(wanted));
      if (!hit) return { ok: false, key: scene && scene.key, labels: hits.map((item) => item.text) };
      const armed = Boolean(hit.node && hit.node.inputEnabled);
      game.pressFrame(scene, { w: 844, h: 390 }, hit.x + hit.w / 2, hit.y + hit.h / 2);
      if (scene.update) scene.update(0, 400);
      const next = runtime.active();
      return { ok: true, from: scene && scene.key, key: next && next.key, text: hit.text, on: armed };
    }, label);
    log(`press ${label} -> ${result.ok ? `${result.text} (${result.from} -> ${result.key}, on=${result.on})` : `missing [${(result.labels || []).join(" / ")}]`}`);
    if (!result.ok) problem(`could not press ${label}`);
    return result;
  }
  function chapterOf(shot) {
    const joined = shot.texts.map((item) => item.text).join(" ");
    const match = joined.match(/第\s*(\d+)\s*\/\s*(\d+)\s*章/);
    return match ? Number(match[1]) : null;
  }
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.addScriptTag({ path: "/tmp/lexi-phone-r13/game.js" });
    const booted = await page.evaluate(async () => {
      if (window.__GAME_ERR__) return window.__GAME_ERR__;
      function readModule(source) {
        const module = { exports: {} };
        new Function("module", "exports", source)(module, module.exports);
        return module.exports;
      }
      const atlas = readModule(await (await fetch("/assets/atlas-json/index.js")).text());
      const jsonIndex = readModule(await (await fetch("/packages/art-json-index.js")).text());
      const packed = readModule(await (await fetch("/packages/art-index.js")).text());
      const texts = { ...atlas };
      await Promise.all(Object.entries(jsonIndex).map(async ([url, rel]) => {
        const response = await fetch(`/${rel}`);
        texts[url] = response.ok ? await response.text() : null;
      }));
      globalThis.__LEXI_READ_ASSET__ = (url) => (Object.prototype.hasOwnProperty.call(texts, url) ? texts[url] : null);
      globalThis.__LEXI_PACKED_IMAGE__ = (url) => (Object.prototype.hasOwnProperty.call(packed, url) ? packed[url] : null);
      const bitmaps = {};
      globalThis.__LEXI_IMAGE_BITMAPS__ = bitmaps;
      async function loadBitmaps(scene) {
        const urls = new Set();
        const walk = (node) => {
          if (!node || node.visible === false) return;
          if (node.texture && scene.textures) {
            const tex = scene.textures.get(node.texture);
            if (tex && tex.image && !tex.missing) urls.add(tex.image);
          }
          for (const child of node.list || []) walk(child);
        };
        for (const node of scene.children.list) walk(node);
        // Phone chrome can use an atlas that no scene node names. The WeChat
        // client decodes every packed image; this replay has to do the same
        // for atlases already loaded, or a button face is skipped and only
        // the cream label is drawn.
        if (scene.textures) {
          for (const key of ["atlas_ui_core", "atlas_ui_pages", "atlas_battle", "atlas_parent", "atlas_wardrobe"]) {
            const tex = scene.textures.get(key);
            if (tex && tex.image && !tex.missing) urls.add(tex.image);
          }
        }
        for (const url of urls) {
          if (bitmaps[url] || !packed[url]) continue;
          const image = new Image();
          image.src = `/${packed[url]}`;
          await image.decode();
          bitmaps[url] = image;
        }
      }
      const game = window.__GAME__;
      for (const id of ["pin-input", "pin-confirm", "pin-answer", "pin-error", "pin-title", "pin-forgot-button", "pin-submit", "pin-confirm-label", "pin-entry", "pin-forgot", "pin-challenge", "pin-cooldown"]) {
        const tag = id.includes("input") || id === "pin-answer" || id === "pin-confirm" ? "input" : "div";
        const node = document.createElement(tag);
        node.id = id;
        node.style.position = "absolute";
        node.style.left = "-4000px";
        document.body.appendChild(node);
        game.bindField(id);
      }
      game.bindField("pin-form");
      const canvas = document.getElementById("c");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const runtime = game.createGame(canvas, { width: 844, height: 390 });
      game.openPractice();
      runtime.start("title");
      const scene = runtime.active();
      const warm = {
        bg_home: "assets/warm/backgrounds/bg_home_2x.webp",
        bg_village: "assets/warm/backgrounds/bg_village_2x.webp",
        bg_room: "assets/warm/backgrounds/bg_room_2x.webp",
        bg_map: "assets/warm/backgrounds/bg_map_forest_2x.webp",
        bg_forest: "assets/warm/backgrounds/bg_forest_battle_2x.webp",
        bg_learn: "assets/warm/backgrounds/bg_learn_blur_2x.webp",
        bg_parent: "assets/warm/backgrounds/bg_parent_paper_2x.webp",
        bg_ending: "assets/warm/backgrounds/bg_ending_2x.webp",
      };
      for (const [key, url] of Object.entries(warm)) {
        if (scene.textures && !scene.textures.exists(key)) scene.load.image(key, url);
      }
      if (scene.load.totalToLoad > 0) scene.load.start();
      window.__close = { game, canvas, ctx, runtime, loadBitmaps };
      return runtime.active() && runtime.active().key;
    });
    log(`runtime Chrome canvas, not WeChat DevTools, not a phone. viewport 844x390. boot ${booted}`);
    if (booted !== "title") problem(`title did not boot: ${booted}`);

    await press("继续学习");
    const village = await paint("w8-v02-overworld-844x390.png");
    const villageNames = ["换角色", "学堂", "对战", "给家长", "词卡册", "复习桌", "同机练习", "技能", "衣柜"];
    for (const name of villageNames) {
      const hit = village.hits.find((item) => item.text === name);
      if (!hit) problem(`village missing ${name}`);
      else if (hit.w < 44 || hit.h < 44) problem(`village ${name} small ${hit.w}x${hit.h}`);
    }

    await press("衣柜");
    const wardrobe = await paint("w8-v02-wardrobe-844x390.png");
    const worn = wardrobe.texts.find((item) => item.text === "穿着");
    if (!worn) problem("wardrobe missing 穿着");
    else if (worn.h < 32 || worn.y < 16) problem(`穿着 is outside its chip y=${worn.y} ${worn.w}x${worn.h}`);
    else {
      const face = await page.evaluate((box) => Array.from(window.__close.ctx.getImageData(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2), 1, 1).data), worn);
      log(`穿着 face rgb=${face[0]},${face[1]},${face[2]}`);
      if (face[0] > 180 && face[1] > 180) problem(`穿着 has no button face rgb=${face[0]},${face[1]},${face[2]}`);
    }
    if ((await page.evaluate(() => window.__close.runtime.active().key)) !== "overworld") await press("返回");

    await press("技能");
    const skills = await paint("w8-v02-skills-844x390.png");
    const hint = skills.texts.find((item) => item.text.includes("卡组分开存"));
    const slash = skills.texts.find((item) => item.text.includes("旋风斩") || item.text.includes("词灵推远"));
    const job = skills.hits.find((item) => item.text === "换职业");
    const badges = skills.hits.filter((item) => item.text === "已装备" || item.text === "未装备");
    log(`skill badges ${badges.map((item) => `${item.text}@${item.x},${item.y}`).join(" | ") || "none"}`);
    if (badges.some((item) => item.text === "已装备")) {
      await press("已装备");
      const off = await paint("w8-v02-skills-unequipped-844x390.png");
      if (!off.hits.some((item) => item.text === "未装备") && !off.texts.some((item) => item.text === "未装备")) problem("unequipped skill has no 未装备 badge");
      await press("未装备");
    }
    if (!hint) problem("skills hint missing");
    if (!job) problem("换职业 is not a button");
    if (hint && slash && hint.y < slash.y + slash.h + 16) problem(`skills hint still follows 旋风斩 y=${hint.y} slash=${slash.y}+${slash.h}`);
    if (hint && job && hint.y + hint.h > job.y + 4) problem(`skills hint overlaps 换职业 hint=${hint.y}+${hint.h} job=${job.y}`);
    await press("返回");

    await press("学堂");
    const learn = await paint("w8-v02-learn-844x390.png");
    const confirm = learn.hits.find((item) => item.text === "确认");
    if (!confirm) problem("确认 is not a visible control");
    else if (confirm.on) problem("确认 is enabled before a chapter is chosen");
    else if (confirm.w < 44 || confirm.h < 44) problem(`确认 small ${confirm.w}x${confirm.h}`);
    const chapterHit = learn.hits.find((item) => item.text.includes("森林") || item.text.includes("朋友"));
    if (!chapterHit) problem("no chapter button on the academy");
    else await press(chapterHit.text);
    const learnReady = await paint("w8-v02-learn-ready-844x390.png");
    const confirmOn = learnReady.hits.find((item) => item.text === "确认");
    if (!confirmOn || !confirmOn.on) problem("确认 stayed disabled after a chapter click");
    else {
      await press("确认");
      const afterLearn = await page.evaluate(() => {
        const scene = window.__close.runtime.active();
        return { key: scene && scene.key, phase: scene && scene.phase, picking: scene && scene.picking };
      });
      log(`learn confirm -> ${JSON.stringify(afterLearn)}`);
      if (afterLearn.key !== "learn" || afterLearn.picking !== false) problem(`确认 did not leave the picker ${JSON.stringify(afterLearn)}`);
      const study = await paint("w8-v02-learn-study-844x390.png");
      for (const label of ["学一学", "听一听", "选意思", "拼一拼", "上一个", "下一个", "确认"]) {
        const seen = study.hits.some((item) => item.text === label) || study.texts.some((item) => item.text === label);
        if (!seen) problem(`study missing ${label}`);
      }
      const studyTab = study.hits.find((item) => item.text === "学一学") || study.texts.find((item) => item.text === "学一学");
      if (studyTab && (studyTab.y < 40 || studyTab.h < 32)) problem(`学一学 clipped y=${studyTab.y} h=${studyTab.h}`);
    }
    if ((await page.evaluate(() => window.__close.runtime.active().key)) !== "overworld") await press("返回");
    if ((await page.evaluate(() => window.__close.runtime.active().key)) !== "overworld") {
      await page.evaluate(() => window.__close.runtime.start("overworld"));
      log("returned to overworld by the village entry after learn");
    }

    await press("对战");
    const stages = await paint("w8-v02-stages-844x390.png");
    const prev = stages.hits.find((item) => item.text === "上一章");
    const firstChapter = chapterOf(stages);
    if (!prev) problem("上一章 is not a visible control");
    else if (prev.w < 44 || prev.h < 44) problem(`上一章 small ${prev.w}x${prev.h}`);
    else if (prev.on) problem("上一章 is enabled on the first chapter");
    if (stages.texts.some((item) => item.text.trim() === "?")) problem("stages still shows ?");
    log(`stages chapter ${firstChapter}`);
    await press("下一章");
    const nextChapter = await paint("w8-v02-stages-next-844x390.png");
    const second = chapterOf(nextChapter);
    const prevOn = nextChapter.hits.find((item) => item.text === "上一章");
    log(`stages after 下一章 ${second}`);
    if (second == null || firstChapter == null || second <= firstChapter) problem(`下一章 did not advance ${firstChapter} -> ${second}`);
    if (!prevOn || !prevOn.on) problem("上一章 stayed disabled after 下一章");
    await press("上一章");
    const backChapter = await paint("w8-v02-stages-prev-844x390.png");
    const third = chapterOf(backChapter);
    log(`stages after 上一章 ${third}`);
    if (third !== firstChapter) problem(`上一章 did not return ${second} -> ${third}, expected ${firstChapter}`);

    await press("下一章");
    await press("上一章");
    const fight = await press("小战斗");
    if (!fight.ok || fight.key !== "battle") problem(`小战斗 did not open battle (${fight.key})`);
    else {
      const battle = await paint("w8-v02-battle-844x390.png");
      if (battle.hits.some((item) => item.text === "攻击") && !battle.texts.some((item) => item.text.includes("意思") || item.text.includes("？"))) {
        await press("攻击");
        await paint("w8-v02-battle-question-844x390.png");
      }
      const attack = battle.hits.find((item) => item.text === "攻击");
      if (!attack) problem("battle has no 攻击 button");
      else if (/^\d/.test(attack.text)) problem(`battle shortcut ${attack.text}`);
      const played = await page.evaluate(async () => {
        const { game, runtime } = window.__close;
        const notes = [];
        for (let turn = 0; turn < 30; turn += 1) {
          const scene = runtime.active();
          if (!scene || scene.key !== "battle") {
            notes.push(`left:${scene && scene.key}`);
            break;
          }
          const state = scene.state;
          if (!state) {
            notes.push("no-state");
            break;
          }
          notes.push(`${state.phase} hp=${state.enemyHp}/${state.playerHp} q=${state.question ? state.question.kind : "-"}`);
          if (state.phase === "won" || state.phase === "lost") {
            scene.update(0, 600);
            scene.input.emit("pointerdown", { x: 400, y: 200 });
            scene.update(0, 40);
            notes.push(`after-arm:${runtime.active() && runtime.active().key}`);
            break;
          }
          if (scene.resolving || scene.lunging) {
            scene.update(0, 260);
            continue;
          }
          if (state.phase === "question" && state.question) {
            if (state.question.kind === "spelling") {
              const input = document.getElementById("spell-input");
              if (input) input.value = state.question.answer;
              document.getElementById("spell-form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
            } else {
              const choice = (state.question.choices || []).find((item) => item.id === state.question.answerId);
              const plan = game.layoutFrame(scene, { w: 844, h: 390 });
              const hit = plan.hits.find((item) => choice && item.text.includes(choice.label));
              if (!hit) {
                notes.push(`no-choice:${choice && choice.label}:${plan.hits.map((item) => item.text).join("|")}`);
                break;
              }
              game.pressFrame(scene, { w: 844, h: 390 }, hit.x + hit.w / 2, hit.y + hit.h / 2);
            }
          } else if (state.phase === "choose") {
            const plan = game.layoutFrame(scene, { w: 844, h: 390 });
            const hit = plan.hits.find((item) => item.text === "攻击");
            if (!hit || !hit.node.inputEnabled) {
              notes.push(`no-attack:${plan.hits.map((item) => item.text).join("|")}`);
              break;
            }
            game.pressFrame(scene, { w: 844, h: 390 }, hit.x + hit.w / 2, hit.y + hit.h / 2);
          } else {
            notes.push(`idle:${state.phase}`);
            scene.update(0, 200);
          }
          scene.update(0, 260);
        }
        const scene = runtime.active();
        return { key: scene && scene.key, notes, error: scene && scene.failures };
      });
      log(`battle chain ${played.notes.join(" || ")}`);
      if (played.key !== "battle-results") problem(`battle-results not entered, scene=${played.key}`);
      else {
        const results = await paint("w8-v02-battle-results-844x390.png");
        const latin = results.texts.filter((item) => /^[A-Za-z][A-Za-z' -]+$/.test(item.text) && item.text.length <= 18);
        for (const word of latin) {
          const near = results.texts.filter((item) => /[\u4e00-\u9fff]/.test(item.text) && Math.abs(item.y - word.y) <= 8 && item.x > word.x);
          log(`result ${word.text} -> ${near.map((item) => item.text).join(",") || "no gloss"}`);
          if (!near.length) problem(`result ${word.text} has no gloss on its row`);
        }
        let closed = await press("继续");
        if (!closed.ok) closed = await press("回地图");
        if (!closed.ok) closed = await press("看结局");
        if (!closed.ok || closed.key === "battle-results") problem(`battle-results did not close (${closed.key})`);
      }
    }

    const marked = await page.evaluate(() => {
      const game = window.__GAME__;
      if (typeof game.markChaptersCleared !== "function") return "missing helper";
      const save = game.markChaptersCleared(["pep_g3_01", "pep_g3_02"]);
      return save && save.chapterProgress && save.chapterProgress.pep_g3_02 && save.chapterProgress.pep_g3_02.cleared ? "marked" : "not-cleared";
    });
    const learned = await page.evaluate(() => {
      const game = window.__GAME__;
      if (typeof game.markExamWordsLearned !== "function") return "missing helper";
      const save = game.markExamWordsLearned("exam_g3_s1_mid");
      const count = save && save.wordCards ? Object.keys(save.wordCards).length : 0;
      return `learned ${count} cards via learnWord on 2026-01-15, then the map button`;
    });
    log(`exam words ${learned}`);
    log(`exam save ${marked} (chapterProgress pep_g3_01 and pep_g3_02 cleared, then the map button)`);
    if (marked !== "marked") problem(`exam save setup failed: ${marked}`);
    if ((await page.evaluate(() => window.__close.runtime.active().key)) !== "stages") {
      await page.evaluate(() => window.__close.runtime.start("stages"));
    }
    let examShot = null;
    for (let step = 0; step < 12; step += 1) {
      const peek = await page.evaluate(() => {
        const { game, runtime } = window.__close;
        const scene = runtime.active();
        const plan = game.layoutFrame(scene, { w: 844, h: 390 });
        const hits = plan.hits.map((item) => item.text);
        const texts = plan.texts.map((item) => item.text).join(" ");
        const frames = [];
        const walk = (node) => {
          if (!node || node.visible === false) return;
          if (node.frame && String(node.frame).includes("exam")) frames.push(String(node.frame));
          for (const child of node.list || []) walk(child);
        };
        for (const node of scene.children.list) walk(node);
        return { key: scene.key, chapter: scene.viewChapterId, hits, texts, frames, atlas: scene.textures.exists("atlas_exam_ui"), failures: scene.game.failures.slice(-4) };
      });
      log(`exam scan ${step} ${peek.chapter} atlas=${peek.atlas} frames=${peek.frames.join(",") || "-"} hits=${peek.hits.join(" / ")} fail=${(peek.failures || []).join(" ; ")}`);
      if (peek.hits.some((item) => item.includes("期中挑战")) || peek.frames.length) {
        examShot = await paint("w8-v02-stages-exam-844x390.png");
        break;
      }
      const advanced = await press("下一章");
      if (!advanced.ok) break;
    }
    if (!examShot || !examShot.hits.some((item) => item.text.includes("期中挑战"))) problem("期中挑战 never became a map button");
    else {
      await press("期中挑战");
      let exam = await paint("w8-v02-exam-intro-844x390.png");
      const start = exam.hits.find((item) => item.text === "开始答题");
      if (start && (start.h < 44 || start.y < 16)) problem(`开始答题 sits on the button edge y=${start.y} h=${start.h}`);
      if (exam.key === "exam-battle" && start) {
        await press("开始答题");
        exam = await paint("w8-v02-exam-battle-844x390.png");
      }
      const hasStem = (shot) => shot.texts.some((item) => /意思|怎么说|？|\?/.test(item.text));
      if (!hasStem(exam) && exam.hits.some((item) => item.text === "攻击")) {
        await press("攻击");
        exam = await paint("w8-v02-exam-battle-844x390.png");
      }
      const asked = await paint("w8-v02-exam-question-844x390.png");
      const choices = asked.hits.filter((item) => item.text && !/攻击|期中|期末|返回|回地图|休息|暂停/.test(item.text));
      log(`exam-question stem=${hasStem(asked)} choices=${choices.map((item) => item.text).join("|") || "none"}`);
      if (!hasStem(asked)) problem("exam question has no stem");
      if (choices.length < 2) problem(`exam question has ${choices.length} choices`);
      if (asked.texts.some((item) => /最近学过|准备好了/.test(item.text))) problem("exam question still shows the intro sentence");
      const joined = asked.texts.map((item) => item.text).join(" ");
      if (asked.key !== "exam-battle") problem(`exam-battle not entered, scene=${asked.key} texts=${joined}`);
      else if (/EXAM_|失败|锁|没有可用题目/.test(joined)) problem(`exam-battle notice: ${joined}`);
    }

    await page.evaluate(() => window.__close.runtime.start("title"));
    await press("重新开始");
    const grades = await paint("w8-v02-grades-844x390.png");
    const proceed = grades.hits.find((item) => item.text.includes("选好了"));
    if (!proceed) problem("选好了，去起名字 is not a visible control");
    else if (proceed.on) problem("grade proceed is enabled before a grade is chosen");
    else if (proceed.w < 44 || proceed.h < 44) problem(`grade proceed small ${proceed.w}x${proceed.h}`);
    await press("三年级");
    const gradesReady = await paint("w8-v02-grades-ready-844x390.png");
    const proceedOn = gradesReady.hits.find((item) => item.text.includes("选好了"));
    if (!proceedOn || !proceedOn.on) problem("选好了 stayed disabled after 三年级");
    else {
      await press("选好了");
      const created = await paint("w8-v02-create-844x390.png");
      if (created.key !== "create") problem(`create not entered, scene=${created.key}`);
      const sign = created.texts.find((item) => item.text.includes("选一个职业"));
      if (!sign) problem("create missing 选一个职业");
      else if (sign.y > 70) problem(`选一个职业 fell to y=${sign.y}`);
      if (!created.hits.some((item) => item.text === "出发")) problem("create missing 出发");
    }

    await page.evaluate(() => window.__close.runtime.start("overworld"));
    await press("给家长");
    const guide = await paint("w8-v02-guide-setup-844x390.png");
    const note = guide.texts.find((item) => item.text.includes("不是安全登录"));
    const keys = guide.hits.filter((item) => /^[0-9]$/.test(item.text) || item.text === "清除" || item.text === "确认");
    const okKey = keys.find((item) => item.text === "确认");
    if (!note || keys.length < 10) problem("guide note or keypad missing");
    else {
      const keyLeft = Math.min(...keys.map((item) => item.x));
      const keyRight = Math.max(...keys.map((item) => item.x + item.w));
      log(`guide noteRight=${note.x + note.w} keyLeft=${keyLeft} keyRight=${keyRight} 确认=${okKey && okKey.w}x${okKey && okKey.h}`);
      if (note.x + note.w + 8 > keyLeft) problem("guide note overlaps the keypad");
      if (keyRight < 844 * 0.72) problem(`guide keypad leaves the right empty ${keyRight}`);
      if (!okKey || okKey.w < 52 || okKey.h < 44) problem("确认 is truncated or small");
      if (okKey) {
        const sample = await page.evaluate((box) => {
          const pixel = window.__close.ctx.getImageData(Math.round(box.x + box.w / 2), Math.round(box.y + box.h / 2), 1, 1).data;
          return [pixel[0], pixel[1], pixel[2]];
        }, okKey);
        log(`确认 face rgb=${sample.join(",")}`);
        if (sample[0] > 180 && sample[1] > 140 && sample[2] < 130) problem(`确认 is gold rgb=${sample.join(",")}`);
      }
    }
    for (const digit of ["1", "2", "3", "4"]) await press(digit);
    await press("确认");
    const again = await paint("w8-v02-guide-reenter-844x390.png");
    if (!again.texts.some((item) => item.text.startsWith("再输入一次"))) problem(`reenter title missing: ${again.texts.map((item) => item.text).join(" / ")}`);
    const slots = again.texts.filter((item) => item.text === "●" || item.text === "○");
    log(`reenter slots ${slots.map((item) => `${item.text}@${item.x},${item.y} ${item.w}x${item.h}`).join(" | ") || "none"}`);
    if (slots.length < 4) problem(`reenter has ${slots.length} pin slots`);

    log(`saved ${saved.join(" ")}`);
    if (problems.length) throw new Error(problems.join("\n"));
    log("closeout r13 done. Chrome adapter paintFrame replay, not WeChat, not a phone.");
  } finally {
    await browser.close();
    server.close();
    fs.writeFileSync(path.join(evidence, "w8-v02-closeout.log"), `${lines.join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  fs.writeFileSync(path.join(__dirname, "..", "evidence", "w8-v02-closeout.log"), `${lines.join("\n")}\n${error && error.stack || error}\n`);
  process.exit(1);
});

import { wordsForResults } from "../../src/domain/battle-results";
import { CATALOG_WORDS } from "../../src/domain/catalog";
import { PORTRAIT_ATLAS, portraitFrame } from "../../src/game/art/class-atlas";
import { queueClassPortraits, savedClassId } from "../../src/game/art/class-load";
import { getSave } from "../../src/game/session";
import type { GameNode } from "./node";
import type { TextStyle } from "./text";

/**
 * 原来：标题把 logo_title 当产品名，那张图上写的是「词境冒险」。给家长的密码只在 DOM 表单里，画布只剩说明。
 * 现在：标题改写「词境练习家」，并藏起那张旧木牌。给家长在画布上放小屏数字键，写入已经绑定的家长密码字段再提交。
 * 为什么：微信小屏不必照搬网页右侧设密码卡。密码仍走家长密码会话的保存和校验。
 */

interface PinNode {
  value?: string;
  textContent?: string;
  classList?: { contains: (name: string) => boolean };
  dispatch?: (type: string) => void;
  dispatchEvent?: (event: Event) => boolean;
}

interface PadScene {
  key: string;
  children: { list: GameNode[] };
  add: {
    text: (x: number, y: number, text: string, style?: TextStyle) => GameNode & { setText: (text: string) => unknown; setOrigin: (x: number, y?: number) => unknown };
    container: (x?: number, y?: number) => GameNode & { add: (child: GameNode) => unknown; setSize: (width: number, height: number) => unknown };
    image?: (x: number, y: number, key: string, frame?: string) => GameNode & { setDisplaySize?: (w: number, h: number) => unknown };
  };
  draw?: () => void;
}

function pinNode(id: string): PinNode | null {
  const doc = (globalThis as { document?: { getElementById?: (id: string) => PinNode | null } }).document;
  return doc?.getElementById?.(id) ?? null;
}

function submitForm(form: PinNode): void {
  if (typeof form.dispatch === "function") {
    form.dispatch("submit");
    return;
  }
  if (typeof form.dispatchEvent === "function" && typeof Event !== "undefined") {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

function hideLogo(node: GameNode): void {
  if ((node as { texture?: string }).texture === "logo_title") node.visible = false;
  const list = (node as { list?: GameNode[] }).list;
  if (list) for (const child of list) hideLogo(child);
}

function presentTitle(scene: PadScene): void {
  for (const node of scene.children.list) hideLogo(node);
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean }; load?: { image: (key: string, url: string) => void; start: () => void; totalToLoad: number } };
  if (host.textures && host.load && !host.textures.exists("logo_lexiquest_v02")) {
    host.load.image("logo_lexiquest_v02", "assets/warm/logo/logo_lexiquest_v02.png");
    if (host.load.totalToLoad > 0) host.load.start();
  }
  if (host.textures?.exists("logo_lexiquest_v02")) {
    const plaque = scene.add.image?.(0, 0, "logo_lexiquest_v02");
    plaque?.setDisplaySize?.(600, 184);
    if (plaque) plaque.name = "logo:v02";
  }
  const brand = scene.add.text(640, 28, "词境练习家", {
    fontFamily: "WenQuanYi Micro Hei, sans-serif",
    fontSize: "40px",
    color: "#3B2A20",
  });
  brand.setOrigin(0, 0);
  brand.name = "brand";
  const sub = scene.add.text(640, 72, "LexiQuest", {
    fontFamily: "WenQuanYi Micro Hei, sans-serif",
    fontSize: "16px",
    color: "#3B2A20",
  });
  sub.setOrigin(0, 0);
  sub.name = "brand-sub";
}

function presentGuide(scene: PadScene): void {
  const form = pinNode("pin-form");
  if (!form?.classList?.contains("open")) return;
  const input = pinNode("pin-input");
  const confirm = pinNode("pin-confirm");
  const title = pinNode("pin-title");
  const error = pinNode("pin-error");
  const confirmLabel = pinNode("pin-confirm-label");
  const titleText = title?.textContent || "先设一个家长密码";
  const showAgain = titleText.includes("先设") || (confirmLabel ? !confirmLabel.classList.contains("hidden") : false);
  let focus: "pin" | "again" = "pin";
  const ink = "#3B2A20";
  const label = (name: string, text: string, y: number) => {
    const node = scene.add.text(80, y, text, { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "18px", color: ink });
    node.name = name;
    return node;
  };
  const titleNode = label("pin:title", titleText, 200);
  const firstNode = label("pin:first", "", 236);
  const slots = [0, 1, 2, 3].map((index) => label(`pin:slot:${index}`, "○", 236));
  const errorNode = label("pin:error", error?.textContent || "", 296);
  label("pin:hint", "4 位数字。不会显示明文。", 330);
  const refresh = () => {
    const pin = input?.value || "";
    const again = confirm?.value || "";
    const current = focus === "again" ? again : pin;
    titleNode.setText(focus === "again" ? "再输入一次" : title?.textContent || titleText);
    firstNode.setText("");
    slots.forEach((slot, index) => slot.setText(index < current.length ? "●" : "○"));
    errorNode.setText(error?.textContent || "");
  };
  refresh();
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "清除", "0", "确认"];
  for (const text of keys) {
    const pad = scene.add.container(0, 0);
    const face = scene.add.text(0, 0, text, { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "20px", color: ink });
    pad.add(face);
    pad.setSize(text === "清除" || text === "确认" ? 80 : 48, 48);
    pad.setInteractive();
    pad.name = `pin:${text}`;
    pad.on("pointerup", () => {
      const target = focus === "again" ? confirm : input;
      if (text === "清除") {
        if (target) target.value = "";
      } else if (text === "确认") {
        if (showAgain && focus === "pin" && (input?.value || "").length >= 4) focus = "again";
        else submitForm(form);
      } else if (/^[0-9]$/.test(text) && target && (target.value || "").length < 4) {
        target.value = `${target.value || ""}${text}`;
      }
      refresh();
    });
  }
}

function shownText(scene: PadScene, text: string): boolean {
  let found = false;
  const walk = (node: GameNode) => {
    if (found || node.visible === false) return;
    if (node.type === "text" && String((node as { text?: string }).text ?? "") === text) found = true;
    const list = (node as { list?: GameNode[] }).list;
    if (list) for (const child of list) walk(child);
  };
  for (const node of scene.children.list) walk(node);
  return found;
}

function sceneTexts(scene: PadScene): string[] {
  const out: string[] = [];
  const walk = (node: GameNode) => {
    const text = (node as { text?: string }).text;
    if (node.type === "text" && text) out.push(String(text));
    const list = (node as { list?: GameNode[] }).list;
    if (list) for (const child of list) walk(child);
  };
  for (const node of scene.children.list) walk(node);
  return out;
}

function dropNamed(scene: PadScene, name: string): void {
  scene.children.list = scene.children.list.filter((node) => node.name !== name);
}

function wrapNamed(scene: PadScene, name: string, after: () => void): void {
  const host = scene as PadScene & Record<string, unknown>;
  const raw = host[name];
  if (typeof raw !== "function" || (raw as { presented?: boolean }).presented) return;
  const original = (raw as () => void).bind(scene);
  const wrapped = () => {
    original();
    after();
  };
  (wrapped as { presented?: boolean }).presented = true;
  host[name] = wrapped;
}

function wrapDraw(scene: PadScene, after: () => void): void {
  const raw = scene as PadScene & { draw?: (() => void) & { presented?: boolean } };
  if (!raw.draw || raw.draw.presented) return;
  const original = raw.draw.bind(scene);
  const wrapped = () => {
    original();
    after();
  };
  wrapped.presented = true;
  raw.draw = wrapped;
}

interface LearnLive {
  picking?: boolean;
  phase?: string;
  batchIds?: string[];
  question?: unknown;
  draw?: () => void;
  showStudy?: () => void;
  startMeaning?: () => void;
  startSpelling?: () => void;
}

function stepLearn(scene: LearnLive, delta: number): void {
  const cards = getSave()?.wordCards ?? {};
  const ids = (scene.batchIds ?? []).filter((id) => !cards[id]);
  if (ids.length < 2) return;
  const next = ids[(delta + ids.length) % ids.length];
  const rest = ids.filter((id) => id !== next);
  const learned = (scene.batchIds ?? []).filter((id) => cards[id]);
  scene.batchIds = [next, ...rest, ...learned];
  scene.phase = "study";
  scene.question = null;
  scene.draw?.();
}

function presentLearn(scene: PadScene): void {
  const add = () => {
    for (const name of ["learn:study", "learn:prev", "learn:next", "learn:confirm", "learn:spell"]) dropNamed(scene, name);
    const live = scene as PadScene & LearnLive;
    if (live.picking || live.phase !== "study") return;
    const style = { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "16px", color: "#3B2A20" };
    const button = (name: string, text: string, onPress: () => void) => {
      const node = scene.add.text(0, 0, text, style);
      node.name = name;
      node.setInteractive();
      node.on("pointerup", onPress);
    };
    button("learn:study", "学一学", () => live.showStudy?.());
    button("learn:prev", "上一个", () => stepLearn(live, -1));
    button("learn:next", "下一个", () => stepLearn(live, 1));
    if (!shownText(scene, "确认")) button("learn:confirm", "确认", () => live.startMeaning?.());
    if (!shownText(scene, "拼一拼") && !shownText(scene, "键盘拼写")) button("learn:spell", "拼一拼", () => live.startSpelling?.());
  };
  wrapDraw(scene, add);
  add();
}

function wideZone(scene: PadScene): GameNode | null {
  let found: GameNode | null = null;
  const walk = (node: GameNode) => {
    if (!found && node.type === "zone" && node.width >= 900) found = node;
    const list = (node as { list?: GameNode[] }).list;
    if (list) for (const child of list) walk(child);
  };
  for (const node of scene.children.list) walk(node);
  return found;
}

function bossPortrait(scene: PadScene): { key: string; frame: string } | null {
  const host = scene as PadScene & {
    exam?: { kind?: string; grade?: string } | null;
    textures?: { exists: (key: string) => boolean; get: (key: string) => { getFrameNames: () => string[] } };
  };
  const grade = String(host.exam?.grade ?? "G3").replace(/\D/g, "") || "3";
  const kind = host.exam?.kind === "final" ? "final" : "midterm";
  const key = `boss_exam_${kind}_g${grade}_w_idle`;
  if (!host.textures?.exists(key)) return null;
  const frame = host.textures.get(key).getFrameNames().find((name) => name.includes("body") && name.includes("idle") && !/glow|badge|fx/.test(name));
  return frame ? { key, frame } : null;
}

function presentExamPlayer(scene: PadScene): void {
  dropNamed(scene, "exam:player");
  if (!scene.add.image) return;
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean }; load?: { start: () => void; totalToLoad: number } };
  queueClassPortraits(host as never);
  if (host.load && host.load.totalToLoad > 0) host.load.start();
  if (!host.textures?.exists(PORTRAIT_ATLAS)) return;
  const image = scene.add.image(160, 360, PORTRAIT_ATLAS, portraitFrame(savedClassId(getSave()), "side"));
  image.name = "exam:player";
}

function presentExamFrame(scene: PadScene): void {
  presentExamPlayer(scene);
  const texts = sceneTexts(scene);
  if (texts.some((item) => item === "攻击" || item.includes("意思") || item.includes("怎么说"))) {
    dropNamed(scene, "exam:body");
    return;
  }
  if (!texts.some((item) => item.includes("期中") || item.includes("期末"))) return;
  dropNamed(scene, "exam:body");
  const body = scene.add.text(0, 0, "这次练习会用到最近学过的单词，看看哪些已经记住，哪些还要再练。准备好了就可以开始。", {
    fontFamily: "WenQuanYi Micro Hei, sans-serif",
    fontSize: "16px",
    color: "#46363A",
  });
  body.name = "exam:body";
  const portrait = bossPortrait(scene);
  if (portrait && scene.add.image && !scene.children.list.some((node) => node.name === "exam:boss")) {
    const image = scene.add.image(980, 360, portrait.key, portrait.frame);
    image.name = "exam:boss";
    image.setDisplaySize?.(220, 320);
  }
  wideZone(scene)?.on("pointerup", () => {
    const live = scene as PadScene & { introOpen?: boolean; act?: () => void };
    if (live.introOpen) return;
    live.act?.();
  });
}

function presentExam(scene: PadScene): void {
  wrapNamed(scene, "drawIntro", () => presentExamFrame(scene));
  wrapNamed(scene, "drawFight", () => presentExamFrame(scene));
  presentExamFrame(scene);
}

function glossFor(english: string): string {
  return CATALOG_WORDS.find((word) => word.english.toLowerCase() === english.toLowerCase())?.chinese ?? "";
}

function presentStages(scene: PadScene): void {
  const add = () => {
    for (const node of [...scene.children.list]) if (node.name === "stage:gloss") node.destroy();
    const walk = (node: GameNode) => {
      if (node.type === "text") {
        const text = String((node as { text?: string }).text ?? "");
        if (/^[A-Za-z][A-Za-z' -]+$/.test(text) && text.length <= 18) {
          const gloss = glossFor(text);
          if (gloss) {
            const nodeGloss = scene.add.text(0, 0, gloss, { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "14px", color: "#46363A" });
            nodeGloss.name = "stage:gloss";
            nodeGloss.data.set("en", text.toLowerCase());
          }
        }
      }
      const list = (node as { list?: GameNode[] }).list;
      if (list) for (const child of list) walk(child);
    };
    for (const node of scene.children.list) {
      if (node.name === "stage:gloss") continue;
      walk(node);
    }
    pinMapDetail(scene);
  };
  wrapDraw(scene, add);
  add();
}

/**
 * 原来：大地图第一眼把整章统计和本关句子堆在一起，没有单独的本章入口。
 * 现在：横屏加一枚「本章详情」。点一下只翻转本页的展开标记，不改存档、不换场景。
 * 为什么：方案甲把整章统计收进这一枚四字按钮。展开用同一枚的按下态，不另写「收起」。
 */
function pinMapDetail(scene: PadScene): void {
  dropNamed(scene, "map:detail");
  const host = scene as PadScene & { __mapChapterDetail?: boolean };
  const button = scene.add.container(0, 0);
  const label = scene.add.text(0, 0, "本章详情", {
    fontFamily: '"ZCOOL KuaiLe", "Noto Sans SC", sans-serif',
    fontSize: "16px",
    color: "#3B2A20",
  });
  button.add(label);
  button.setSize(136, 48);
  button.setInteractive();
  button.name = "map:detail";
  button.on("pointerup", () => {
    host.__mapChapterDetail = host.__mapChapterDetail !== true;
  });
}

function presentCreate(scene: PadScene): void {
  const add = () => {
    dropNamed(scene, "name:field");
    dropNamed(scene, "name:go");
    const input = pinNode("hero-name");
    const value = input?.value || "";
    const field = scene.add.text(0, 0, value || "给角色起个名字", {
      fontFamily: "WenQuanYi Micro Hei, sans-serif",
      fontSize: "16px",
      color: value ? "#3B2A20" : "#766758",
    });
    field.name = "name:field";
    const go = scene.add.container(0, 0);
    const face = scene.add.text(0, 0, "出发", { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "18px", color: "#3B2A20" });
    go.add(face);
    go.setSize(130, 48);
    go.setInteractive();
    go.name = "name:go";
    go.on("pointerup", () => {
      const form = pinNode("name-form");
      if (form) submitForm(form);
    });
    dropNamed(scene, "create:back");
    const back = scene.add.container(0, 0);
    const backFace = scene.add.text(0, 0, "返回", { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "16px", color: "#3B2A20" });
    back.add(backFace);
    back.setSize(100, 44);
    back.setInteractive();
    back.name = "create:back";
    back.on("pointerup", () => {
      const form = pinNode("name-form") as PinNode & { classList?: { remove?: (name: string) => void } };
      form?.classList?.remove?.("open");
      const live = scene as PadScene & { scene?: { start: (key: string) => void } };
      live.scene?.start("grades");
    });
  };
  wrapDraw(scene, add);
  add();
}

function ensureImage(scene: PadScene, key: string, url: string): boolean {
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean }; load?: { image: (key: string, url: string) => void; start: () => void; totalToLoad: number } };
  if (host.textures && host.load && !host.textures.exists(key)) {
    host.load.image(key, url);
    if (host.load.totalToLoad > 0) host.load.start();
  }
  return Boolean(host.textures?.exists(key));
}

function pinResultIcon(scene: PadScene, key: string, url: string, size: number): void {
  if (!ensureImage(scene, key, url) || !scene.add.image) return;
  if (scene.children.list.some((node) => (node as { texture?: string }).texture === key)) return;
  const picture = scene.add.image(0, 0, key);
  picture.setDisplaySize?.(size, size);
  picture.name = key;
}

interface LossWordRow {
  en: string;
  zh: string;
  ok: boolean;
}

interface ExamFailHost extends PadScene {
  state?: { phase?: string; playerHp?: number; answers?: { wordId: string; correct: boolean; kind: string }[] };
  examId?: string;
  __failShare?: boolean;
  __lossPage?: { correct: number; words: LossWordRow[] };
  scene?: { start: (key: string, data?: unknown) => void };
  textures?: { exists: (key: string) => boolean };
  load?: { atlas: (key: string, image: string, data: string) => void; start: () => void; totalToLoad: number };
}

function nodeText(node: GameNode): string {
  return String((node as GameNode & { text?: string }).text ?? "");
}

function walkNodes(nodes: GameNode[], visit: (node: GameNode) => void): void {
  for (const node of nodes) {
    visit(node);
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) walkNodes(list, visit);
  }
}

/** Battle plate, slightly cooled. The source webp is not edited. */
function pinLossBackdrop(scene: PadScene): void {
  if (!ensureImage(scene, "bg_home_battle", "assets/chapter/scenes/home/bg_battle.webp") || !scene.add.image) return;
  if (scene.children.list.some((node) => (node as { texture?: string }).texture === "bg_home_battle")) return;
  const picture = scene.add.image(640, 400, "bg_home_battle") as GameNode & { setDisplaySize?: (w: number, h: number) => void; setTint?: (tint: number) => void };
  picture.setDisplaySize?.(1280, 800);
  picture.setTint?.(0xe4f0f3);
  const list = scene.children.list;
  const index = list.indexOf(picture);
  if (index > 0) {
    list.splice(index, 1);
    list.unshift(picture);
  }
}

function pinLossMarks(scene: PadScene, checks: number): void {
  pinResultIcon(scene, "results_ico_score", "assets/warm/results/ico_score.png", 36);
  pinResultIcon(scene, "results_ico_heart", "assets/warm/results/ico_heart.png", 36);
  if (!scene.add.image) return;
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean } };
  const ready = Boolean(host.textures?.exists("results_ico_word_check")) || ensureImage(scene, "results_ico_word_check", "assets/warm/results/ico_word_check.png");
  if (!ready) return;
  const have = scene.children.list.filter((node) => (node as { texture?: string }).texture === "results_ico_word_check").length;
  for (let index = have; index < checks; index += 1) {
    const picture = scene.add.image(0, 0, "results_ico_word_check");
    picture.setDisplaySize?.(16, 16);
    picture.name = "results_ico_word_check";
  }
}

function pinLossBanner(scene: PadScene): void {
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean } };
  ensureAtlas(scene, "atlas_results", "assets/warm/atlas/atlas_results.png", "assets/warm/atlas/atlas_results.json");
  if (!scene.add.image || !host.textures?.exists("atlas_results")) return;
  if (scene.children.list.some((node) => (node as { frame?: string }).frame === "result_banner")) return;
  let nested = false;
  walkNodes(scene.children.list, (node) => {
    if ((node as { frame?: string }).frame === "result_banner") nested = true;
  });
  if (nested) return;
  const banner = scene.add.image(380, 14, "atlas_results", "result_banner") as GameNode & { setOrigin?: (x: number, y?: number) => void; setDisplaySize?: (w: number, h: number) => void; setTint?: (tint: number) => void };
  banner.setOrigin?.(0, 0);
  banner.setDisplaySize?.(520, 82);
  banner.setTint?.(0xb6d9e2);
}

function hideAtlasMarks(scene: PadScene): void {
  walkNodes(scene.children.list, (node) => {
    const frame = String((node as GameNode & { frame?: string }).frame ?? "");
    if (frame === "icon_heart" || frame === "icon_check") node.visible = false;
  });
}

/**
 * 原来：考试没通过只铺一块绿底，写「休息一下」。
 * 现在：同一张失败结算。题数和词表读这一场的答题，不再另做一页。
 * 为什么：Bowen 定过考试未通过先共用失败页。再试一次重新开这场考试，回地图仍是原来的按钮。
 */
export function prepareExamFailShare(scene: PadScene): void {
  if (scene.key !== "exam-battle") return;
  const host = scene as ExamFailHost;
  if (host.__failShare) return;
  const state = host.state;
  if (!state) return;
  const lost = state.phase === "lost" || (typeof state.playerHp === "number" && state.playerHp <= 0 && state.phase !== "won" && state.phase !== "choose" && state.phase !== "question");
  if (!lost) return;
  const texts: string[] = [];
  walkNodes(scene.children.list, (node) => {
    if (node.type === "text") texts.push(nodeText(node));
  });
  if (texts.includes("继续")) return;
  if (!texts.includes("休息一下")) return;
  if (!texts.some((text) => text.includes("回地图"))) return;
  const built = wordsForResults(state.answers ?? []);
  host.__lossPage = {
    correct: built.correct,
    words: built.words.map((word) => ({ en: word.english, zh: word.gloss, ok: word.correct })),
  };
  host.__failShare = true;
  walkNodes(scene.children.list, (node) => {
    if (node.type === "rectangle" && node.width >= 1000 && node.height >= 600) node.visible = false;
    if (node.type === "text" && nodeText(node) === "休息一下") {
      const labeled = node as GameNode & { setText?: (value: string) => void; text?: string };
      if (labeled.setText) labeled.setText("差一点点！");
      else labeled.text = "差一点点！";
    }
  });
  pinLossBackdrop(scene);
  pinLossBanner(scene);
  const checks = host.__lossPage.words.filter((word) => word.ok).length;
  pinLossMarks(scene, checks);
  hideAtlasMarks(scene);
  const addText = (value: string) => {
    scene.add.text(24, 24, value, { fontFamily: '"Noto Sans SC", sans-serif', fontSize: "16px", color: "#3B2A20" });
  };
  addText("答对");
  addText(String(built.correct));
  addText("题");
  if (host.__lossPage.words.length) addText("本场单词");
  for (const word of host.__lossPage.words) {
    addText(word.en);
    if (word.zh) addText(word.zh);
    if (!word.ok) addText("下次再见");
  }
  addText("打输了不会丢东西，放心再来！");
  const richer = scene as ExamFailHost & { add: PadScene["add"] & { rectangle?: (x: number, y: number, width: number, height: number, fill?: number) => GameNode } };
  const rect = richer.add.rectangle?.(720, 744, 240, 56, 0xf4e2b8);
  if (rect) {
    rect.setInteractive();
    rect.on("pointerup", () => host.scene?.start("exam-battle", { examId: host.examId ?? "" }));
    const label = scene.add.text(720, 744, "再试一次", { fontFamily: '"Noto Sans SC", sans-serif', fontSize: "22px", color: "#3B2A20" });
    label.setOrigin(0.5);
  }
}

function presentResults(scene: PadScene): void {
  const view = (scene as PadScene & { view?: { won?: boolean; words?: { correct?: boolean }[] } }).view;
  const won = view?.won !== false;
  if (won) {
    if (ensureImage(scene, "bg_ending", "assets/warm/backgrounds/bg_ending_2x.webp") && scene.add.image) {
      if (!scene.children.list.some((node) => (node as { texture?: string }).texture === "bg_ending")) {
        const picture = scene.add.image(640, 400, "bg_ending");
        picture.setDisplaySize?.(1280, 800);
        const list = scene.children.list;
        const index = list.indexOf(picture);
        if (index > 0) {
          list.splice(index, 1);
          list.unshift(picture);
        }
      }
    }
    pinResultIcon(scene, "results_ico_score", "assets/warm/results/ico_score.png", 36);
    pinResultIcon(scene, "results_ico_xp", "assets/warm/results/ico_xp.png", 36);
    pinResultIcon(scene, "results_ico_stamp", "assets/warm/results/ico_stamp.png", 28);
    return;
  }
  pinLossBackdrop(scene);
  pinLossBanner(scene);
  const checks = (view?.words ?? []).filter((word) => word.correct === true).length;
  pinLossMarks(scene, checks);
  hideAtlasMarks(scene);
}

function ensureAtlas(scene: PadScene, key: string, image: string, data: string): void {
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean }; load?: { atlas: (key: string, image: string, data: string) => void; start: () => void; totalToLoad: number } };
  if (!host.textures || !host.load || host.textures.exists(key)) return;
  host.load.atlas(key, image, data);
  if (host.load.totalToLoad > 0) host.load.start();
}

export function presentWechat(scene: PadScene): void {
  ensureAtlas(scene, "atlas_ui_core", "assets/warm/atlas/atlas_ui_core.png", "assets/warm/atlas/atlas_ui_core.json");
  ensureAtlas(scene, "atlas_battle", "assets/warm/atlas/atlas_battle.png", "assets/warm/atlas/atlas_battle.json");
  if (scene.key === "title") presentTitle(scene);
  if (scene.key === "learn") presentLearn(scene);
  if (scene.key === "stages") presentStages(scene);
  if (scene.key === "exam-battle") presentExam(scene);
  if (scene.key === "create") presentCreate(scene);
  if (scene.key === "battle-results") presentResults(scene);
  if (scene.key !== "guide") return;
  wrapDraw(scene, () => {
    if (sceneTexts(scene).some((item) => item.includes("学习进度"))) return;
    presentGuide(scene);
  });
  presentGuide(scene);
}

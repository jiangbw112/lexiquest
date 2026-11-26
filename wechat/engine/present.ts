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

function masked(value: string): string {
  const filled = Math.min(4, value.length);
  return `${"●".repeat(filled)}${"○".repeat(Math.max(0, 4 - filled))}`;
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
  const firstNode = label("pin:first", masked(""), 236);
  const errorNode = label("pin:error", error?.textContent || "", 296);
  label("pin:hint", "4 位数字。不会显示明文。", 330);
  const refresh = () => {
    const pin = input?.value || "";
    const again = confirm?.value || "";
    const current = focus === "again" ? again : pin;
    titleNode.setText(focus === "again" ? "再输入一次" : title?.textContent || titleText);
    firstNode.setText(masked(current));
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

function presentLearn(scene: PadScene): void {
  const add = () => {
    dropNamed(scene, "learn:study");
    const node = scene.add.text(0, 0, "学一学", { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "16px", color: "#3B2A20" });
    node.name = "learn:study";
  };
  wrapDraw(scene, add);
  add();
}

function presentExam(scene: PadScene): void {
  const texts = sceneTexts(scene);
  if (texts.some((item) => item === "攻击" || item.includes("意思"))) return;
  if (!texts.some((item) => item.includes("期中") || item.includes("期末"))) return;
  dropNamed(scene, "exam:body");
  const body = scene.add.text(0, 0, "这次练习会用到最近学过的单词，看看哪些已经记住，哪些还要再练。准备好了就可以开始。", {
    fontFamily: "WenQuanYi Micro Hei, sans-serif",
    fontSize: "16px",
    color: "#46363A",
  });
  body.name = "exam:body";
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
  };
  wrapDraw(scene, add);
  add();
}

function presentResults(scene: PadScene): void {
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean }; load?: { image: (key: string, url: string) => void; start: () => void; totalToLoad: number } };
  if (host.textures && host.load && !host.textures.exists("bg_ending")) {
    host.load.image("bg_ending", "assets/warm/backgrounds/bg_ending_2x.webp");
    if (host.load.totalToLoad > 0) host.load.start();
  }
  if (!host.textures?.exists("bg_ending") || !scene.add.image) return;
  if (scene.children.list.some((node) => (node as { texture?: string }).texture === "bg_ending")) return;
  const picture = scene.add.image(640, 400, "bg_ending");
  picture.setDisplaySize?.(1280, 800);
  const list = scene.children.list;
  const index = list.indexOf(picture);
  if (index > 0) {
    list.splice(index, 1);
    list.unshift(picture);
  }
}

function ensureAtlas(scene: PadScene, key: string, image: string, data: string): void {
  const host = scene as PadScene & { textures?: { exists: (key: string) => boolean }; load?: { atlas: (key: string, image: string, data: string) => void; start: () => void; totalToLoad: number } };
  if (!host.textures || !host.load || host.textures.exists(key)) return;
  host.load.atlas(key, image, data);
  if (host.load.totalToLoad > 0) host.load.start();
}

export function presentWechat(scene: PadScene): void {
  ensureAtlas(scene, "atlas_ui_core", "assets/warm/atlas/atlas_ui_core.png", "assets/warm/atlas/atlas_ui_core.json");
  if (scene.key === "title") presentTitle(scene);
  if (scene.key === "learn") presentLearn(scene);
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

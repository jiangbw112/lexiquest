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
  const brand = scene.add.text(640, 28, "词境练习家", {
    fontFamily: "WenQuanYi Micro Hei, sans-serif",
    fontSize: "40px",
    color: "#17352a",
  });
  brand.setOrigin(0, 0);
  brand.name = "brand";
  const sub = scene.add.text(640, 72, "LexiQuest", {
    fontFamily: "WenQuanYi Micro Hei, sans-serif",
    fontSize: "16px",
    color: "#3e6b56",
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
  const ink = "#17352a";
  const label = (name: string, text: string, y: number) => {
    const node = scene.add.text(80, y, text, { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "18px", color: ink });
    node.name = name;
    return node;
  };
  const titleNode = label("pin:title", titleText, 200);
  const firstNode = label("pin:first", "", 236);
  const againNode = showAgain ? label("pin:again", "", 266) : null;
  const errorNode = label("pin:error", error?.textContent || "", 296);
  const refresh = () => {
    const pin = input?.value || "";
    const again = confirm?.value || "";
    titleNode.setText(title?.textContent || titleText);
    firstNode.setText(`${focus === "pin" ? "▸ " : ""}密码 ${pin}`);
    againNode?.setText(`${focus === "again" ? "▸ " : ""}再输入一次 ${again}`);
    errorNode.setText(error?.textContent || "");
  };
  refresh();
  const keys = showAgain
    ? ["1", "2", "3", "退格", "4", "5", "6", "再输", "7", "8", "9", "确定", "0"]
    : ["1", "2", "3", "退格", "4", "5", "6", "清空", "7", "8", "9", "确定", "0"];
  for (const text of keys) {
    const pad = scene.add.container(0, 0);
    const face = scene.add.text(0, 0, text, { fontFamily: "WenQuanYi Micro Hei, sans-serif", fontSize: "16px", color: ink });
    pad.add(face);
    pad.setSize(64, 44);
    pad.setInteractive();
    pad.name = `pin:${text}`;
    pad.on("pointerup", () => {
      if (text === "退格") {
        const target = focus === "again" ? confirm : input;
        if (target) target.value = (target.value || "").slice(0, -1);
      } else if (text === "再输") {
        focus = "again";
      } else if (text === "清空") {
        if (input) input.value = "";
        if (confirm) confirm.value = "";
        focus = "pin";
      } else if (text === "确定") {
        submitForm(form);
      } else if (/^[0-9]$/.test(text)) {
        const target = focus === "again" ? confirm : input;
        if (target && (target.value || "").length < 6) target.value = `${target.value || ""}${text}`;
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

export function presentWechat(scene: PadScene): void {
  if (scene.key === "title") presentTitle(scene);
  if (scene.key !== "guide") return;
  const raw = scene as PadScene & { draw?: (() => void) & { presented?: boolean } };
  if (raw.draw && !raw.draw.presented) {
    const original = raw.draw.bind(scene);
    const wrapped = () => {
      original();
      if (sceneTexts(scene).some((item) => item.includes("学习进度"))) return;
      presentGuide(scene);
    };
    wrapped.presented = true;
    raw.draw = wrapped;
  }
  presentGuide(scene);
}

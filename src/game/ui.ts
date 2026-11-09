import Phaser from "phaser";
import { blip } from "./audio";

export const FONT = '"WenQuanYi Micro Hei", "Noto Sans SC", "PingFang SC", sans-serif';

export function paper(scene: Phaser.Scene, fill = 0xfff8ee): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(640, 400, 1280, 800, 0x143d2c);
  return scene.add.rectangle(640, 400, 1040, 740, fill);
}

export function heading(scene: Phaser.Scene, title: string, sub = ""): void {
  scene.add.text(180, 56, title, { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
  if (sub) scene.add.text(180, 102, sub, { fontFamily: FONT, fontSize: "18px", color: "#3d5c4e", wordWrap: { width: 920 } });
}

export function hint(scene: Phaser.Scene, text: string, color = "#3d5c4e"): Phaser.GameObjects.Text {
  return scene.add.text(180, 730, text, { fontFamily: FONT, fontSize: "16px", color });
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: { width?: number; height?: number; fill?: number } = {},
): Phaser.GameObjects.Container {
  const width = options.width ?? 220;
  const height = options.height ?? 54;
  const bg = scene.add.rectangle(0, 0, width, height, options.fill ?? 0x1f7a4d, 1).setStrokeStyle(3, 0x17352a);
  const labelText = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: "22px", color: "#fffaf3" })
    .setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, labelText]);
  root.setSize(width, height);
  root.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  root.on("pointerover", () => bg.setFillStyle(0x2f9a63));
  root.on("pointerout", () => bg.setFillStyle(options.fill ?? 0x1f7a4d));
  root.on("pointerdown", () => {
    blip();
    onClick();
  });
  return root;
}

export function listenKeys(scene: Phaser.Scene, onKey: (event: KeyboardEvent) => void): void {
  scene.input.keyboard?.on("keydown", onKey);
  scene.events.once("shutdown", () => scene.input.keyboard?.off("keydown", onKey));
}

export function backButton(scene: Phaser.Scene, go: () => void): void {
  button(scene, 280, 680, "返回 Esc", go, { width: 180, fill: 0x5c6b62 });
  listenKeys(scene, (event) => {
    if (event.code === "Escape") go();
  });
}

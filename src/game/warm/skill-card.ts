import Phaser from "phaser";
import type { SkillSlot } from "../../domain/skills";
import {
  skillCardFace,
  skillCardFrame,
  skillCardInput,
  skillCardInteractive,
  skillIconFrame,
  skillLevelFrame,
  skillOrderFrame,
  starMark,
  type SkillCardPhase,
} from "../../domain/skill-card-face";
import { containerHitArea } from "../hit";
import { DIS_TEXT, FONT_BODY, FONT_LATIN, INK } from "./theme";

const CARD_W = 140;
const CARD_H = 176;
const MUTED_TINT = 0xcfc4b2;
/** Measured key-circle fill from SPEC B3.1. Not a new palette entry. */
const KEY_CIRCLE = 0xe5dac5;
const CREAM_FILL = 0xfff4dc;

export function placeSkillCard(
  scene: Phaser.Scene,
  slot: SkillSlot,
  phase: SkillCardPhase,
  energy: number,
  onCast: () => void,
  onLowEnergy: () => void,
  resolving = false,
): Phaser.GameObjects.Container {
  const face = skillCardFace({ phase, energy, energyCost: slot.energyCost, resolving });
  const muted = face !== "ready";
  const left = 670 + slot.index * 160;
  const top = 592;
  const cx = left + CARD_W / 2;
  const cy = top + CARD_H / 2;
  const parts: Phaser.GameObjects.GameObject[] = [];
  const frame = scene.add.image(0, 0, "atlas_battle", skillCardFrame(face, slot.origin, slot.level)).setScale(0.5);
  parts.push(frame);
  const ring = scene.add.image(0, 0, "atlas_battle", "card_hover_ring").setScale(0.5).setVisible(false);
  parts.push(ring);
  const icons = scene.textures.get("atlas_skills");
  const iconFrame = skillIconFrame(slot.skillId);
  if (icons.has(iconFrame)) {
    const icon = scene.add.image(0, -12, "atlas_skills", iconFrame).setScale(64 / 96);
    if (muted) icon.setTint(MUTED_TINT);
    parts.push(icon);
  }
  if (!muted) {
    const plate = scene.add.graphics();
    plate.fillStyle(CREAM_FILL, 1);
    plate.fillRoundedRect(-52, 40, 104, 28, 8);
    parts.push(plate);
  }
  const label = slot.origin === "equipped" && slot.level != null ? `${slot.name} ${starMark(slot.level)}` : slot.name;
  const name = scene.add
    .text(0, 54, label, {
      fontFamily: FONT_BODY,
      fontSize: "16px",
      fontStyle: "700",
      color: muted ? DIS_TEXT : INK,
    })
    .setOrigin(0.5);
  if (name.width > 96) name.setScale(96 / name.width);
  parts.push(name);
  const circle = scene.add.graphics();
  circle.fillStyle(muted ? KEY_CIRCLE : CREAM_FILL, 1);
  circle.fillCircle(-CARD_W / 2 + 22, -CARD_H / 2 + 22, 14);
  parts.push(circle);
  parts.push(
    scene.add
      .text(-CARD_W / 2 + 22, -CARD_H / 2 + 22, String(slot.index + 4), {
        fontFamily: FONT_LATIN,
        fontSize: "16px",
        fontStyle: "800",
        color: muted ? DIS_TEXT : INK,
      })
      .setOrigin(0.5),
  );
  if (slot.origin === "equipped" && slot.level != null) {
    const level = scene.add.image(CARD_W / 2 - 22, CARD_H / 2 - 22, "atlas_battle", skillLevelFrame(slot.level)).setScale(32 / 80);
    const order = scene.add
      .image(CARD_W / 2 - 26, -CARD_H / 2 + 26, "atlas_battle", skillOrderFrame(slot.index + 1))
      .setScale(44 / 88);
    if (muted) {
      level.setTint(MUTED_TINT);
      order.setTint(MUTED_TINT);
    }
    parts.push(level, order);
  }
  for (let i = 0; i < slot.energyCost; i += 1) {
    const pip = scene.add.image(-CARD_W / 2 + 18 + i * 20, CARD_H / 2 - 36, "atlas_battle", "energy_pip_cost").setScale(18 / 40);
    if (muted) pip.setTint(MUTED_TINT);
    parts.push(pip);
  }
  const root = scene.add.container(cx, cy, parts);
  root.setSize(CARD_W, CARD_H);
  if (!skillCardInteractive(face)) return root;
  let down = false;
  const area = containerHitArea(CARD_W, CARD_H);
  root.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  const sink = (pressed: boolean) => {
    root.setY(pressed ? cy + 2 : cy);
  };
  root.on("pointerover", () => {
    if (down) return;
    ring.setVisible(true);
  });
  root.on("pointerout", () => {
    down = false;
    ring.setVisible(false);
    sink(false);
  });
  root.on("pointerdown", () => {
    down = true;
    ring.setVisible(true);
    sink(true);
  });
  root.on("pointerup", () => {
    if (!down) return;
    down = false;
    sink(false);
    const result = skillCardInput(face, "click");
    if (result === "cast") onCast();
    if (result === "low-energy") onLowEnergy();
  });
  return root;
}

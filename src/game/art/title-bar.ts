import type Phaser from "phaser";
import { displayTitle, FOREST_REWARDS } from "../../domain/chapter-rewards";
import { FONT } from "../ui";
import { TITLE_CHIP_FRAME, TITLE_LEAF_FRAME, TITLE_UI_KEY } from "./chapter-cosmetics";
import { TITLE_CHIP_H, TITLE_CHIP_SCALE, TITLE_CHIP_W } from "../battle-hud";
import manifest from "./data/forest-rewards-manifest.json";

const CHIP = manifest.ui.frames.ui_title_chip["nineSlice@2x"];

/** Mild green title chip from the v0.1 sheet, plus the shared leaf. At most one title. */
export function drawEquippedTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  titleId: string | null,
  chipWidth = TITLE_CHIP_W,
): void {
  if (!titleId) return;
  const title = displayTitle(FOREST_REWARDS, titleId);
  const left = x - (chipWidth * TITLE_CHIP_SCALE) / 2;
  if (scene.textures.exists(TITLE_UI_KEY)) {
    const bar = scene.add.nineslice(x, y, TITLE_UI_KEY, TITLE_CHIP_FRAME, chipWidth, TITLE_CHIP_H, CHIP.left, CHIP.right, CHIP.top, CHIP.bottom);
    bar.setScale(TITLE_CHIP_SCALE);
    scene.add.image(left + 22, y, TITLE_UI_KEY, TITLE_LEAF_FRAME).setDisplaySize(32, 32);
  }
  scene.add.text(left + 44, y, title.shownZh, { fontFamily: FONT, fontSize: "22px", color: "#1f7a4d" }).setOrigin(0, 0.5);
}

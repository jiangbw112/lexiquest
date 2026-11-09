import type Phaser from "phaser";
import { displayTitle, FOREST_REWARDS } from "../../domain/chapter-rewards";
import { FONT } from "../ui";
import { TITLE_CHIP_FRAME, TITLE_LEAF_FRAME, TITLE_UI_KEY } from "./chapter-cosmetics";
import manifest from "./data/forest-rewards-manifest.json";

const CHIP = manifest.ui.frames.ui_title_chip["nineSlice@2x"];

/** Mild green title chip from the v0.1 sheet, plus the shared leaf. At most one title. */
export function drawEquippedTitle(scene: Phaser.Scene, x: number, y: number, titleId: string | null): void {
  if (!titleId) return;
  const title = displayTitle(FOREST_REWARDS, titleId);
  if (scene.textures.exists(TITLE_UI_KEY)) {
    const bar = scene.add.nineslice(x, y, TITLE_UI_KEY, TITLE_CHIP_FRAME, 560, 72, CHIP.left, CHIP.right, CHIP.top, CHIP.bottom);
    bar.setScale(0.5);
    scene.add.image(x - 118, y, TITLE_UI_KEY, TITLE_LEAF_FRAME).setDisplaySize(32, 32);
  }
  scene.add.text(x - 96, y, title.shownZh, { fontFamily: FONT, fontSize: "22px", color: "#1f7a4d" }).setOrigin(0, 0.5);
}

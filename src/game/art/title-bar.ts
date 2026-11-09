import type Phaser from "phaser";
import { displayTitle, FOREST_REWARDS } from "../../domain/chapter-rewards";
import { FONT } from "../ui";

/** Mild green bar and the shared leaf icon. At most one title is passed in. */
export function drawEquippedTitle(scene: Phaser.Scene, x: number, y: number, titleId: string | null): void {
  if (!titleId) return;
  const title = displayTitle(FOREST_REWARDS, titleId);
  scene.add.rectangle(x, y, 300, 44, 0xd7efe0).setStrokeStyle(2, 0x1f7a4d);
  if (scene.textures.exists("title_leaf_icon")) {
    scene.add.image(x - 124, y, "title_leaf_icon").setDisplaySize(32, 32);
  }
  scene.add.text(x - 100, y, title.shownZh, { fontFamily: FONT, fontSize: "22px", color: "#1f7a4d" }).setOrigin(0, 0.5);
}

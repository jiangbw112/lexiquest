import type Phaser from "phaser";
import type { ChapterBackdrop } from "../domain/chapter-scenes";
import { queueWarm } from "./warm/load";

/** Load one chapter image. Skips a texture the cache already has. */
export function queueSceneImage(scene: Phaser.Scene, key: string, url: string): void {
  if (scene.textures.exists(key)) return;
  scene.load.image(key, url);
}

/** Load one minion atlas. Skips a texture the cache already has. */
export function queueSceneAtlas(scene: Phaser.Scene, key: string, imageUrl: string, dataUrl: string): void {
  if (scene.textures.exists(key)) return;
  scene.load.atlas(key, imageUrl, dataUrl);
}

/**
 * A grade chapter does not preload the forest map. Switching back must queue
 * `bg_map` before anything paints it. Returns true when a file was queued.
 */
export function queueMissingChapterMap(scene: Phaser.Scene, backdrop: ChapterBackdrop): boolean {
  if (scene.textures.exists(backdrop.mapKey)) return false;
  if (backdrop.groupId === "forest") queueWarm(scene, [], ["bg_map"]);
  else queueSceneImage(scene, backdrop.mapKey, backdrop.mapUrl);
  return true;
}

/** Forest battles use `bg_forest`, which BootScene does not preload. */
export function queueMissingForestBattle(scene: Phaser.Scene, backdrop: ChapterBackdrop): boolean {
  if (backdrop.groupId !== "forest" || scene.textures.exists(backdrop.battleKey)) return false;
  queueWarm(scene, [], ["bg_forest"]);
  return true;
}

export function paintSceneImage(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  return scene.add.image(640, 400, key).setDisplaySize(1280, 800);
}

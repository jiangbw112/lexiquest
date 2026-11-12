import type Phaser from "phaser";

/** Load one chapter image. Skips a texture the cache already has. */
export function queueSceneImage(scene: Phaser.Scene, key: string, url: string): void {
  if (scene.textures.exists(key)) return;
  scene.load.image(key, url);
}

export function paintSceneImage(scene: Phaser.Scene, key: string): Phaser.GameObjects.Image {
  return scene.add.image(640, 400, key).setDisplaySize(1280, 800);
}

import type Phaser from "phaser";

const ATLASES = {
  atlas_ui_core: ["assets/warm/atlas/atlas_ui_core.png", "assets/warm/atlas/atlas_ui_core.json"],
  atlas_map: ["assets/warm/atlas/atlas_map.png", "assets/warm/atlas/atlas_map.json"],
  atlas_battle: ["assets/warm/atlas/atlas_battle.png", "assets/warm/atlas/atlas_battle.json"],
  atlas_parent: ["assets/warm/atlas/atlas_parent.png", "assets/warm/atlas/atlas_parent.json"],
  atlas_village: ["assets/warm/atlas/atlas_village.png", "assets/warm/atlas/atlas_village.json"],
} as const;

const IMAGES = {
  bg_forest: "assets/warm/backgrounds/bg_forest_battle_2x.webp",
  bg_home: "assets/warm/backgrounds/bg_home_2x.webp",
  bg_learn: "assets/warm/backgrounds/bg_learn_blur_2x.webp",
  bg_map: "assets/warm/backgrounds/bg_map_forest_2x.webp",
  bg_parent: "assets/warm/backgrounds/bg_parent_paper_2x.webp",
  bg_village: "assets/warm/backgrounds/bg_village_2x.webp",
} as const;

export function queueWarm(
  scene: Phaser.Scene,
  atlases: readonly (keyof typeof ATLASES)[],
  images: readonly (keyof typeof IMAGES)[],
): void {
  for (const key of atlases) {
    if (scene.textures.exists(key)) continue;
    const [png, json] = ATLASES[key];
    scene.load.atlas(key, png, json);
  }
  for (const key of images) {
    if (scene.textures.exists(key)) continue;
    scene.load.image(key, IMAGES[key]);
  }
}

export function warmBackground(scene: Phaser.Scene, key: keyof typeof IMAGES): Phaser.GameObjects.Image {
  return scene.add.image(640, 400, key).setDisplaySize(1280, 800);
}

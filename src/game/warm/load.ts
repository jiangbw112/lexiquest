import type Phaser from "phaser";

const ATLASES = {
  atlas_ui_core: ["assets/warm/atlas/atlas_ui_core.png", "assets/warm/atlas/atlas_ui_core.json"],
  atlas_map: ["assets/warm/atlas/atlas_map.png", "assets/warm/atlas/atlas_map.json"],
  atlas_battle: ["assets/warm/atlas/atlas_battle.png", "assets/warm/atlas/atlas_battle.json"],
  atlas_parent: ["assets/warm/atlas/atlas_parent.png", "assets/warm/atlas/atlas_parent.json"],
  atlas_village: ["assets/warm/atlas/atlas_village.png", "assets/warm/atlas/atlas_village.json"],
  atlas_skills: ["assets/warm/atlas/atlas_skills.png", "assets/warm/atlas/atlas_skills.json"],
  atlas_monsters: ["assets/warm/atlas/atlas_monsters.png", "assets/warm/atlas/atlas_monsters.json"],
  atlas_wardrobe: ["assets/warm/atlas/atlas_wardrobe.png", "assets/warm/atlas/atlas_wardrobe.json"],
  atlas_ui_pages: ["assets/warm/atlas/atlas_ui_pages.png", "assets/warm/atlas/atlas_ui_pages.json"],
  atlas_results: ["assets/warm/atlas/atlas_results.png", "assets/warm/atlas/atlas_results.json"],
  atlas_map_results: ["assets/warm/atlas/atlas_map_results.png", "assets/warm/atlas/atlas_map_results.json"],
} as const;

const IMAGES = {
  bg_forest: "assets/warm/backgrounds/bg_forest_battle_2x.webp",
  bg_home: "assets/warm/backgrounds/bg_home_2x.webp",
  bg_learn: "assets/warm/backgrounds/bg_learn_blur_2x.webp",
  bg_map: "assets/warm/backgrounds/bg_map_forest_2x.webp",
  bg_parent: "assets/warm/backgrounds/bg_parent_paper_2x.webp",
  bg_village: "assets/warm/backgrounds/bg_village_2x.webp",
  bg_room: "assets/warm/backgrounds/bg_room_2x.webp",
  bg_ending: "assets/warm/backgrounds/bg_ending_2x.webp",
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

/** Start a load without waiting. Skips files the texture cache already has. */
export function warmInBackground(
  scene: Phaser.Scene,
  atlases: readonly (keyof typeof ATLASES)[],
  images: readonly (keyof typeof IMAGES)[],
): void {
  queueWarm(scene, atlases, images);
  if (scene.load.totalToLoad > 0) scene.load.start();
}

export function paintRoom(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists("bg_room")) return false;
  warmBackground(scene, "bg_room");
  return true;
}

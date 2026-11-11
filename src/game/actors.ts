import Phaser from "phaser";
import { chapterCosmeticLayers } from "./art/chapter-cosmetics";
import { ATLAS_SPEC, visibleFrames } from "./art/layers";
import { WARRIOR_ORIGIN } from "./art/warrior-pack";
import { outfitHatFrame, villageCosmeticNudge, villageCosmeticScale, villageHatPlacement } from "./art/worn";

export class LayeredActor {
  readonly root: Phaser.GameObjects.Container;
  private readonly images = new Map<string, Phaser.GameObjects.Image>();
  private readonly hats = new Map<string, Phaser.GameObjects.Image>();
  private readonly cosmetics = new Map<string, Phaser.GameObjects.Image>();
  /** Everything that bobs. The shadow stays on `root`. */
  private floatRoot: Phaser.GameObjects.Container | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly view: "side" | "top") {
    const viewSpec = ATLAS_SPEC[view];
    this.root = scene.add.container(x, y);
    const bob = scene.add.container(0, 0);
    this.floatRoot = bob;
    const topDepth: Record<string, number> = {
      "top/shadow": 0,
      "top/cape": 4,
      "top/body": 10,
      "top/hair": 20,
      "top/sash": 30,
    };
    for (const name of viewSpec.frames) {
      const image = scene.add.image(0, 0, "actors", name).setOrigin(viewSpec.originX, viewSpec.originY);
      if (view === "top") image.setDepth(topDepth[name] ?? 0);
      this.images.set(name, image);
      const shadow = name.endsWith("shadow");
      (shadow ? this.root : bob).add(image);
    }
    this.root.add(bob);
    if (view === "top" && scene.textures.exists("actors")) {
      // The top sheet has no hats. Park the side ornaments on the hair bun.
      for (const name of ["side/hat-leaf", "side/hat-star"]) {
        const place = villageHatPlacement(name);
        const hat = scene.add.image(place.x, place.y, "actors", name).setOrigin(0.5, 1).setScale(place.scale);
        hat.setDepth(35);
        hat.setVisible(false);
        this.hats.set(name, hat);
        bob.add(hat);
      }
    }
    if (view === "top") {
      for (const layer of chapterCosmeticLayers()) {
        if (!scene.textures.exists(layer.textureKey)) continue;
        const frame = `${layer.layerPrefix}_idle_00`;
        if (!scene.textures.get(layer.textureKey).has(frame)) continue;
        const nudge = villageCosmeticNudge(layer.id);
        const sprite = scene.add.image(nudge.x, nudge.y, layer.textureKey, frame);
        sprite.setOrigin(WARRIOR_ORIGIN.x, WARRIOR_ORIGIN.y);
        sprite.setScale(villageCosmeticScale(layer.id));
        sprite.setDepth(layer.id === "forest_leaf_cape" ? 6 : layer.id === "acorn_pin" ? 32 : 40);
        sprite.setVisible(false);
        this.cosmetics.set(layer.id, sprite);
        bob.add(sprite);
      }
      bob.sort("depth");
    }
  }

  applyOutfit(outfitId: string): void {
    this.applyAppearance(outfitId, []);
  }

  /** Outfit frames, the matching hat, and any chapter cosmetics worn with them. */
  applyAppearance(outfitId: string, cosmeticIds: readonly string[]): void {
    const show = new Set(visibleFrames(this.view, outfitId));
    for (const [name, image] of this.images) image.setVisible(show.has(name));
    const hat = outfitHatFrame(outfitId);
    for (const [name, image] of this.hats) image.setVisible(name === hat);
    for (const [id, image] of this.cosmetics) image.setVisible(cosmeticIds.includes(id));
  }

  /** The bobbing rig. The shadow stays on the ground, so it is not included. */
  floatingLayers(): Phaser.GameObjects.GameObject[] {
    if (this.floatRoot) return [this.floatRoot];
    const names = this.view === "top"
      ? ["top/body", "top/hair", "top/cape", "top/sash"]
      : ["side/body", "side/hair", "side/cape", "side/sash"];
    return names.flatMap((name) => {
      const image = this.images.get(name);
      return image ? [image] : [];
    });
  }
}

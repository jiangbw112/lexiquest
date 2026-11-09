import Phaser from "phaser";
import { ATLAS_SPEC, visibleFrames } from "./art/layers";

export class LayeredActor {
  readonly root: Phaser.GameObjects.Container;
  private readonly images = new Map<string, Phaser.GameObjects.Image>();

  constructor(scene: Phaser.Scene, x: number, y: number, private readonly view: "side" | "top") {
    const viewSpec = ATLAS_SPEC[view];
    this.root = scene.add.container(x, y);
    for (const name of viewSpec.frames) {
      const image = scene.add.image(0, 0, "actors", name).setOrigin(viewSpec.originX, viewSpec.originY);
      this.images.set(name, image);
      this.root.add(image);
    }
  }

  applyOutfit(outfitId: string): void {
    const show = new Set(visibleFrames(this.view, outfitId));
    for (const [name, image] of this.images) image.setVisible(show.has(name));
  }
}

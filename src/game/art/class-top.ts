import Phaser from "phaser";
import type { ClassId } from "../../domain/types";
import {
  CLASS_TOP_ORIGIN,
  HIDES_HAIR_TOP,
  TOP_ANIMS,
  TOP_LAYERS,
  WREATH_HIDES,
  classAnimKey,
  sideFrameName,
  topFacing,
  type ClassTopAnim,
  type TopFacing,
} from "./class-atlas";
import { WREATH_PLACES_KEY } from "./class-load";

interface WreathPlace {
  pos: [number, number];
  rotation: number;
  sx?: number;
  sy?: number;
}

/** @2x sheet drawn at the same height as the old 128×160 doll at scale 0.85. */
export const CLASS_TOP_SCALE = 0.425;

export function ensureClassTopAnims(scene: Phaser.Scene, classId: ClassId): void {
  for (const dir of ["s", "n", "e"] as const) {
    for (const layer of TOP_LAYERS[classId][dir]) {
      for (const anim of ["idle", "walk"] as const) {
        const key = classAnimKey(layer.id, anim);
        if (scene.anims.exists(key)) continue;
        const spec = TOP_ANIMS[anim];
        scene.anims.create({
          key,
          frames: Array.from({ length: spec.frameCount }, (_, index) => ({
            key: layer.texture,
            frame: sideFrameName(layer.id, anim, index),
          })),
          frameRate: spec.fps,
          repeat: spec.repeat,
        });
      }
    }
  }
}

export class ClassTopSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly layers: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private drawDir: "s" | "n" | "e" = "s";
  private anim: ClassTopAnim = "idle";
  private bob?: Phaser.Tweens.Tween;
  private wreathFront?: Phaser.GameObjects.Sprite;
  private wreathBack?: Phaser.GameObjects.Sprite;
  private body?: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly classId: ClassId,
    private readonly equipped: readonly string[] = [],
  ) {
    this.scene = scene;
    ensureClassTopAnims(scene, classId);
    this.root = scene.add.container(x, y);
    this.root.setScale(CLASS_TOP_SCALE);
    this.layers = scene.add.container(0, 0);
    this.root.add(this.layers);
    this.setDirection("s");
  }

  stop(): void {
    this.bob?.stop();
    this.bob = undefined;
  }

  setDirection(facing: TopFacing): void {
    const face = topFacing(facing);
    this.drawDir = face.dir;
    const scale = Math.abs(this.root.scaleY) || CLASS_TOP_SCALE;
    this.root.setScale(face.flipX ? -scale : scale, scale);
    this.rebuild();
    this.play(this.anim);
  }

  play(anim: ClassTopAnim): void {
    this.anim = anim;
    if (anim === "idle") this.startBob();
    else {
      this.bob?.stop();
      this.bob = undefined;
      this.layers.y = 0;
    }
    for (const layer of TOP_LAYERS[this.classId][this.drawDir]) {
      const sprite = this.layers.getByName(layer.id);
      if (!(sprite instanceof Phaser.GameObjects.Sprite)) continue;
      const key = classAnimKey(layer.id, anim);
      if (sprite.scene.anims.exists(key)) sprite.play(key);
    }
    this.placeWreath(`${anim}_00`);
    this.body?.off(Phaser.Animations.Events.ANIMATION_UPDATE);
    this.body?.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_animation: unknown, frame: { textureFrame?: string }) => {
      const matched = /_(idle|walk)_(\d+)$/.exec(frame.textureFrame ?? "");
      if (matched) this.placeWreath(`${matched[1]}_${matched[2]}`);
    });
  }

  private rebuild(): void {
    this.layers.removeAll(true);
    this.wreathFront = undefined;
    this.wreathBack = undefined;
    this.body = undefined;
    const hidden = new Set<string>();
    if (this.equipped.includes("forest_wreath")) {
      for (const slot of WREATH_HIDES[this.classId]) hidden.add(slot);
    }
    for (const layer of TOP_LAYERS[this.classId][this.drawDir]) {
      const sprite = this.scene.add.sprite(0, 0, layer.texture, sideFrameName(layer.id, "idle", 0));
      sprite.setOrigin(CLASS_TOP_ORIGIN.x, CLASS_TOP_ORIGIN.y);
      sprite.setDepth(layer.z);
      sprite.setName(layer.id);
      const hideHair = (layer.slot === "hairTop" || layer.slot === "hair_top") && HIDES_HAIR_TOP[this.classId];
      sprite.setVisible(!hidden.has(layer.slot) && !hideHair);
      this.layers.add(sprite);
      if (layer.slot === "body") this.body = sprite;
    }
    if (this.scene.textures.exists("cls:wreath")) {
      const dir = this.drawDir;
      this.wreathBack = this.scene.add.sprite(0, 0, "cls:wreath", `top_forestWreath_cosHeadBack_${dir}`).setOrigin(0.5, 0.5);
      this.wreathBack.setDepth(57);
      this.wreathFront = this.scene.add.sprite(0, 0, "cls:wreath", `top_forestWreath_cosHead_${dir}`).setOrigin(0.5, 0.5);
      this.wreathFront.setDepth(65);
      this.layers.add(this.wreathBack);
      this.layers.add(this.wreathFront);
    }
    this.layers.sort("depth");
  }

  private startBob(): void {
    if (this.bob) return;
    this.bob = this.scene.tweens.add({
      targets: this.layers,
      y: -12,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private placeWreath(frameKey: string): void {
    const show = this.equipped.includes("forest_wreath");
    this.wreathFront?.setVisible(show);
    this.wreathBack?.setVisible(show);
    const file = this.scene.cache.json.get(WREATH_PLACES_KEY) as
      | { [id: string]: { top?: Record<string, Record<string, WreathPlace>> } }
      | undefined;
    const place = file?.[this.classId]?.top?.[this.drawDir]?.[frameKey];
    if (!show || !place) return;
    const x = place.pos[0] * 2 - 128;
    const y = place.pos[1] * 2 - 320;
    const rotation = (place.rotation * Math.PI) / 180;
    for (const sprite of [this.wreathBack, this.wreathFront]) {
      sprite?.setPosition(x, y);
      sprite?.setRotation(rotation);
      sprite?.setScale(place.sx ?? 1, place.sy ?? 1);
    }
  }
}

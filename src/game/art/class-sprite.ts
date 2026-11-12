import Phaser from "phaser";
import { FOREST_REWARDS, visibilityForCosmetics } from "../../domain/chapter-rewards";
import type { ClassId } from "../../domain/types";
import {
  chapterCosmeticLayers,
  cosmeticAnimKey,
  ensureCosmeticAnims,
} from "./chapter-cosmetics";
import {
  CLASS_SIDE_ORIGIN,
  CLASS_SIDE_SCALE,
  HIDES_HAIR_TOP,
  SIDE_ANIMS,
  SIDE_LAYERS,
  WREATH_HIDES,
  animsForSideLayer,
  classAnimKey,
  sideFrameName,
  type ClassSideAnim,
  type SideLayer,
} from "./class-atlas";
import { WREATH_PLACES_KEY } from "./class-load";
import { WARRIOR_SASH_DROP, outfitExtraFrames } from "./worn";
import type { WarriorAnim } from "./warrior-pack";

interface WreathPlace {
  pos: [number, number];
  rotation: number;
  sx?: number;
  sy?: number;
}

export function ensureClassSideAnims(scene: Phaser.Scene, classId: ClassId): void {
  for (const layer of SIDE_LAYERS[classId]) {
    for (const anim of animsForSideLayer(layer)) {
      const key = classAnimKey(layer.id, anim);
      if (scene.anims.exists(key)) continue;
      const spec = SIDE_ANIMS[anim];
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

function placesFor(scene: Phaser.Scene, classId: ClassId): Record<string, WreathPlace> {
  const file = scene.cache.json.get(WREATH_PLACES_KEY) as
    | { [id: string]: { side?: Record<string, WreathPlace> } }
    | undefined;
  return file?.[classId]?.side ?? {};
}

export class ClassSideSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly sprites = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly outfitImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly cosmeticById = new Map<string, Phaser.GameObjects.Sprite>();
  private wreathFront?: Phaser.GameObjects.Sprite;
  private wreathBack?: Phaser.GameObjects.Sprite;
  private places: Record<string, WreathPlace> = {};
  private equipped: readonly string[];
  private outfitId: string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly classId: ClassId,
    scale = CLASS_SIDE_SCALE,
    equipped: readonly string[] = [],
    outfitId = "traveler",
  ) {
    ensureClassSideAnims(scene, classId);
    if (classId === "warrior") ensureCosmeticAnims(scene);
    this.equipped = equipped;
    this.outfitId = outfitId;
    this.root = scene.add.container(x, y);
    this.root.setScale(scale);
    for (const layer of SIDE_LAYERS[classId]) {
      const sprite = scene.add.sprite(0, 0, layer.texture, sideFrameName(layer.id, "idle", 0));
      sprite.setOrigin(CLASS_SIDE_ORIGIN.x, CLASS_SIDE_ORIGIN.y);
      sprite.setDepth(layer.z);
      this.root.add(sprite);
      this.sprites.set(layer.id, sprite);
    }
    if (classId === "warrior") this.addWarriorExtras(scene);
    this.addWreath(scene);
    this.places = placesFor(scene, classId);
    this.root.sort("depth");
    this.play("idle");
  }

  isSlotDrawn(slot: string): boolean {
    return SIDE_LAYERS[this.classId].some((layer) => layer.slot === slot);
  }

  isSlotVisible(slot: string): boolean {
    return SIDE_LAYERS[this.classId].some((layer) => layer.slot === slot && this.sprites.get(layer.id)?.visible === true);
  }

  play(anim: ClassSideAnim, onComplete?: () => void): void {
    const hidden = this.hiddenSlots();
    const lead = this.sprites.get("char_heroA_body_e");
    lead?.off(Phaser.Animations.Events.ANIMATION_UPDATE);
    lead?.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    for (const layer of SIDE_LAYERS[this.classId]) {
      const sprite = this.sprites.get(layer.id);
      if (!sprite) continue;
      const show = this.layerShows(layer, anim, hidden);
      sprite.setVisible(show);
      if (!show) continue;
      const key = classAnimKey(layer.id, anim);
      if (sprite.scene.anims.exists(key)) sprite.play(key);
    }
    this.syncExtras(anim);
    this.placeWreath(`${anim}_00`);
    lead?.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_animation: unknown, frame: { textureFrame?: string }) => {
      const matched = /_(idle|walk|attack|hit|victory|dash)_(\d+)$/.exec(frame.textureFrame ?? "");
      if (matched) this.placeWreath(`${matched[1]}_${matched[2]}`);
    });
    if (onComplete && lead) lead.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
  }

  playSequence(anims: readonly ClassSideAnim[]): void {
    const [head, ...rest] = anims;
    if (!head) return;
    if (rest.length === 0 || head === "idle" || head === "victory") {
      this.play(head);
      return;
    }
    this.play(head, () => this.playSequence(rest));
  }

  setFacingLeft(facingLeft: boolean): void {
    const scale = Math.abs(this.root.scaleX);
    this.root.scaleX = facingLeft ? -scale : scale;
  }

  private layerShows(layer: SideLayer, anim: ClassSideAnim, hidden: ReadonlySet<string>): boolean {
    if (hidden.has(layer.slot)) return false;
    if ((layer.slot === "hairTop" || layer.slot === "hair_top") && HIDES_HAIR_TOP[this.classId]) return false;
    if (layer.slot === "fx_speed" && anim !== "dash") return false;
    if (layer.onlyDuring && !layer.onlyDuring.includes(anim)) return false;
    const replaced = SIDE_LAYERS[this.classId].some((other) => {
      if (other.replaces !== layer.id) return false;
      return !other.onlyDuring || other.onlyDuring.includes(anim);
    });
    return !replaced;
  }

  private hiddenSlots(): Set<string> {
    const slots = SIDE_LAYERS[this.classId].map((layer) => layer.slot);
    const visibility = visibilityForCosmetics(FOREST_REWARDS, this.equipped, { slots, parts: [] });
    const hidden = new Set<string>();
    if (this.classId === "warrior") {
      for (const slot of visibility.hiddenSlots) hidden.add(slot);
    }
    if (this.equipped.includes("forest_wreath")) {
      for (const slot of WREATH_HIDES[this.classId]) hidden.add(slot);
    }
    return hidden;
  }

  private addWarriorExtras(scene: Phaser.Scene): void {
    if (scene.textures.exists("actors")) {
      const pieceScale = 306 / 264;
      for (const name of ["side/cape", "side/sash", "side/hat-leaf", "side/hat-star"]) {
        const depth = name === "side/cape" ? 15 : name === "side/sash" ? 78 : 62;
        const drop = name === "side/sash" ? WARRIOR_SASH_DROP : 0;
        const image = scene.add.image(0, drop, "actors", name).setOrigin(0.5, 1).setScale(pieceScale);
        image.setDepth(depth);
        image.setVisible(false);
        this.root.add(image);
        this.outfitImages.set(name, image);
      }
    }
    for (const layer of chapterCosmeticLayers()) {
      if (layer.id === "forest_wreath" || !scene.textures.exists(layer.textureKey)) continue;
      const sprite = scene.add.sprite(0, 0, layer.textureKey).setOrigin(CLASS_SIDE_ORIGIN.x, CLASS_SIDE_ORIGIN.y);
      sprite.setDepth(layer.z);
      this.root.add(sprite);
      this.cosmeticById.set(layer.id, sprite);
    }
  }

  private addWreath(scene: Phaser.Scene): void {
    if (!scene.textures.exists("cls:wreath")) return;
    this.wreathBack = scene.add.sprite(0, 0, "cls:wreath", "char_forestWreath_cosHeadBack_e").setOrigin(0.5, 0.5);
    this.wreathBack.setDepth(57);
    this.wreathFront = scene.add.sprite(0, 0, "cls:wreath", "char_forestWreath_cosHead_e").setOrigin(0.5, 0.5);
    this.wreathFront.setDepth(65);
    this.root.add(this.wreathBack);
    this.root.add(this.wreathFront);
  }

  private syncExtras(anim: ClassSideAnim): void {
    const warrior = this.classId === "warrior";
    const extras = new Set(warrior ? outfitExtraFrames(this.outfitId) : []);
    for (const [name, image] of this.outfitImages) image.setVisible(extras.has(name) && anim !== "dash");
    for (const [id, sprite] of this.cosmeticById) {
      const show = warrior && this.equipped.includes(id) && anim !== "dash";
      sprite.setVisible(show);
      if (show) sprite.play(cosmeticAnimKey(id, anim as WarriorAnim));
    }
  }

  private placeWreath(frameKey: string): void {
    const show = this.equipped.includes("forest_wreath");
    this.wreathFront?.setVisible(show);
    this.wreathBack?.setVisible(show);
    const place = this.places[frameKey];
    if (!show || !place) return;
    const x = place.pos[0] - 256;
    const y = place.pos[1] - 448;
    const rotation = (place.rotation * Math.PI) / 180;
    for (const sprite of [this.wreathBack, this.wreathFront]) {
      sprite?.setPosition(x, y);
      sprite?.setRotation(rotation);
      sprite?.setScale(place.sx ?? 1, place.sy ?? 1);
    }
  }
}

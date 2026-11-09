import Phaser from "phaser";
import { visibilityForCosmetics, FOREST_REWARDS } from "../../domain/chapter-rewards";
import { probeNote } from "../probe";
import {
  chapterCosmeticLayers,
  cosmeticAnimKey,
  ensureCosmeticAnims,
  slotDepth,
} from "./chapter-cosmetics";
import {
  WARRIOR_ANIMS,
  WARRIOR_ASSET_ROOT,
  WARRIOR_LAYERS,
  WARRIOR_LOGICAL_SCALE,
  WARRIOR_ORIGIN,
  type WarriorAnim,
  type WarriorGroup,
  warriorAnimKey,
  warriorTextureKey,
} from "./warrior-pack";

export function queueWarriorAtlases(scene: Phaser.Scene): void {
  for (const layer of WARRIOR_LAYERS) {
    const key = warriorTextureKey(layer.slot);
    if (scene.textures.exists(key)) continue;
    scene.load.atlas(key, `${WARRIOR_ASSET_ROOT}/${layer.atlasImage}`, `${WARRIOR_ASSET_ROOT}/${layer.atlasJson}`);
  }
}

export function ensureWarriorAnims(scene: Phaser.Scene): void {
  for (const layer of WARRIOR_LAYERS) {
    for (const anim of WARRIOR_ANIMS) {
      const key = warriorAnimKey(layer.slot, anim.key);
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: anim.frames(layer.id).map((frame) => ({ key: warriorTextureKey(layer.slot), frame })),
        frameRate: anim.fps,
        repeat: anim.repeat,
      });
    }
  }
}

/** Confirms every atlas texture and the shared animation keys are in this scene. */
export function reportWarriorLoad(scene: Phaser.Scene): void {
  ensureWarriorAnims(scene);
  const missing = WARRIOR_LAYERS.filter((layer) => !scene.textures.exists(warriorTextureKey(layer.slot)));
  const anims = WARRIOR_ANIMS.map((anim) => anim.key).filter((key) => scene.anims.exists(warriorAnimKey("body", key)));
  if (missing.length > 0) {
    probeNote(`warrior:missing:${missing.map((layer) => layer.slot).join(",")}`);
    return;
  }
  probeNote(`warrior:loaded:${WARRIOR_LAYERS.length}:${anims.join(",")}`);
}

export class WarriorSprite {
  readonly root: Phaser.GameObjects.Container;
  private readonly sprites: Phaser.GameObjects.Sprite[] = [];
  private readonly bySlot = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly cosmeticById = new Map<string, Phaser.GameObjects.Sprite>();
  private anim: WarriorAnim = "idle";
  private equipped: readonly string[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    scale = WARRIOR_LOGICAL_SCALE,
    equipped: readonly string[] = [],
  ) {
    ensureWarriorAnims(scene);
    ensureCosmeticAnims(scene);
    this.root = scene.add.container(x, y);
    this.root.setScale(scale);
    this.equipped = equipped;
    for (const layer of WARRIOR_LAYERS) {
      const sprite = scene.add.sprite(0, 0, warriorTextureKey(layer.slot)).setOrigin(WARRIOR_ORIGIN.x, WARRIOR_ORIGIN.y);
      sprite.setDepth(slotDepth(layer.slot));
      this.root.add(sprite);
      this.sprites.push(sprite);
      this.bySlot.set(layer.slot, sprite);
    }
    for (const layer of chapterCosmeticLayers()) {
      if (!scene.textures.exists(layer.textureKey)) continue;
      const sprite = scene.add.sprite(0, 0, layer.textureKey).setOrigin(WARRIOR_ORIGIN.x, WARRIOR_ORIGIN.y);
      sprite.setDepth(layer.z);
      this.root.add(sprite);
      this.cosmeticById.set(layer.id, sprite);
    }
    this.root.sort("depth");
    this.applyHideRules();
    this.play("idle");
  }

  isSlotDrawn(slot: string): boolean {
    return this.bySlot.has(slot);
  }

  isSlotVisible(slot: string): boolean {
    return this.bySlot.get(slot)?.visible === true;
  }

  setEquippedCosmetics(ids: readonly string[]): void {
    this.equipped = ids;
    this.applyHideRules();
    this.play(this.anim);
  }

  play(anim: WarriorAnim, onComplete?: () => void): void {
    this.anim = anim;
    const lead = this.sprites[0];
    lead?.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    for (const layer of WARRIOR_LAYERS) {
      const sprite = this.bySlot.get(layer.slot);
      sprite?.play(warriorAnimKey(layer.slot, anim));
    }
    for (const [id, sprite] of this.cosmeticById) {
      if (!sprite.visible) continue;
      sprite.play(cosmeticAnimKey(id, anim));
    }
    if (onComplete && lead) lead.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onComplete);
  }

  /**
   * Hides a slot only when this pack draws it.
   * The wreath hides the whole outfit_head layer. The cape's back slot is not drawn here.
   */
  private applyHideRules(): void {
    const visibility = visibilityForCosmetics(FOREST_REWARDS, this.equipped, {
      slots: WARRIOR_LAYERS.map((layer) => layer.slot),
      parts: [],
    });
    for (const [slot, sprite] of this.bySlot) sprite.setVisible(!visibility.hiddenSlots.includes(slot));
    for (const [id, sprite] of this.cosmeticById) sprite.setVisible(this.equipped.includes(id));
  }

  /** Plays each one-shot, then leaves a looping pose (idle or victory) on screen. */
  playSequence(anims: readonly WarriorAnim[]): void {
    const [head, ...rest] = anims;
    if (!head) return;
    if (rest.length === 0 || head === "idle" || head === "victory") {
      this.play(head);
      return;
    }
    this.play(head, () => this.playSequence(rest));
  }

  /** Later outfits replace only these sprites. Body and class gear stay put. */
  setGroupVisible(group: WarriorGroup, visible: boolean): void {
    const visibility = visibilityForCosmetics(FOREST_REWARDS, this.equipped, {
      slots: WARRIOR_LAYERS.map((layer) => layer.slot),
      parts: [],
    });
    for (const layer of WARRIOR_LAYERS) {
      if (layer.group !== group) continue;
      const show = visible && !visibility.hiddenSlots.includes(layer.slot);
      this.bySlot.get(layer.slot)?.setVisible(show);
    }
  }

  /** The sheet faces right. A negative scaleX mirrors every layer around the shared foot pivot. */
  setFacingLeft(facingLeft: boolean): void {
    const scale = Math.abs(this.root.scaleX);
    this.root.scaleX = facingLeft ? -scale : scale;
  }
}

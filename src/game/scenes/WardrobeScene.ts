import Phaser from "phaser";
import {
  displayTitle,
  equipTitle,
  FOREST_REWARDS,
} from "../../domain/chapter-rewards";
import {
  EQUIP_ICON_ATLAS,
  WARDROBE_LIST,
  applyWardrobeIntent,
  equipIconDisplaySize,
  equipIconFrame,
  equipIconMark,
  ownedWardrobeRows,
  slotHolderId,
  wardrobeListMetrics,
  type WardrobeIntent,
  type WardrobeRow,
} from "../../domain/wardrobe-list";
import { drawEquippedTitle } from "../art/title-bar";
import { ClassSideSprite } from "../art/class-sprite";
import { queueChapterCosmetics } from "../art/chapter-cosmetics";
import { queueClassSide, queueClassWreath, savedClassId } from "../art/class-load";
import { outfitRowOffer } from "../art/worn";
import { WARDROBE_TITLE_Y, parchmentTitleY } from "../layout";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, paper } from "../ui";
import { warmButton, warmSlice } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { containerHitArea } from "../hit";
import { INK, MUTED, NOTE } from "../warm/theme";

export class WardrobeScene extends Phaser.Scene {
  private scroll = 0;
  private maxScroll = 0;
  private board?: Phaser.GameObjects.Container;
  private maskGraphics?: Phaser.GameObjects.Graphics;
  private drag = { on: false, moved: false, y: 0, scroll: 0 };

  constructor() {
    super("wardrobe");
  }

  preload(): void {
    queueClassSide(this, savedClassId(getSave()));
    queueClassWreath(this);
    queueChapterCosmetics(this);
    queueWarm(this, ["atlas_ui_core", "atlas_wardrobe"], ["bg_room"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("profiles");
      return;
    }
    this.scroll = 0;
    probeEnter("wardrobe");
    const onEsc = () => this.scene.start("overworld");
    const onWheel = (pointer: Phaser.Input.Pointer, _objects: unknown, _dx: number, dy: number) => {
      if (!this.insideList(pointer) || this.maxScroll <= 0) return;
      pointer.event?.preventDefault?.();
      this.setScroll(this.scroll + dy);
    };
    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      this.drag.moved = false;
      if (!this.insideList(pointer) || this.maxScroll <= 0) {
        this.drag.on = false;
        return;
      }
      this.drag = { on: true, moved: false, y: pointer.y, scroll: this.scroll };
    };
    const onPointerMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.drag.on) return;
      if (Math.abs(pointer.y - this.drag.y) > 8) this.drag.moved = true;
      this.setScroll(this.drag.scroll + (this.drag.y - pointer.y));
    };
    const onPointerUp = () => {
      this.drag.on = false;
    };
    this.input.keyboard?.on("keydown-ESC", onEsc);
    this.input.on("wheel", onWheel);
    this.input.on("pointerdown", onPointerDown);
    this.input.on("pointermove", onPointerMove);
    this.input.on("pointerup", onPointerUp);
    this.events.once("shutdown", () => {
      this.input.keyboard?.off("keydown-ESC", onEsc);
      this.input.off("wheel", onWheel);
      this.input.off("pointerdown", onPointerDown);
      this.input.off("pointermove", onPointerMove);
      this.input.off("pointerup", onPointerUp);
    });
    this.draw();
  }

  private insideList(pointer: Phaser.Input.Pointer): boolean {
    return pointer.x >= WARDROBE_LIST.x
      && pointer.x <= WARDROBE_LIST.x + WARDROBE_LIST.width
      && pointer.y >= WARDROBE_LIST.y
      && pointer.y <= WARDROBE_LIST.y + WARDROBE_LIST.height;
  }

  private setScroll(value: number): void {
    const next = Math.min(this.maxScroll, Math.max(0, value));
    if (next === this.scroll) return;
    this.scroll = next;
    if (this.board) this.board.y = WARDROBE_LIST.y - next;
    probeNote(`wardrobe:scroll:${this.scroll}:${this.maxScroll}`);
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.board?.clearMask(true);
    this.maskGraphics?.destroy();
    this.maskGraphics = undefined;
    this.board = undefined;
    this.children.removeAll(true);
    if (!paintRoom(this)) paper(this);
    warmSlice(this, "atlas_ui_core", "panel_parchment", 1040, 740).setPosition(640, 400);
    const titleY = parchmentTitleY(400, 740);
    this.add.text(150, titleY, "衣柜", { fontFamily: FONT, fontSize: "36px", color: INK });
    const classId = savedClassId(save);
    this.add.text(150, titleY + 48, "花环戴在帽外。战士只藏羽饰。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: NOTE,
    });
    this.add.text(430, titleY + 48, "村子只见花环。", {
      fontFamily: FONT,
      fontSize: "16px",
      color: NOTE,
    });
    if (classId !== "warrior") {
      this.add.text(620, titleY + 48, "这身衣服先给战士换。", {
        fontFamily: FONT,
        fontSize: "16px",
        color: NOTE,
      });
    }
    const rows = ownedWardrobeRows(save);
    const metrics = wardrobeListMetrics(rows.length);
    this.maxScroll = metrics.maxScroll;
    this.scroll = Math.min(this.scroll, this.maxScroll);
    this.add.text(150, WARDROBE_LIST.y - 32, "已有装备", { fontFamily: FONT, fontSize: "22px", color: INK });
    if (rows.length === 0) {
      this.add.text(160, WARDROBE_LIST.y + 8, "还没得到", { fontFamily: FONT, fontSize: "18px", color: MUTED });
    } else {
      this.drawRows(rows, classId, save.equippedOutfitId);
    }
    if (this.maxScroll > 0) {
      this.add.text(150, WARDROBE_LIST.y + WARDROBE_LIST.height + 8, "衣服多了可以上下看。", {
        fontFamily: FONT,
        fontSize: "16px",
        color: NOTE,
      });
    }
    const rowNote = rows.map((row, index) => {
      const center = WARDROBE_LIST.y + index * WARDROBE_LIST.rowStride + WARDROBE_LIST.rowStride / 2;
      return `${row.id}:${row.equipped ? "on" : "off"}:${Math.round(center)}`;
    }).join(",");
    probeNote(`wardrobe:list:${rows.length}:${this.scroll}:${this.maxScroll}:${rowNote}`);

    this.add.text(160, 548, "称号。一次只戴一个。", { fontFamily: FONT, fontSize: "22px", color: INK });
    if (save.unlockedTitleIds.length === 0) {
      this.add.text(160, 580, "还没有称号。", { fontFamily: FONT, fontSize: "18px", color: MUTED });
    }
    save.unlockedTitleIds.forEach((titleId, index) => {
      const title = displayTitle(FOREST_REWARDS, titleId);
      const on = save.equippedTitleId === titleId;
      warmButton(this, 230 + index * 210, 610, on ? title.shownZh : `戴 ${title.shownZh}`, () => {
        mutate((current) => equipTitle(current, on ? null : titleId));
        this.draw();
      }, { width: 190, height: 56, tone: on ? "primary" : "secondary" });
    });
    if (save.equippedTitleId) {
      warmButton(this, 860, 610, "卸下称号", () => {
        mutate((current) => equipTitle(current, null));
        this.draw();
      }, { width: 150, height: 56, tone: "secondary" });
    }

    this.add.image(1000, 294, "atlas_wardrobe", "wardrobe_arch").setDisplaySize(280, 420);
    this.add.image(1000, 492, "atlas_wardrobe", "wardrobe_stage").setDisplaySize(280, 105);
    const hero = new ClassSideSprite(this, 1000, 500, classId, 0.48, save.equippedCosmeticIds, save.equippedOutfitId);
    hero.play("idle");
    drawEquippedTitle(this, 1000, WARDROBE_TITLE_Y, save.equippedTitleId, 440);
    const worn = `${save.equippedOutfitId}:${save.equippedCosmeticIds.join(",") || "none"}`;
    const helmet = hero.isSlotVisible("outfit_head") || hero.isSlotVisible("outfit_head_noplume") ? "shown" : "hidden";
    const back = hero.isSlotDrawn("back") ? "drawn" : "absent";
    probeNote(`forest:equip:${worn}:helmet=${helmet}:back=${back}`);
    warmButton(this, 1040, 730, "返回 Esc", () => this.scene.start("overworld"), { width: 180, tone: "secondary" });
  }

  /**
   * Fixed icon well. A reviewed `atlas_equip_icons` frame `equip_{id}` replaces
   * the mark; until that texture is queued, the well keeps a slot character.
   */
  private equipIcon(
    x: number,
    y: number,
    size: number,
    row: WardrobeRow,
  ): Phaser.GameObjects.GameObject[] {
    const frame = equipIconFrame(row.id);
    const atlas = this.textures.exists(EQUIP_ICON_ATLAS) ? this.textures.get(EQUIP_ICON_ATLAS) : null;
    if (atlas?.has(frame)) {
      return [this.add.image(x, y, EQUIP_ICON_ATLAS, frame).setDisplaySize(size, size)];
    }
    const plate = this.add.graphics();
    plate.fillStyle(0xead8bd, 1);
    plate.lineStyle(3, 0x3b2a20, 1);
    plate.fillRoundedRect(x - size / 2, y - size / 2, size, size, 12);
    plate.strokeRoundedRect(x - size / 2, y - size / 2, size, size, 12);
    const mark = this.add.text(x, y, equipIconMark(row.slot), {
      fontFamily: FONT,
      fontSize: "28px",
      color: INK,
    }).setOrigin(0.5);
    return [plate, mark];
  }

  private drawRows(rows: readonly WardrobeRow[], classId: ReturnType<typeof savedClassId>, equippedOutfitId: string): void {
    const board = this.add.container(0, WARDROBE_LIST.y - this.scroll);
    this.board = board;
    const maskGraphics = this.make.graphics({ x: 0, y: 0 }, false);
    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(WARDROBE_LIST.x, WARDROBE_LIST.y, WARDROBE_LIST.width, WARDROBE_LIST.height);
    this.maskGraphics = maskGraphics;
    board.setMask(maskGraphics.createGeometryMask());
    rows.forEach((row, index) => {
      const offer = row.kind === "outfit"
        ? outfitRowOffer(row.id, equippedOutfitId)
        : { canCancel: true, wornLabel: null, note: null };
      const shownEquipped = offer.wornLabel !== null || row.equipped;
      const centerY = index * WARDROBE_LIST.rowStride + WARDROBE_LIST.rowStride / 2;
      const centerX = WARDROBE_LIST.x + WARDROBE_LIST.width / 2;
      const frame = !row.applies
        ? "wardrobe_slot_disabled"
        : shownEquipped
          ? "wardrobe_slot_selected"
          : "wardrobe_slot_normal";
      const slot = warmSlice(this, "atlas_wardrobe", frame, WARDROBE_LIST.width, 88);
      slot.setPosition(centerX, centerY);
      const markX = WARDROBE_LIST.x + 36;
      const box = this.add.graphics();
      box.lineStyle(3, 0x3b2a20, 1);
      box.strokeCircle(markX, centerY, 14);
      const mark = this.add.image(markX, centerY, "atlas_ui_core", "icon_check").setScale(28 / 96);
      mark.setVisible(shownEquipped);
      const iconSize = equipIconDisplaySize(WARDROBE_LIST.width);
      const iconX = markX + 14 + 10 + iconSize / 2;
      const icon = this.equipIcon(iconX, centerY, iconSize, row);
      const label = this.add.text(iconX + iconSize / 2 + 12, offer.note ? centerY - 14 : centerY, row.name, {
        fontFamily: FONT,
        fontSize: "22px",
        color: row.applies ? INK : MUTED,
      }).setOrigin(0, 0.5);
      const note = offer.note
        ? this.add.text(iconX + iconSize / 2 + 12, centerY + 16, offer.note, {
          fontFamily: FONT,
          fontSize: "16px",
          color: NOTE,
        }).setOrigin(0, 0.5)
        : null;
      const wornLabel = offer.wornLabel
        ? this.add.text(WARDROBE_LIST.x + WARDROBE_LIST.width - 24, centerY, offer.wornLabel, {
          fontFamily: FONT,
          fontSize: "18px",
          color: NOTE,
        }).setOrigin(1, 0.5)
        : null;
      const limit = row.applies
        ? null
        : this.add.text(WARDROBE_LIST.x + WARDROBE_LIST.width - 24, centerY, "只给战士", {
          fontFamily: FONT,
          fontSize: "18px",
          color: NOTE,
        }).setOrigin(1, 0.5);
      const hit = this.add.container(centerX, centerY);
      hit.setSize(WARDROBE_LIST.width, 88);
      hit.setName(`wardrobe:${row.id}`);
      const area = containerHitArea(WARDROBE_LIST.width, 88);
      const canPress = row.applies && (offer.canCancel || offer.wornLabel === null);
      if (canPress) {
        hit.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
        if (hit.input) hit.input.cursor = "pointer";
      }
      let down = false;
      let intent: WardrobeIntent | null = null;
      const show = (state: "normal" | "hover" | "pressed") => {
        if (!row.applies) {
          slot.setFrame("wardrobe_slot_disabled");
          return;
        }
        if (shownEquipped && state === "normal") slot.setFrame("wardrobe_slot_selected");
        else slot.setFrame(`wardrobe_slot_${state}`);
      };
      hit.on("pointerover", () => {
        if (!down) show("hover");
      });
      hit.on("pointerout", () => {
        down = false;
        show("normal");
      });
      hit.on("pointerdown", () => {
        down = true;
        show("pressed");
        const current = getSave();
        const piece = current ? ownedWardrobeRows(current).find((item) => item.id === row.id) : undefined;
        if (!current || !piece || !piece.applies) {
          intent = null;
          return;
        }
        const held = ownedWardrobeRows(current)
          .filter((item) => item.equipped)
          .map((item) => ({ id: item.id, slot: item.slot }));
        const rowOffer = piece.kind === "outfit" ? outfitRowOffer(piece.id, current.equippedOutfitId) : offer;
        if (!rowOffer.canCancel) {
          intent = rowOffer.wornLabel
            ? null
            : { id: piece.id, wantEquipped: true, seenHolderId: slotHolderId(held, piece.slot) };
          return;
        }
        intent = {
          id: piece.id,
          wantEquipped: !piece.equipped,
          seenHolderId: slotHolderId(held, piece.slot),
        };
      });
      hit.on("pointerup", () => {
        const chosen = intent;
        if (!down || this.drag.moved || !chosen) {
          down = false;
          show("normal");
          return;
        }
        down = false;
        const pointer = this.input.activePointer;
        if (!this.insideList(pointer)) {
          show("normal");
          return;
        }
        const current = getSave();
        if (!current) return;
        const result = applyWardrobeIntent(current, chosen, classId);
        if (result.ok && result.save !== current) mutate(() => result.save);
        this.draw();
      });
      board.add([slot, box, mark, ...icon, label, ...(note ? [note] : []), ...(wornLabel ? [wornLabel] : []), ...(limit ? [limit] : []), hit]);
    });
  }
}

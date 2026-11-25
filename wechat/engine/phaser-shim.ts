/**
 * 原来：src/main.ts 用 Phaser.WEBGL、Scale.FIT、键盘和鼠标。
 * 现在：同名的 Scene / Game / Geom 由 wechat/engine 提供，画布是 2d。
 * 为什么：小程序不能打包 Phaser。场景文件的 import 通过 vite alias 指到这里。
 */

import { GeomRectangle, Rectangle } from "./hit";
import { RuntimeGame, RuntimeScene, SpriteNode } from "./scene";
import { TEXT_CACHE_FIELDS } from "./text";
import { easeValue } from "./tween";
import { nineSliceParts } from "./nineslice";
import { hitContains } from "./hit";
import { orderByDepth } from "./node";

const Phaser = {
  WEBGL: 2,
  CANVAS: 1,
  AUTO: 0,
  Scene: RuntimeScene,
  Game: RuntimeGame,
  GameObjects: {
    Text: class {},
    Image: class {},
    Sprite: SpriteNode,
    Container: class {},
    Graphics: class {},
    Rectangle: class {},
    Zone: class {},
    NineSlice: class {},
    GameObject: class {},
  },
  Geom: { Rectangle: GeomRectangle },
  Scale: { FIT: "FIT", CENTER_BOTH: "CENTER_BOTH", Events: { RESIZE: "resize" } },
  Scenes: { Events: { UPDATE: "update" } },
  Animations: { Events: { ANIMATION_COMPLETE: "animationcomplete", ANIMATION_UPDATE: "animationupdate" } },
  Input: { Events: {} },
  Math: { Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value)) },
};

export default Phaser;
export { Phaser, TEXT_CACHE_FIELDS, easeValue, nineSliceParts, hitContains, orderByDepth, Rectangle };
export function liveTimerCount(game: RuntimeGame): number {
  return game.active()?.time.events.length ?? 0;
}

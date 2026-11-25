/**
 * 原来：场景用 Phaser.GameObjects 的链式 setOrigin / setScale / setDepth。
 * 现在：这些字段记在节点上，绘制时按 depth 再按插入顺序。
 * 为什么：不能把 Phaser 打进小程序。setScrollFactor 只记录，不改坐标，因为战斗场景没有滚动相机。
 */

export type NodeKind = "text" | "image" | "rectangle" | "container" | "graphics" | "zone" | "nineslice" | "sprite";

export class GameNode {
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  scaleX = 1;
  scaleY = 1;
  originX = 0;
  originY = 0;
  alpha = 1;
  visible = true;
  rotation = 0;
  flipX = false;
  depth = 0;
  tint = 0xffffff;
  scrollFactorX = 1;
  scrollFactorY = 1;
  name = "";
  order = 0;
  scene: unknown;
  parent: GameNode | null = null;
  inputEnabled = false;
  hitRect: { x: number; y: number; width: number; height: number } | null = null;
  data = new Map<string, unknown>();
  input = { cursor: "" };
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(readonly type: NodeKind, scene: unknown, x = 0, y = 0) {
    this.scene = scene;
    this.x = x;
    this.y = y;
  }

  get scale(): number {
    return this.scaleX;
  }

  set scale(value: number) {
    this.scaleX = value;
    this.scaleY = value;
  }

  setPosition(x: number, y = this.y): this {
    this.x = x;
    this.y = y;
    return this;
  }

  setX(x: number): this {
    this.x = x;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    return this;
  }

  on(event: string, fn: (...args: unknown[]) => void): this {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn);
    this.listeners.set(event, set);
    return this;
  }

  off(event: string, fn?: (...args: unknown[]) => void): this {
    const set = this.listeners.get(event);
    if (!set) return this;
    if (!fn) set.clear();
    else set.delete(fn);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return false;
    for (const fn of [...set]) fn(...args);
    return true;
  }

  setOrigin(x: number, y = x): this {
    this.originX = x;
    this.originY = y;
    return this;
  }

  setScale(x: number, y = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }

  setRotation(rotation: number): this {
    this.rotation = rotation;
    return this;
  }

  setFlipX(flip: boolean): this {
    this.flipX = flip;
    return this;
  }

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }

  /**
   * 原来：Phaser setScrollFactor 让物体跟相机。
   * 现在：只记下数值，绘制不加相机位移。
   * 为什么：全仓只有 BattleScene 一处，而且没有滚动相机。这是任务允许的空操作，其它功能不能照这个做。
   */
  setScrollFactor(x: number, y = x): this {
    this.scrollFactorX = x;
    this.scrollFactorY = y;
    return this;
  }

  setName(name: string): this {
    this.name = name;
    return this;
  }

  setTint(tint: number): this {
    this.tint = tint >>> 0;
    return this;
  }

  clearTint(): this {
    this.tint = 0xffffff;
    return this;
  }

  setInteractive(rect?: { x: number; y: number; width: number; height: number }): this {
    this.inputEnabled = true;
    this.hitRect = rect ?? { x: 0, y: 0, width: this.width, height: this.height };
    return this;
  }

  disableInteractive(): this {
    this.inputEnabled = false;
    return this;
  }

  setData(key: string, value: unknown): this {
    this.data.set(key, value);
    return this;
  }

  getData(key: string): unknown {
    return this.data.get(key);
  }

  setDisplaySize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  setSize(width: number, height: number): this {
    return this.setDisplaySize(width, height);
  }

  destroy(): void {
    this.visible = false;
  }
}

export function displayBox(node: GameNode): { x: number; y: number; w: number; h: number } {
  const w = node.width * node.scaleX;
  const h = node.height * node.scaleY;
  return {
    x: node.x - node.originX * w,
    y: node.y - node.originY * h,
    w,
    h,
  };
}

export function orderByDepth(nodes: GameNode[]): GameNode[] {
  return [...nodes].sort((a, b) => a.depth - b.depth || a.order - b.order);
}

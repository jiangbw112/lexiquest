import { SpritePlayback, AnimationManager, type AnimDef } from "./anims";
import { presentWechat } from "./present";
import { GameGraphics } from "./graphics";
import { GeomRectangle } from "./hit";
import { NineSlice, type SliceInsets } from "./nineslice";
import { GameNode, orderByDepth } from "./node";
import { GameText, type TextStyle } from "./text";
import { TweenManager } from "./tween";

type Listener = (...args: unknown[]) => void;
type BoundListener = { fn: Listener; context: unknown; once: boolean };

class Emitter {
  private readonly map = new Map<string, BoundListener[]>();
  on(event: string, fn: Listener, context?: unknown): this {
    const list = this.map.get(event) ?? [];
    list.push({ fn, context, once: false });
    this.map.set(event, list);
    return this;
  }
  once(event: string, fn: Listener, context?: unknown): this {
    const list = this.map.get(event) ?? [];
    list.push({ fn, context, once: true });
    this.map.set(event, list);
    return this;
  }
  off(event: string, fn?: Listener, context?: unknown): this {
    const list = this.map.get(event);
    if (!list) return this;
    if (!fn) {
      list.length = 0;
      return this;
    }
    this.map.set(
      event,
      list.filter((entry) => entry.fn !== fn || (context !== undefined && entry.context !== context)),
    );
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    const list = this.map.get(event);
    if (!list) return;
    const pending = [...list];
    this.map.set(
      event,
      list.filter((entry) => !entry.once),
    );
    for (const entry of pending) entry.fn.call(entry.context, ...args);
  }
}

class TimerEvent {
  elapsed = 0;
  dead = false;
  constructor(
    readonly delay: number,
    readonly callback: () => void,
    readonly loop: boolean,
  ) {}
  step(delta: number): void {
    if (this.dead) return;
    this.elapsed += delta;
    if (this.elapsed < this.delay) return;
    this.callback();
    if (this.loop) this.elapsed = 0;
    else this.dead = true;
  }
  remove(): void {
    this.dead = true;
  }
  destroy(): void {
    this.dead = true;
  }
}

export class Clock {
  timeScale = 1;
  now = 0;
  readonly events: TimerEvent[] = [];
  delayedCall(delay: number, callback: () => void): TimerEvent {
    const event = new TimerEvent(delay, callback, false);
    this.events.push(event);
    return event;
  }
  addEvent(config: { delay: number; loop?: boolean; callback: () => void }): TimerEvent {
    const event = new TimerEvent(config.delay, config.callback, Boolean(config.loop));
    this.events.push(event);
    return event;
  }
  step(delta: number): void {
    const scaled = delta * this.timeScale;
    this.now += scaled;
    for (const event of this.events) event.step(scaled);
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (this.events[index].dead) this.events.splice(index, 1);
    }
  }
  clear(): void {
    for (const event of this.events) event.dead = true;
    this.events.length = 0;
  }
}

interface QueuedFile {
  kind: "atlas" | "image" | "json";
  key: string;
  urls: string[];
}

class Loader extends Emitter {
  readonly queue: QueuedFile[] = [];
  readonly attempted = new Set<string>();
  isLoadingFlag = false;
  get totalToLoad(): number {
    return this.queue.length;
  }
  isLoading(): boolean {
    return this.isLoadingFlag;
  }
  atlas(key: string, image: string, data: string): this {
    // 原来：Phaser 的 load.start 是异步的，complete 之后才会再画。
    // 现在：同一个 key 只排一次。缺文本也记过，避免 complete 里同步 draw 再把同一图集排进来。
    // 为什么：同步 emit("complete") 会让关卡地图在图集没就绪时把调用栈撑满。
    if (this.attempted.has(key) || this.scene.textures.exists(key)) return this;
    this.attempted.add(key);
    this.queue.push({ kind: "atlas", key, urls: [image, data] });
    return this;
  }
  image(key: string, url: string): this {
    this.queue.push({ kind: "image", key, urls: [url] });
    return this;
  }
  json(key: string, url: string): this {
    this.queue.push({ kind: "json", key, urls: [url] });
    return this;
  }
  start(): void {
    this.isLoadingFlag = true;
    const scene = this.scene;
    const reader = (globalThis as { __LEXI_READ_ASSET__?: (url: string) => string | null }).__LEXI_READ_ASSET__;
    for (const file of this.queue) {
      if (file.kind === "atlas" || file.kind === "json") {
        const text = reader ? reader(file.urls[file.kind === "atlas" ? 1 : 0]) : null;
        const imageUrl = file.urls[0] ?? "";
        if (!text) scene.game.failures.push(`asset text missing: ${file.urls.join(" ")}`);
        else {
          try {
            scene.textures.add(file.key, JSON.parse(text), imageUrl, packedPath(imageUrl));
          } catch (error) {
            scene.game.failures.push(`asset json failed: ${file.key} ${error instanceof Error ? error.message : ""}`);
          }
        }
        if (file.kind === "atlas" && imageUrl && !packedPath(imageUrl)) scene.game.failures.push(`atlas pixels not in package: ${imageUrl}`);
      } else {
        const imageUrl = file.urls[0] ?? "";
        const packed = packedPath(imageUrl);
        scene.textures.add(file.key, null, imageUrl, packed);
        if (!packed) scene.game.failures.push(`image not in package: ${imageUrl}`);
      }
    }
    this.queue.length = 0;
    this.isLoadingFlag = false;
    this.emit("complete");
  }
  constructor(private readonly scene: RuntimeScene) {
    super();
  }
}

function packedPath(url: string): string {
  const reader = (globalThis as { __LEXI_PACKED_IMAGE__?: (url: string) => string | null }).__LEXI_PACKED_IMAGE__;
  if (!url || typeof reader !== "function") return "";
  return reader(url) || "";
}

export interface FrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FramePlacement {
  cut: FrameRect;
  sourceW: number;
  sourceH: number;
  trimX: number;
  trimY: number;
  trimW: number;
  trimH: number;
}

/**
 * 原来：图集帧只返回裁过的矩形，角色层按节点的 1×1 去画。
 * 现在：同时返回源画布和 spriteSourceSize，方便把裁块放回 512 的脚点。
 * 为什么：侧视层是按同一张源画布对齐的。旋转帧不在这条路径上。
 */
export function framePlacementOf(data: unknown, name: string): FramePlacement | null {
  if (!data || typeof data !== "object" || !name) return null;
  const frames = (data as { frames?: Record<string, { frame?: FrameRect; rotated?: boolean; spriteSourceSize?: FrameRect; sourceSize?: { w?: number; h?: number } }> }).frames;
  const entry = frames?.[name];
  const cut = entry?.frame;
  if (!cut || cut.w <= 0 || cut.h <= 0 || entry.rotated) return null;
  const sourceW = entry.sourceSize?.w && entry.sourceSize.w > 0 ? entry.sourceSize.w : cut.w;
  const sourceH = entry.sourceSize?.h && entry.sourceSize.h > 0 ? entry.sourceSize.h : cut.h;
  const trim = entry.spriteSourceSize;
  return {
    cut: { x: cut.x, y: cut.y, w: cut.w, h: cut.h },
    sourceW,
    sourceH,
    trimX: trim?.x ?? 0,
    trimY: trim?.y ?? 0,
    trimW: trim?.w && trim.w > 0 ? trim.w : cut.w,
    trimH: trim?.h && trim.h > 0 ? trim.h : cut.h,
  };
}

export function frameRectOf(data: unknown, name: string): FrameRect | null {
  if (!data || typeof data !== "object") return null;
  const frames = (data as { frames?: Record<string, { frame?: FrameRect }> }).frames;
  if (name && frames?.[name]?.frame) {
    const frame = frames[name].frame;
    if (!frame || frame.w <= 0 || frame.h <= 0) return null;
    return { x: frame.x, y: frame.y, w: frame.w, h: frame.h };
  }
  const size = (data as { meta?: { size?: { w?: number; h?: number } } }).meta?.size;
  if (!name && size && size.w && size.h) return { x: 0, y: 0, w: size.w, h: size.h };
  return null;
}

class TextureStore {
  private readonly items = new Map<string, { key: string; data: unknown; image: string; packed: string }>();
  exists(key: string): boolean {
    return this.items.has(key);
  }
  get(key: string): {
    key: string;
    data: unknown;
    image: string;
    packed: string;
    missing: boolean;
    getFrameNames: () => string[];
    has: (frame: string) => boolean;
    frameRect: (frame: string) => FrameRect | null;
  } {
    const item = this.items.get(key);
    const data = item?.data;
    const frames = data && typeof data === "object" && "frames" in data ? Object.keys((data as { frames: object }).frames) : [];
    return {
      key,
      data: data ?? null,
      image: item?.image ?? "",
      packed: item?.packed ?? "",
      missing: !item,
      getFrameNames: () => frames,
      has: (frame: string) => frames.includes(frame),
      frameRect: (frame: string) => frameRectOf(data, frame),
    };
  }
  add(key: string, data: unknown, image: string, packed = ""): void {
    this.items.set(key, { key, data, image, packed: packed || packedPath(image) });
  }
}

class DisplayList {
  list: GameNode[] = [];
  get length(): number {
    return this.list.length;
  }
  add(node: GameNode): GameNode {
    node.order = this.list.length;
    this.list.push(node);
    return node;
  }
  bringToTop(node: GameNode): void {
    const index = this.list.indexOf(node);
    if (index >= 0) this.list.splice(index, 1);
    node.order = this.list.length;
    this.list.push(node);
  }
  moveBelow(node: GameNode, above: GameNode): void {
    const from = this.list.indexOf(node);
    if (from >= 0) this.list.splice(from, 1);
    const at = this.list.indexOf(above);
    this.list.splice(Math.max(0, at), 0, node);
  }
  removeAll(destroy: boolean): void {
    if (destroy) for (const node of this.list) node.destroy();
    this.list = [];
  }
  ordered(): GameNode[] {
    return orderByDepth(this.list.filter((node) => node.visible));
  }
}

export class ImageNode extends GameNode {
  texture = "";
  frame = "";
  pixelMissing = true;
  playback: SpritePlayback;
  constructor(scene: RuntimeScene, x: number, y: number, texture: string, frame = "", kind: "image" | "sprite" = "image") {
    super(kind, scene, x, y);
    this.texture = texture;
    this.frame = frame;
    this.pixelMissing = true;
    this.originX = 0.5;
    this.originY = 0.5;
    this.width = 1;
    this.height = 1;
    this.playback = new SpritePlayback((next) => {
      this.texture = next.key;
      this.frame = next.frame;
    });
  }
  setFrame(frame: string): this {
    this.frame = frame;
    return this;
  }
  play(key: string): this {
    const def = (this.scene as RuntimeScene).anims.get(key);
    if (!def) {
      (this.scene as RuntimeScene).game.failures.push(`missing animation: ${key}`);
      return this;
    }
    this.playback.play(def);
    return this;
  }
  stop(): this {
    this.playback.stop();
    return this;
  }
}

export class SpriteNode extends ImageNode {
  constructor(scene: RuntimeScene, x: number, y: number, texture: string, frame = "") {
    super(scene, x, y, texture, frame, "sprite");
  }
  on(event: string, fn: (...args: unknown[]) => void): this {
    this.playback.on(event, fn);
    return this;
  }
  once(event: string, fn: (...args: unknown[]) => void): this {
    this.playback.once(event, fn);
    return this;
  }
  off(event: string, fn?: (...args: unknown[]) => void): this {
    this.playback.off(event, fn);
    return this;
  }
}

class ContainerNode extends GameNode {
  list: GameNode[] = [];
  constructor(scene: unknown, x: number, y: number) {
    super("container", scene, x, y);
    this.originX = 0.5;
    this.originY = 0.5;
  }
  add(...node: Array<GameNode | GameNode[]>): this {
    // 原来：board.add 只改 parent，子节点仍留在场景根上，mask 盖不到它们。
    // 现在：先从场景列表和旧容器拿出来，再挂到这个容器。
    // 为什么：衣柜先 add 再 board.add。不挪走就会画两次，滚动也带不动。
    const scene = this.scene as { children?: { list: GameNode[] } } | null;
    for (const child of node.flat()) {
      if (!child) continue;
      const sceneList = scene?.children?.list;
      const sceneIndex = sceneList?.indexOf(child) ?? -1;
      if (sceneList && sceneIndex >= 0) sceneList.splice(sceneIndex, 1);
      const previous = child.parent as ContainerNode | null;
      if (previous && previous !== this) {
        const index = previous.list.indexOf(child);
        if (index >= 0) previous.list.splice(index, 1);
      }
      child.parent = this;
      if (!this.list.includes(child)) this.list.push(child);
    }
    return this;
  }
  setMask(mask: unknown): this {
    this.data.set("mask", mask);
    return this;
  }
  clearMask(destroyGraphics = false): this {
    const mask = this.data.get("mask") as { graphics?: { destroy?: () => void } } | undefined;
    this.data.delete("mask");
    if (destroyGraphics) mask?.graphics?.destroy?.();
    return this;
  }

  getByName(name: string): GameNode | null {
    return this.list.find((child) => child.name === name) ?? null;
  }

  removeAll(destroy = false): this {
    if (destroy) for (const child of this.list) child.destroy();
    this.list = [];
    return this;
  }

  sort(key: string): this {
    this.list.sort((a, b) => {
      const left = (a as unknown as Record<string, number>)[key] ?? 0;
      const right = (b as unknown as Record<string, number>)[key] ?? 0;
      return left - right;
    });
    return this;
  }
}

class RectangleNode extends GameNode {
  fillColor = 0xffffff;
  constructor(scene: unknown, x: number, y: number, width: number, height: number, fill?: number) {
    super("rectangle", scene, x, y);
    this.originX = 0.5;
    this.originY = 0.5;
    this.width = width;
    this.height = height;
    if (typeof fill === "number") this.fillColor = fill;
  }
  setFillStyle(color: number): this {
    this.fillColor = color;
    return this;
  }

  setStrokeStyle(width: number, color = 0x000000): this {
    this.data.set("strokeWidth", width);
    this.data.set("strokeColor", color);
    return this;
  }
}

class ZoneNode extends GameNode {
  constructor(scene: unknown, x: number, y: number, width: number, height: number) {
    super("zone", scene, x, y);
    this.width = width;
    this.height = height;
  }
}

class Keyboard extends Emitter {
  globalCapture = true;
  disableGlobalCapture(): void {
    this.globalCapture = false;
  }
  addCapture(): void {
    this.globalCapture = true;
  }
  createCursorKeys(): Record<string, { isDown: boolean }> {
    const key = () => ({ isDown: false });
    return { up: key(), down: key(), left: key(), right: key(), space: key() };
  }
}

export class RuntimeScene {
  readonly key: string;
  readonly events = new Emitter();
  readonly tweens = new TweenManager();
  readonly time = new Clock();
  readonly anims = new AnimationManager();
  textures: TextureStore;
  readonly children = new DisplayList();
  readonly load: Loader;
  readonly input: {
    keyboard: Keyboard;
    cursor: string | null;
    setDefaultCursor: (cursor: string) => void;
    on: (event: string, fn: (...args: unknown[]) => void, context?: unknown) => unknown;
    off: (event: string, fn?: (...args: unknown[]) => void, context?: unknown) => unknown;
    once: (event: string, fn: (...args: unknown[]) => void, context?: unknown) => unknown;
    emit: (event: string, ...args: unknown[]) => void;
    activePointer: { x: number; y: number };
  };
  readonly scale: { displaySize: { width: number; height: number }; on: Emitter["on"]; off: Emitter["off"] };
  readonly cameras = { main: { setBackgroundColor: (_color: string) => undefined, scrollX: 0, scrollY: 0 } };
  readonly sound = { play: () => undefined };
  readonly cache = {
    json: {
      store: new Map<string, unknown>(),
      exists(key: string) {
        return this.store.has(key);
      },
      get(key: string) {
        return this.store.get(key) ?? null;
      },
      add(key: string, data: unknown) {
        this.store.set(key, data);
      },
    },
  };
  sys: { game: RuntimeGame };
  game: RuntimeGame;
    scene: { start: (key: string, data?: unknown) => void; stop: () => void };
  add: {
    text: (x: number, y: number, text: string, style?: TextStyle) => GameText;
    image: (x: number, y: number, key: string, frame?: string) => ImageNode;
    sprite: (x: number, y: number, key: string, frame?: string) => ImageNode;
    rectangle: (x: number, y: number, width: number, height: number, fill?: number) => RectangleNode;
    container: (x?: number, y?: number) => ContainerNode;
    graphics: () => GameGraphics;
    zone: (x: number, y: number, width: number, height: number) => ZoneNode;
    nineslice: (
      x: number,
      y: number,
      texture: string,
      frame: string,
      width: number,
      height: number,
      left: number,
      right: number,
      top: number,
      bottom: number,
    ) => NineSlice;
  };
  make: { graphics: (config?: { x?: number; y?: number }) => GameGraphics };

  constructor(config: string | { key?: string }, game?: RuntimeGame) {
    this.key = typeof config === "string" ? config : config.key || "scene";
    this.game = game ?? ({ failures: [] } as unknown as RuntimeGame);
    this.sys = { game: this.game };
    this.textures = this.game.textures ?? new TextureStore();
    this.load = new Loader(this);
    const keyboard = new Keyboard();
    const pointer = new Emitter();
    // 原来：on 绑在键盘上，后面又把 emit 改到另一个指针对象。衣柜的滚轮监听收不到。
    // 现在：key 开头进键盘，其余（wheel、pointer）进同一个指针对象。on 和 emit 走这一条。
    // 为什么：场景用 input.on("wheel") 注册，滚动必须用 input.emit("wheel") 打到同一处。
    const route = (event: string) => (event.startsWith("key") ? keyboard : pointer);
    this.input = {
      keyboard,
      cursor: null as string | null,
      setDefaultCursor(cursor: string) {
        this.cursor = cursor;
      },
      on: (event, fn, context) => route(event).on(event, fn, context),
      off: (event, fn, context) => route(event).off(event, fn, context),
      once: (event, fn, context) => route(event).once(event, fn, context),
      emit: (event, ...args) => route(event).emit(event, ...args),
      activePointer: { x: 0, y: 0 },
    };
    const scaleEvents = new Emitter();
    this.scale = {
      displaySize: { width: 1280, height: 800 },
      on: scaleEvents.on.bind(scaleEvents),
      off: scaleEvents.off.bind(scaleEvents),
    };
    const addNode = <T extends GameNode>(node: T): T => {
      this.children.add(node);
      return node;
    };
    this.add = {
      text: (x, y, text, style) => addNode(new GameText(this, x, y, text, style)),
      image: (x, y, key, frame) => addNode(new ImageNode(this, x, y, key, frame, "image")),
      sprite: (x, y, key, frame) => addNode(new SpriteNode(this, x, y, key, frame)),
      rectangle: (x, y, width, height, fill) => addNode(new RectangleNode(this, x, y, width, height, fill)),
      container: (x = 0, y = 0, children?: GameNode[]) => {
        // 原来：container(x, y, children) 把子节点留在场景根上，按钮字和热区被拆开。
        // 现在：传入的子节点从场景列表挪进容器，父级就是这个热区。
        // 为什么：点文字必须命中同一个按钮。Phaser 的第三个参数就是这些子节点。
        const node = addNode(new ContainerNode(this, x, y));
        for (const child of children ?? []) {
          const index = this.children.list.indexOf(child);
          if (index >= 0) this.children.list.splice(index, 1);
          node.add(child);
        }
        return node;
      },
      graphics: () => addNode(new GameGraphics(this)),
      zone: (x, y, width, height) => addNode(new ZoneNode(this, x, y, width, height)),
      nineslice: (x, y, texture, frame, width, height, left, right, top, bottom) => {
        const insets: SliceInsets = { left, right, top, bottom };
        return addNode(new NineSlice(this, x, y, texture, frame, width, height, insets));
      },
    };
    this.make = {
      graphics: (config) => new GameGraphics(this, config?.x ?? 0, config?.y ?? 0),
    };
    this.scene = {
      start: (key: string, data?: unknown) => this.game.start(key, data),
      // 原来：Phaser 的 launch 把结算叠在战斗上面。
      // 现在：只有一个活动场景，launch 带着战斗算出的 view 切到结算。
      // 为什么：结算的 init 要这份 view。不传就会在读 won 时抛错。
      launch: (key: string, data?: unknown) => this.game.start(key, data),
      pause: () => undefined,
      stop: () => this.shutdown(),
      isActive: () => this.game.active() === this,
    };
  }

  update(_time: number, delta: number): void {
    this.time.step(delta);
    this.tweens.step(delta);
    for (const node of this.children.list) {
      if (node instanceof ImageNode) node.playback.step(delta);
    }
  }

  shutdown(): void {
    this.time.clear();
    this.tweens.killAll();
    this.events.emit("shutdown");
  }
}

export class RuntimeGame {
  readonly failures: string[] = [];
  readonly textures = new TextureStore();
  canvas: { width: number; height: number; addEventListener?: (event: string, fn: () => void) => void } | null = null;
  loop = { sleep: () => undefined, wake: (_fromSleep?: boolean) => undefined };
  sound = {
    pauseOnBlur: false,
    locked: false,
    context: undefined as undefined | { state: string; resume: () => Promise<void>; createOscillator: () => unknown; createGain: () => unknown },
    pauseAll: () => undefined,
    resumeAll: () => undefined,
  };
  private readonly registry = new Map<string, new (config: string | { key?: string }, game: RuntimeGame) => RuntimeScene>();
  private current: RuntimeScene | null = null;
  private order = 0;

  constructor(config: {
    canvas?: RuntimeGame["canvas"];
    width?: number;
    height?: number;
    scene?: Array<new (config: string | { key?: string }) => RuntimeScene>;
  }) {
    this.canvas = config.canvas ?? null;
    for (const SceneCtor of config.scene ?? []) {
      const probe = new SceneCtor("probe");
      const key = probe.key || `scene-${this.order}`;
      this.order += 1;
      this.registry.set(key, SceneCtor as unknown as new (config: string | { key?: string }, game: RuntimeGame) => RuntimeScene);
    }
  }

  start(key: string, data?: unknown): RuntimeScene {
    if (this.current) this.current.shutdown();
    const Ctor = this.registry.get(key);
    if (!Ctor) throw new Error(`missing scene ${key}`);
    const scene = new Ctor(key, this);
    scene.game = this;
    scene.sys.game = this;
    scene.textures = this.textures;
    this.current = scene;
    const preload = (scene as unknown as { preload?: () => void }).preload;
    const init = (scene as unknown as { init?: (payload: unknown) => void }).init;
    const create = (scene as unknown as { create?: () => void }).create;
    if (init) init.call(scene, data);
    if (preload) preload.call(scene);
    if (scene.load.totalToLoad > 0) scene.load.start();
    if (create) create.call(scene);
    presentWechat(scene);
    return scene;
  }

  active(): RuntimeScene | null {
    return this.current;
  }
}

export const sceneExports = {
  GeomRectangle,
  AnimDef: null as unknown as AnimDef,
};

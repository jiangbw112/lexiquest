import { SpritePlayback, AnimationManager, type AnimDef } from "./anims";
import { GameGraphics } from "./graphics";
import { GeomRectangle } from "./hit";
import { NineSlice, type SliceInsets } from "./nineslice";
import { GameNode, orderByDepth } from "./node";
import { GameText, type TextStyle } from "./text";
import { TweenManager } from "./tween";

type Listener = (...args: unknown[]) => void;

class Emitter {
  private readonly map = new Map<string, Set<Listener>>();
  on(event: string, fn: Listener): this {
    const set = this.map.get(event) ?? new Set();
    set.add(fn);
    this.map.set(event, set);
    return this;
  }
  once(event: string, fn: Listener): this {
    const wrapped: Listener = (...args) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }
  off(event: string, fn?: Listener): this {
    const set = this.map.get(event);
    if (!set) return this;
    if (!fn) set.clear();
    else set.delete(fn);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of [...(this.map.get(event) ?? [])]) fn(...args);
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
  isLoadingFlag = false;
  get totalToLoad(): number {
    return this.queue.length;
  }
  isLoading(): boolean {
    return this.isLoadingFlag;
  }
  atlas(key: string, image: string, data: string): this {
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
        if (!text) scene.game.failures.push(`asset text missing: ${file.urls.join(" ")}`);
        else {
          try {
            scene.textures.add(file.key, JSON.parse(text), file.urls[0] ?? "");
          } catch (error) {
            scene.game.failures.push(`asset json failed: ${file.key} ${error instanceof Error ? error.message : ""}`);
          }
        }
      } else {
        scene.textures.add(file.key, null, file.urls[0]);
        scene.game.failures.push(`image pixels not decoded: ${file.key}`);
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

class TextureStore {
  private readonly items = new Map<string, { key: string; data: unknown; image: string }>();
  exists(key: string): boolean {
    return this.items.has(key);
  }
  get(key: string): { key: string; data: unknown; image: string; missing: boolean; getFrameNames: () => string[] } {
    const item = this.items.get(key);
    const data = item?.data;
    const frames = data && typeof data === "object" && "frames" in data ? Object.keys((data as { frames: object }).frames) : [];
    return {
      key,
      data: data ?? null,
      image: item?.image ?? "",
      missing: !item,
      getFrameNames: () => frames,
    };
  }
  add(key: string, data: unknown, image: string): void {
    this.items.set(key, { key, data, image });
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
  }
  add(...node: Array<GameNode | GameNode[]>): this {
    const nodes = node.flat();
    for (const child of nodes) {
      child.parent = this;
      this.list.push(child);
    }
    return this;
  }
  setMask(mask: unknown): this {
    this.data.set("mask", mask);
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
    this.width = width;
    this.height = height;
    if (typeof fill === "number") this.fillColor = fill;
  }
  setFillStyle(color: number): this {
    this.fillColor = color;
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
  readonly input: { keyboard: Keyboard; cursor: null; on: Keyboard["on"]; off: Keyboard["off"]; once: Keyboard["once"]; activePointer: { x: number; y: number } };
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
    this.input = {
      keyboard,
      cursor: null,
      on: keyboard.on.bind(keyboard),
      off: keyboard.off.bind(keyboard),
      once: keyboard.once.bind(keyboard),
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
      container: (x = 0, y = 0) => addNode(new ContainerNode(this, x, y)),
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
      stop: () => this.shutdown(),
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

/**
 * Enough of a DOM for Phaser.HEADLESS to boot in Vitest.
 * The canvas context is a stub. Frame geometry still comes from the atlas JSON.
 */
export function installPhaserDom(): void {
  const host = globalThis as unknown as { document?: unknown; window?: unknown; HTMLElement?: unknown; HTMLCanvasElement?: unknown };
  if (host.document) return;

  const listeners = new Map<string, Array<(event?: unknown) => void>>();
  const on = (type: string, fn: (event?: unknown) => void) => {
    const list = listeners.get(type) ?? [];
    list.push(fn);
    listeners.set(type, list);
  };
  const element = (tag: string) => {
    const el: {
      tagName: string;
      style: Record<string, string>;
      width: number;
      height: number;
      childNodes: unknown[];
      appendChild: (child: unknown) => unknown;
      removeChild: (child: unknown) => unknown;
      addEventListener: typeof on;
      removeEventListener: () => void;
      setAttribute: () => void;
      getAttribute: () => null;
      getContext: () => {
        fillRect: () => void;
        drawImage: () => void;
        putImageData: () => void;
        createImageData: (w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number };
        getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray; width: number; height: number };
        save: () => void;
        restore: () => void;
        translate: () => void;
        scale: () => void;
        clearRect: () => void;
        canvas: unknown;
      };
      getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
    } = {
      tagName: tag.toUpperCase(),
      style: {},
      width: 1,
      height: 1,
      childNodes: [],
      appendChild(child) {
        this.childNodes.push(child);
        return child;
      },
      removeChild(child) {
        return child;
      },
      addEventListener: on,
      removeEventListener() {},
      setAttribute() {},
      getAttribute() {
        return null;
      },
      getContext() {
        return {
          fillRect() {},
          drawImage() {},
          putImageData() {},
          createImageData(w: number, h: number) {
            return { data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h };
          },
          getImageData(_x: number, _y: number, w: number, h: number) {
            return { data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4), width: w, height: h };
          },
          save() {},
          restore() {},
          translate() {},
          scale() {},
          clearRect() {},
          canvas: el,
        };
      },
      getBoundingClientRect() {
        return { left: 0, top: 0, width: this.width, height: this.height };
      },
    };
    return el;
  };

  const document = {
    readyState: "complete",
    hidden: false,
    documentElement: element("html"),
    body: element("body"),
    createElement: element,
    addEventListener: on,
    removeEventListener() {},
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    },
  };
  const window = {
    document,
    navigator: globalThis.navigator,
    devicePixelRatio: 1,
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: on,
    removeEventListener() {},
    focus() {},
    performance: { now: () => Date.now() },
    CanvasRenderingContext2D: class CanvasRenderingContext2D {},
    requestAnimationFrame(fn: (time: number) => void) {
      return setTimeout(() => fn(Date.now()), 16);
    },
    cancelAnimationFrame(id: ReturnType<typeof setTimeout>) {
      clearTimeout(id);
    },
    getComputedStyle() {
      return { getPropertyValue: () => "" };
    },
  };
  const screen = {
    width: 1280,
    height: 800,
    orientation: {
      addEventListener() {},
      removeEventListener() {},
    },
  };
  const globalHost = globalThis as unknown as Record<string, unknown>;
  const windowRecord = window as unknown as Record<string, unknown>;
  windowRecord.window = window;
  windowRecord.screen = screen;
  globalHost.window = window;
  globalHost.document = document;
  globalHost.screen = screen;
  host.HTMLElement = class HTMLElement {};
  host.HTMLCanvasElement = class HTMLCanvasElement {};
  (globalThis as unknown as { Image: new () => { width: number; height: number; onload?: () => void; src: string } }).Image = class Image {
    width = 1;
    height = 1;
    onload?: () => void;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  };
}

installPhaserDom();

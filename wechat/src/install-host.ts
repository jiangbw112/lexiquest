import { installMemoryStorage, installSessionStorage } from "../platform/storage";
import { installRandomPolyfill } from "../platform/random";
import { pbkdf2Hex } from "../platform/pbkdf2";

/**
 * 原来：浏览器自带 localStorage、document、crypto.subtle。
 * 现在：缺哪一项就补哪一项。已有的 crypto.subtle 保留，不替换。
 * 为什么：domain 在模块加载后立刻可能读存储。这一文件必须是 entry-game 的第一条 import。
 */
const root = globalThis as {
  localStorage?: { getItem?: (key: string) => string | null };
  document?: { getElementById?: (id: string) => unknown; documentElement?: { dataset: Record<string, string> } };
  crypto?: { subtle?: { importKey: (...args: unknown[]) => Promise<unknown>; deriveBits: (...args: unknown[]) => Promise<ArrayBuffer> } };
  HTMLInputElement?: unknown;
};

function storageWorks(): boolean {
  try {
    return Boolean(root.localStorage && typeof root.localStorage.getItem === "function");
  } catch {
    return false;
  }
}

if (!storageWorks()) installMemoryStorage();
installSessionStorage();
installRandomPolyfill();

if (!root.crypto?.subtle) {
  const cryptoRef = (root.crypto ?? {}) as { subtle?: unknown; getRandomValues?: (bytes: Uint8Array) => Uint8Array };
  cryptoRef.subtle = {
    async importKey(_format: string, keyData: BufferSource) {
      const bytes = keyData instanceof ArrayBuffer ? new Uint8Array(keyData) : new Uint8Array(keyData.buffer, keyData.byteOffset, keyData.byteLength);
      return { raw: bytes.slice() };
    },
    async deriveBits(algorithm: { salt: Uint8Array; iterations: number }, key: { raw: Uint8Array }) {
      const pin = new TextDecoder().decode(key.raw);
      const hex = pbkdf2Hex(pin, algorithm.salt, algorithm.iterations);
      const out = new Uint8Array(hex.length / 2);
      for (let index = 0; index < out.length; index += 1) out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
      return out.buffer;
    },
  };
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: cryptoRef });
}

if (typeof (globalThis as { window?: unknown }).window === "undefined") {
  Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
}
const hostWindow = globalThis as { addEventListener?: unknown; removeEventListener?: unknown };
if (typeof hostWindow.addEventListener !== "function") {
  hostWindow.addEventListener = () => undefined;
  hostWindow.removeEventListener = () => undefined;
}
if (typeof (globalThis as { location?: { search?: string } }).location === "undefined") {
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: { protocol: "https:", search: "", href: "https://local/", host: "local" },
  });
}

class HostElement {
  id = "";
  value = "";
  textContent = "";
  className = "";
  placeholder = "";
  disabled = false;
  files: File[] | null = null;
  offsetHeight = 0;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  private classes = new Set<string>();
  classList = {
    add: (name: string) => {
      this.classes.add(name);
    },
    remove: (name: string) => {
      this.classes.delete(name);
    },
    contains: (name: string) => this.classes.has(name),
  };
  focus(): void {
    const host = (globalThis as { __LEXI_NATIVE_INPUT__?: (id: string) => void }).__LEXI_NATIVE_INPUT__;
    host?.(this.id);
  }
  click(): void {
    this.focus();
  }
  append(...parts: unknown[]): void {
    this.textContent += parts.map((part) => (typeof part === "string" ? part : "")).join("");
  }
  replaceChildren(): void {
    this.textContent = "";
  }
  addEventListener(): void {
    return undefined;
  }
  removeEventListener(): void {
    return undefined;
  }
}

const hostGlobal = globalThis as {
  HTMLInputElement?: unknown;
  HTMLFormElement?: unknown;
  HTMLButtonElement?: unknown;
  HTMLTextAreaElement?: unknown;
  Element?: unknown;
};
if (typeof hostGlobal.HTMLInputElement === "undefined") hostGlobal.HTMLInputElement = HostElement;
if (typeof hostGlobal.HTMLFormElement === "undefined") hostGlobal.HTMLFormElement = class HostForm extends HostElement {};
if (typeof hostGlobal.HTMLButtonElement === "undefined") hostGlobal.HTMLButtonElement = class HostButton extends HostElement {};
if (typeof hostGlobal.HTMLTextAreaElement === "undefined") hostGlobal.HTMLTextAreaElement = class HostArea extends HostElement {};
if (typeof hostGlobal.Element === "undefined") hostGlobal.Element = HostElement;

export function derivePinHex(pin: string, salt: Uint8Array, iterations: number): string {
  return pbkdf2Hex(pin, salt, iterations);
}

if (typeof root.document === "undefined") {
  const nodes = new Map<string, { id: string; value: string; textContent: string; classList: { add: (name: string) => void; remove: (name: string) => void; contains: (name: string) => boolean }; focus: () => void }>();
  class Field {
    id = "";
    value = "";
    textContent = "";
    className = "";
    dataset: Record<string, string> = {};
    private classes = new Set<string>();
    classList = {
      add: (name: string) => {
        this.classes.add(name);
      },
      remove: (name: string) => {
        this.classes.delete(name);
      },
      toggle: (name: string, force?: boolean) => {
        const next = force ?? !this.classes.has(name);
        if (next) this.classes.add(name);
        else this.classes.delete(name);
        return next;
      },
      contains: (name: string) => this.classes.has(name),
    };
    private listeners = new Map<string, Set<(event: { type: string; preventDefault: () => void; stopPropagation: () => void; target: Field }) => void>>();
    addEventListener(type: string, fn: (event: { type: string; preventDefault: () => void; stopPropagation: () => void; target: Field }) => void): void {
      const set = this.listeners.get(type) ?? new Set();
      set.add(fn);
      this.listeners.set(type, set);
    }
    removeEventListener(type: string, fn: (event: { type: string; preventDefault: () => void; stopPropagation: () => void; target: Field }) => void): void {
      this.listeners.get(type)?.delete(fn);
    }
    dispatch(type: string): void {
      const event = { type, preventDefault: () => undefined, stopPropagation: () => undefined, target: this };
      for (const fn of [...(this.listeners.get(type) ?? [])]) fn(event);
    }
    focus(): void {
      const host = (globalThis as { __LEXI_NATIVE_INPUT__?: (id: string) => void }).__LEXI_NATIVE_INPUT__;
      host?.(this.id);
    }
    append(...parts: unknown[]): void {
      this.textContent += parts.map((part) => (typeof part === "string" ? part : "")).join("");
    }
    replaceChildren(): void {
      this.textContent = "";
    }
  }
  root.HTMLInputElement = Field;
  root.document = {
    documentElement: { dataset: {} },
    getElementById(id: string) {
      return nodes.get(id) ?? null;
    },
    createElement() {
      return new Field();
    },
    addEventListener() {
      return undefined;
    },
    hidden: false,
  } as unknown as typeof root.document;
  (root.document as { adopt?: (id: string, node: Field) => void }).adopt = (id: string, node: Field) => {
    node.id = id;
    nodes.set(id, node);
  };
}

export function bindField(id: string): { value: string; dispatch?: (type: string) => void } {
  const doc = root.document as { getElementById?: (id: string) => { value: string; dispatch?: (type: string) => void } | null; adopt?: (id: string, node: object) => void; createElement?: () => { id: string; value: string } };
  const existing = doc.getElementById?.(id);
  if (existing) return existing;
  const node = doc.createElement ? doc.createElement() : { id, value: "" };
  node.id = id;
  doc.adopt?.(id, node);
  return node;
}

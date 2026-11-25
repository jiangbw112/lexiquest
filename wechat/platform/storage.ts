/**
 * 原来：src/domain/storage.ts 直接用 localStorage，键是 lexiquest.save.v1。
 * 现在：提供同一套 getItem/setItem/removeItem。有 wx 时走同步存储，值仍是 JSON 字符串。
 * 为什么：domain 不能改。单 key 1MB、总量 10MB 来自微信开放文档 wx.setStorageSync 页，不是任务文里的猜测。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html
 */

export const STORAGE_KEY_LIMIT = 1024 * 1024;
export const STORAGE_TOTAL_LIMIT = 10 * 1024 * 1024;

export class StorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageLimitError";
  }
}

export function utf8Size(value: string): number {
  return new TextEncoder().encode(value).length;
}

type Memory = Map<string, string>;

export function createMemoryArea(): Memory {
  return new Map();
}

export function writeLimited(area: Memory, key: string, value: string): void {
  const next = utf8Size(value);
  if (next > STORAGE_KEY_LIMIT) throw new StorageLimitError(`storage key over 1MB: ${key}`);
  let total = next;
  for (const [name, current] of area) {
    if (name === key) continue;
    total += utf8Size(current);
  }
  if (total > STORAGE_TOTAL_LIMIT) throw new StorageLimitError("storage total over 10MB");
  area.set(key, value);
}

export function installMemoryStorage(area = createMemoryArea()): Memory {
  const storage = {
    getItem: (key: string) => (area.has(key) ? area.get(key)! : null),
    setItem: (key: string, value: string) => {
      writeLimited(area, key, String(value));
    },
    removeItem: (key: string) => {
      area.delete(key);
    },
    clear: () => {
      area.clear();
    },
    key: (index: number) => [...area.keys()][index] ?? null,
    get length() {
      return area.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  return area;
}

type WxStorage = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => void;
  removeStorageSync: (key: string) => void;
  getStorageInfoSync?: () => { currentSize?: number; keys?: string[] };
};

export function installWxStorage(wx: WxStorage): void {
  const storage = {
    getItem(key: string) {
      const value = wx.getStorageSync(key);
      if (value === "" || value === undefined || value === null) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    },
    setItem(key: string, value: string) {
      const text = String(value);
      if (utf8Size(text) > STORAGE_KEY_LIMIT) throw new StorageLimitError(`storage key over 1MB: ${key}`);
      wx.setStorageSync(key, text);
    },
    removeItem(key: string) {
      wx.removeStorageSync(key);
    },
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
}

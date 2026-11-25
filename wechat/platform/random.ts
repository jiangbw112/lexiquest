/**
 * 原来：profiles.ts / titles.ts 调 crypto.randomUUID()，parent-pin.ts 调 crypto.getRandomValues()。
 * 现在：同步接口优先用已有的 crypto.getRandomValues。微信官方的 wx.getRandomValues 是回调式的
 * （基础库 2.15.0，https://developers.weixin.qq.com/miniprogram/dev/api/device/crypto/wx.getRandomValues.html），
 * 不能在同步的 randomUUID 里现等。池子由 primeWxRandom 事先灌入。池子空时抛错，不改用 Math.random。
 * 为什么：用 Math.random 生成 PIN 盐或档位 id 是弱随机。弱随机只留在 weakRandomUuid，默认不安装。
 */

let pool = new Uint8Array(0);
let poolAt = 0;
let nativeGet: ((bytes: Uint8Array) => Uint8Array) | null = null;

export function takeRandomBytes(length: number): Uint8Array {
  if (nativeGet) {
    const bytes = new Uint8Array(length);
    nativeGet(bytes);
    return bytes;
  }
  if (poolAt + length <= pool.length) {
    const bytes = pool.slice(poolAt, poolAt + length);
    poolAt += length;
    return bytes;
  }
  throw new Error("no CSPRNG: wx.getRandomValues is async and the pool is empty");
}

export function uuidV4FromBytes(bytes: Uint8Array): string {
  const copy = new Uint8Array(bytes);
  copy[6] = (copy[6] & 0x0f) | 0x40;
  copy[8] = (copy[8] & 0x3f) | 0x80;
  const hex = [...copy].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function randomUuid(): string {
  return uuidV4FromBytes(takeRandomBytes(16));
}

/** Explicit weak generator. Not installed as crypto.randomUUID. */
export function weakRandomUuid(): string {
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return uuidV4FromBytes(bytes);
}

type WxRandom = {
  getRandomValues: (options: {
    length: number;
    success?: (res: { randomValues: ArrayBuffer }) => void;
    fail?: (err: unknown) => void;
  }) => void;
};

export function primeWxRandom(wx: WxRandom, length = 256): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.getRandomValues({
      length,
      success: (res) => {
        pool = new Uint8Array(res.randomValues);
        poolAt = 0;
        resolve();
      },
      fail: reject,
    });
  });
}

export function installRandomPolyfill(): void {
  const current = globalThis.crypto;
  if (current && typeof current.getRandomValues === "function" && !nativeGet) {
    const bound = current.getRandomValues.bind(current);
    nativeGet = (bytes) => bound(bytes);
  }
  if (current && typeof current.randomUUID === "function" && typeof current.getRandomValues === "function") return;
  const next = {
    getRandomValues: (bytes: Uint8Array) => {
      bytes.set(takeRandomBytes(bytes.length));
      return bytes;
    },
    randomUUID: () => randomUuid(),
  };
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: next });
}

export function poolRemaining(): number {
  return pool.length - poolAt;
}

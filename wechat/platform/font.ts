/**
 * 原来：任务文写 wx.loadFont，并且说 woff2 不能用。
 * 现在：官方文档的接口是 wx.loadFontFace。source 必须是 https 或 data URL。建议 TTF/WOFF，低版本 iOS 对 WOFF2 不兼容。
 * 为什么：仓库里是 woff2 子集，没有现成 ttf。本文件不转换字体，也不假装已经 loadFontFace 成功。
 * 文档：https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html
 */

export interface FontLoadResult {
  ok: boolean;
  family: string;
  reason: string;
}

export interface PackedFace {
  family: string;
  file: string;
  weight: string;
}

export const PACKED_FACES: readonly PackedFace[] = [
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Regular-core.ttf", weight: "400" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Bold-core.ttf", weight: "700" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Regular-g3.ttf", weight: "400" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Bold-g3.ttf", weight: "700" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Regular-g4.ttf", weight: "400" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Bold-g4.ttf", weight: "700" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Regular-g5.ttf", weight: "400" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Bold-g5.ttf", weight: "700" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Regular-g6.ttf", weight: "400" },
  { family: "Noto Sans SC", file: "packages/fonts/NotoSansSC-Bold-g6.ttf", weight: "700" },
  { family: "Nunito", file: "packages/fonts/Nunito-latin.ttf", weight: "400" },
  { family: "ZCOOL KuaiLe", file: "packages/fonts/ZCOOLKuaiLe-ui.ttf", weight: "400" },
];

const calls: FontLoadResult[] = [];

export function fontCalls(): readonly FontLoadResult[] {
  return calls;
}

export function loadFace(family: string, source: string, extra: { weight?: string; global?: boolean; scopes?: string[] } = {}): Promise<FontLoadResult> {
  const wx = (globalThis as { wx?: { loadFontFace?: (options: { family: string; source: string; global?: boolean; scopes?: string[]; desc?: { weight?: string }; success?: () => void; fail?: (err: { errMsg?: string }) => void }) => void } }).wx;
  if (!wx?.loadFontFace) {
    const result = { ok: false, family, reason: "wx.loadFontFace is not available in this runtime. Official source is an https URL, or a Data URL from base library 3.7.9. No cloud URL was created." };
    calls.push(result);
    return Promise.resolve(result);
  }
  if (!source.startsWith("url(") && !source.startsWith("data:") && !source.startsWith("https://")) {
    const result = { ok: false, family, reason: "font source is not an https or data URL" };
    calls.push(result);
    return Promise.resolve(result);
  }
  return new Promise((resolve) => {
    wx.loadFontFace?.({
      family,
      global: extra.global ?? true,
      scopes: extra.scopes ?? ["webview", "native"],
      desc: extra.weight ? { weight: extra.weight } : undefined,
      source: source.startsWith("url(") || source.startsWith("data:") ? source : `url("${source}")`,
      success: () => {
        const result = { ok: true, family, reason: "" };
        calls.push(result);
        resolve(result);
      },
      fail: (err) => {
        const result = { ok: false, family, reason: err?.errMsg || "loadFontFace failed" };
        calls.push(result);
        resolve(result);
      },
    });
  });
}

async function dataUrlFor(file: string): Promise<string | null> {
  const wx = (globalThis as { wx?: { getFileSystemManager?: () => { readFile: (options: { filePath: string; encoding: string; success?: (res: { data: string }) => void; fail?: () => void }) => void } } }).wx;
  const reader = wx?.getFileSystemManager;
  if (!reader) return null;
  return new Promise((resolve) => {
    reader().readFile({
      filePath: file,
      encoding: "base64",
      success: (res) => resolve(`url("data:font/ttf;base64,${res.data}")`),
      fail: () => resolve(null),
    });
  });
}

export async function loadPackedFonts(): Promise<FontLoadResult[]> {
  const results: FontLoadResult[] = [];
  for (const face of PACKED_FACES) {
    const source = await dataUrlFor(face.file);
    if (!source) {
      const result = await loadFace(face.family, "missing");
      results.push(result.reason.includes("not an https") ? { ...result, reason: `${face.file} is packed. wx.getFileSystemManager is absent, so it was not turned into a Data URL. Official loadFontFace source is https or, from base library 3.7.9, a Data URL.` } : result);
      calls[calls.length - 1] = results[results.length - 1];
      continue;
    }
    results.push(await loadFace(face.family, source, { weight: face.weight, global: true, scopes: ["webview", "native"] }));
  }
  return results;
}

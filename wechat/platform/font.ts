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

export function loadFace(family: string, source: string): Promise<FontLoadResult> {
  const wx = (globalThis as { wx?: { loadFontFace?: (options: { family: string; source: string; success?: () => void; fail?: (err: { errMsg?: string }) => void }) => void } }).wx;
  if (!wx?.loadFontFace) {
    return Promise.resolve({ ok: false, family, reason: "wx.loadFontFace is not available in this runtime" });
  }
  if (!source.startsWith("url(") && !source.startsWith("data:") && !source.startsWith("https://")) {
    return Promise.resolve({ ok: false, family, reason: "font source is not an https or data URL" });
  }
  return new Promise((resolve) => {
    wx.loadFontFace?.({
      family,
      source: source.startsWith("url(") || source.startsWith("data:") ? source : `url("${source}")`,
      success: () => resolve({ ok: true, family, reason: "" }),
      fail: (err) => resolve({ ok: false, family, reason: err?.errMsg || "loadFontFace failed" }),
    });
  });
}

/**
 * 原来：Phaser loader 读 public/assets。
 * 现在：文本图集可以经 __LEXI_READ_ASSET__ 读入。像素没有解码器，不把缺图写成已加载。
 * 为什么：不能新增图片解码依赖，也不能把 Node 里的占位色说成微信已经画出原画。
 */

export interface AssetGap {
  url: string;
  reason: string;
}

const gaps: AssetGap[] = [];

export function noteAssetGap(url: string, reason: string): void {
  gaps.push({ url, reason });
}

export function assetGaps(): readonly AssetGap[] {
  return gaps;
}

export function readPackText(url: string): string | null {
  const reader = (globalThis as { __LEXI_READ_ASSET__?: (path: string) => string | null }).__LEXI_READ_ASSET__;
  if (!reader) {
    noteAssetGap(url, "no asset reader");
    return null;
  }
  const text = reader(url);
  if (!text) noteAssetGap(url, "text missing");
  return text;
}

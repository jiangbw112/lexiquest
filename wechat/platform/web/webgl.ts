export const WEBGL_REQUIRED_MESSAGE =
  "这台电脑没有可用的 WebGL。请用打开了硬件加速的桌面版 Chrome、Edge 或 Safari。";

/**
 * 原来：src/game/webgl.ts 用 document 创建 webgl 上下文，没有就停在提示页。
 * 现在：有 webgl 就用它。没有 webgl 但有 2d 画布或 wx 时也返回 true。
 * 为什么：小程序画布是 type=2d。场景文件不改，不能因为缺少 WebGL 把整棵场景树挡在外面。
 */
export function webglAvailable(): boolean {
  const wx = (globalThis as { wx?: unknown }).wx;
  if (wx) return true;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas as HTMLCanvasElement).getContext?.("webgl2") || (canvas as HTMLCanvasElement).getContext?.("webgl");
    if (gl) return true;
    return Boolean((canvas as HTMLCanvasElement).getContext?.("2d"));
  } catch {
    return false;
  }
}

export const WEBGL_REQUIRED_MESSAGE =
  "这台电脑没有可用的 WebGL。请用打开了硬件加速的桌面版 Chrome、Edge 或 Safari。";

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

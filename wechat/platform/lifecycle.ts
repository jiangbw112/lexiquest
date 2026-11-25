/**
 * 原来：网页听 document.visibilitychange 和 window.resize。
 * 现在：记下 onHide / onShow / onWindowResize 的对应关系。有 wx 时才真正注册。
 * 为什么：云端没有小程序运行时。不注册就不能说前后台已经在微信里测过。
 */

export function bindLifecycle(handlers: { onHide: () => void; onShow: () => void; onResize: () => void }): { bound: boolean; reason: string } {
  const wx = (globalThis as { wx?: { onAppHide?: (fn: () => void) => void; onAppShow?: (fn: () => void) => void; onWindowResize?: (fn: () => void) => void } }).wx;
  if (!wx?.onAppHide || !wx.onAppShow || !wx.onWindowResize) {
    return { bound: false, reason: "wx lifecycle APIs are not available" };
  }
  wx.onAppHide(handlers.onHide);
  wx.onAppShow(handlers.onShow);
  wx.onWindowResize(handlers.onResize);
  return { bound: true, reason: "" };
}

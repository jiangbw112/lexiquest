App({
  // 原来：启动时不加载资源分包。
  // 现在：wx.loadSubpackage 预拉图集和字体分包。失败写进全局，游戏页状态带能读到。
  // 为什么：主包放代码，像素和 TTF 放分包。没有 wx 的运行时不会假装已经下载。
  onLaunch() {
    const host = typeof wx === "undefined" ? null : wx;
    if (!host || typeof host.loadSubpackage !== "function") return;
    for (const name of ["art-ui", "art-world", "fonts"]) {
      host.loadSubpackage({
        name,
        fail(err) {
          const reason = `subpackage ${name} failed: ${err && err.errMsg ? err.errMsg : "loadSubpackage failed"}`;
          const bag = globalThis.__LEXI_SUBPACKAGE__ || (globalThis.__LEXI_SUBPACKAGE__ = []);
          bag.push(reason);
        },
      });
    }
  },
});

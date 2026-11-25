import path from "node:path";

/**
 * 原来：场景用相对路径 import src/game 里的 shell-dom、audio、webgl、pin-error。
 * 现在：解析到绝对路径后，把这四个文件指到 wechat/platform/web。
 * 为什么：不能改场景源码，也不能改根 package。多入口不能开 inlineDynamicImports。
 */
export function aliasPlatform(root) {
  const map = new Map([
    [path.join(root, "src/game/shell-dom.ts"), path.join(root, "wechat/platform/web/shell-dom.ts")],
    [path.join(root, "src/game/audio.ts"), path.join(root, "wechat/platform/web/audio.ts")],
    [path.join(root, "src/game/webgl.ts"), path.join(root, "wechat/platform/web/webgl.ts")],
    [path.join(root, "src/game/pin-error.ts"), path.join(root, "wechat/platform/web/pin-error.ts")],
    [path.join(root, "src/domain/host-copy.ts"), path.join(root, "wechat/platform/host-copy.ts")],
    [path.join(root, "src/domain/speech.ts"), path.join(root, "wechat/platform/speech.ts")],
  ]);
  return {
    name: "alias-platform",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || source.startsWith("\0")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved || resolved.external) return null;
      const id = resolved.id.split("?")[0];
      return map.get(id) ?? null;
    },
  };
}

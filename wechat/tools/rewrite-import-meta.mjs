import path from "node:path";

/**
 * 原来：chapter-plan.ts 用 import.meta.url 再 fetch JSON。CJS 构建会把 import.meta 换成 {}，并打出 EMPTY_IMPORT_META。
 * 现在：只在 wechat 的构建转换里把这个文件的 import.meta.url 换成固定字符串。入口仍然先 installChapterPlan。
 * 为什么：不能改 src/domain/chapter-plan.ts。catalog.ts 的 import.meta.glob 仍交给 Vite，这里不碰它。
 */
export function rewriteImportMeta() {
  const marker = path.join("src", "domain", "chapter-plan.ts");
  return {
    name: "wechat-rewrite-import-meta",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0];
      if (!file.endsWith(marker) || !code.includes("import.meta")) return null;
      return { code: code.replaceAll("import.meta.url", JSON.stringify("wechat-inline-chapter-plan")), map: null };
    },
  };
}

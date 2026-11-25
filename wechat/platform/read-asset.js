/**
 * 原来：__LEXI_READ_ASSET__ 只查主包里的 warm JSON，班级和章节文本因此缺失。
 * 现在：先查主包文本，再按 art-json-index 读分包里的原文件。微信用 FileSystemManager.readFileSync，Node 证据用 __LEXI_READ_FILE__。
 * 为什么：主包不能 require 分包。读的是已经复制进来的 JSON，不是新的 https 或 cloud 地址。没有 wx、也没有宿主读文件时，仍返回 null。
 */

const atlasText = require("../assets/atlas-json/index.js");
const packedJson = require("../packages/art-json-index.js");

function readPackedFile(rel) {
  const host = typeof wx === "undefined" ? null : wx;
  if (host && typeof host.getFileSystemManager === "function") {
    try {
      const text = host.getFileSystemManager().readFileSync(rel, "utf8");
      return typeof text === "string" ? text : null;
    } catch (error) {
      return null;
    }
  }
  const read = globalThis.__LEXI_READ_FILE__;
  if (typeof read === "function") {
    const text = read(rel);
    return typeof text === "string" ? text : null;
  }
  return null;
}

function readAsset(url) {
  if (url && Object.prototype.hasOwnProperty.call(atlasText, url)) return atlasText[url];
  const rel = url && packedJson[url];
  if (!rel) return null;
  return readPackedFile(rel);
}

module.exports = { readAsset, packedJson };

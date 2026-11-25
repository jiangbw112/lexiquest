/**
 * P0.6 probe renderer for the debug entry only.
 *
 * 原来：三种探针（title / grade / battle）只有 Node 里的 layoutProbe 数字和仓库外的 PNG，
 *       页面从不绘制它们。P0.md 也写明 "not drawn by the page"。
 * 现在：同一个 layout.js 的 layoutProbe 结果画到页面 canvas 上，用逻辑像素，不接图集、不接引擎。
 * 为什么：验证字号、换行、热区必须在真实画布上量，Node 只能证明数字自洽。
 *
 * 入口：pages/game/index?p06=title|grade|battle（devtools 编译模式的自定义 query 也能带）。
 * 限制：这里 draw 的是探针数据，不是正式场景。它不参与发布路径，release 下也不会被打开，
 *       因为只有显式 query 才进入。未在 DevTools / 真机验证。
 */

const { layoutProbe, auditProbe } = require("./layout.js");

const PROBE_FRAMES = ["title", "grade", "battle"];
const FONT = "sans-serif";

function isProbeFrame(value) {
  return typeof value === "string" && PROBE_FRAMES.indexOf(value) >= 0;
}

function fillText(ctx, text, x, y, fontPx, color, bold) {
  ctx.font = (bold ? "bold " : "") + fontPx + "px " + FONT;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/**
 * @returns {string[]} auditProbe 的问题列表，空数组表示通过
 */
function drawProbe(ctx, frame, viewW, viewH, safe, dpr) {
  const probe = layoutProbe(frame, viewW, viewH, safe);
  if (!probe) return ["no layout"];

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textBaseline = "top";

  probe.texts.forEach((text) => {
    text.lines.forEach((line, index) => {
      fillText(ctx, line, text.x, text.y + index * text.lineH, text.fontPx, "#17352a", false);
    });
  });

  probe.hits.forEach((hit) => {
    ctx.strokeStyle = "#c4533a";
    ctx.lineWidth = 2;
    ctx.strokeRect(hit.x + 1, hit.y + 1, hit.w - 2, hit.h - 2);
    ctx.font = "bold " + hit.fontPx + "px " + FONT;
    const width = ctx.measureText(hit.label).width;
    fillText(
      ctx,
      hit.label,
      hit.x + (hit.w - width) / 2,
      hit.y + (hit.h - hit.fontPx * 1.35) / 2,
      hit.fontPx,
      "#8c3a28",
      true,
    );
  });

  (probe.shapes || []).forEach((shape) => {
    ctx.fillStyle = "#c4533a";
    ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
  });

  // 内容框虚线，便于看是否压到安全区。
  ctx.strokeStyle = "#1f7a4d";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1;
  ctx.strokeRect(probe.content.x + 0.5, probe.content.y + 0.5, probe.content.w - 1, probe.content.h - 1);
  ctx.setLineDash([]);

  return auditProbe(probe);
}

module.exports = {
  PROBE_FRAMES,
  isProbeFrame,
  drawProbe,
};

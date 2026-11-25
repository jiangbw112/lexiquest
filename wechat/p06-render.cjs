/**
 * Node layout probe for the three P0.6 frames.
 * This is not a mini program, not WeChat DevTools, and not a runtime screenshot.
 * It is excluded from the mini program package.
 *
 * Usage: node wechat/p06-render.cjs /opt/cursor/artifacts/p06-spec.json
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = __dirname;
const filename = path.join(root, "pages/game/layout.js");
const code = fs.readFileSync(filename, "utf8");
const sandbox = {
  module: { exports: {} },
  exports: {},
  console,
  Math,
  Number,
  String,
};
vm.runInNewContext(code, sandbox, { filename });
const api = sandbox.module.exports;

const views = [
  { w: 844, h: 390, name: "844x390" },
  { w: 667, h: 375, name: "667x375" },
  { w: 1180, h: 820, name: "1180x820" },
  { w: 390, h: 844, name: "390x844" },
];
const frames = ["title", "grade", "battle"];

const spec = {
  kind: "p06-layout-probe",
  runtime: false,
  note: "Pure layout numbers from wechat/pages/game/layout.js. Not a DevTools screenshot and not a device capture.",
  exampleNote: "例句：今天的空气很新鲜。 is a short line written for this probe. The word catalog has no example-sentence field.",
  copy: api.PROBE_COPY,
  frames: [],
};

for (const view of views) {
  for (const frame of frames) {
    const probe = api.layoutProbe(frame, view.w, view.h, null);
    const problems = api.auditProbe(probe);
    if (problems.length) {
      console.error(`${frame} ${view.name}: ${problems.join("; ")}`);
      process.exit(1);
    }
    spec.frames.push({
      file: `p06-${view.name}-${frame}.png`,
      viewport: view.name,
      w: view.w,
      h: view.h,
      frame,
      portrait: probe.portrait,
      content: probe.content,
      world: probe.world,
      texts: probe.texts,
      hits: probe.hits,
      shapes: probe.shapes,
    });
  }
}

const out = process.argv[2];
const body = JSON.stringify(spec, null, 2);
if (out) fs.writeFileSync(out, body);
else process.stdout.write(body);
console.error(`p06-render: wrote ${spec.frames.length} frames`);

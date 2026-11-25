const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
};
const { createSave, loadSave, writeSave, SAVE_KEY } = require("../lib/domain.cjs.js");
const assert = require("assert");
const save = createSave({
  name: "学习者",
  classId: "warrior",
  appearance: {
    skinId: "peach",
    hairStyle: "bob",
    hairColorId: "brown",
    eyeStyle: "bright",
    clothColorId: "fern",
    glasses: false,
    freckles: false,
  },
  now: Date.parse("2026-03-01T00:00:00Z"),
  grades: ["G3"],
});
assert.strictEqual(writeSave(save), true);
const loaded = loadSave();
assert.ok(loaded);
assert.strictEqual(loaded.player.name, "学习者");
assert.strictEqual(loaded.xp, 0);
const raw = localStorage.getItem(SAVE_KEY);
assert.ok(raw && raw.includes("学习者"));
console.log("check-save: createSave writeSave loadSave roundtrip");
console.log("source: Node localStorage polyfill or host localStorage. Not wx storage and not a second process.");
process.exit(0);

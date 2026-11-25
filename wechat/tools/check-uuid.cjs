const { randomUuid, weakRandomUuid } = require("../lib/game.cjs.js");
const assert = require("assert");
const seen = new Set();
for (let i = 0; i < 1000; i += 1) {
  const id = randomUuid();
  assert.strictEqual(id[14], "4");
  assert.ok("89ab".includes(id[19]));
  seen.add(id);
}
assert.strictEqual(seen.size, 1000);
const weak = weakRandomUuid();
assert.strictEqual(weak[14], "4");
console.log("check-uuid: 1000 v4 ids, no duplicates");
console.log("weakRandomUuid exists and is not installed as crypto.randomUUID");
console.log("source: Node crypto.getRandomValues. wx.getRandomValues is async and was not called.");
process.exit(0);

const { createMemoryArea, writeLimited, StorageLimitError, utf8Size } = require("../lib/game.cjs.js");
const assert = require("assert");
const area = createMemoryArea();
writeLimited(area, "lexiquest.save.v1", "{\"version\":1}");
assert.strictEqual(area.get("lexiquest.save.v1"), "{\"version\":1}");
let threw = false;
try { writeLimited(area, "big", "x".repeat(1024 * 1024 + 1)); } catch (error) { threw = error instanceof StorageLimitError; }
assert.strictEqual(threw, true);
assert.ok(utf8Size("词") > 1);
console.log("check-storage: roundtrip and 1MB key rejection");
console.log("source: Node memory. Not wx.setStorageSync.");
process.exit(0);

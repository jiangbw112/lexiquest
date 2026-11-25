const { pbkdf2Hex } = require("../lib/game.cjs.js");
const { webcrypto } = require("crypto");

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function subtleHex(pin, salt, iterations) {
  const key = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await webcrypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return [...new Uint8Array(bits)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function main() {
  const salt = hexToBytes("00112233445566778899aabbccddeeff");
  const pin = "2468";
  for (const iterations of [1, 1000]) {
    const ours = pbkdf2Hex(pin, salt, iterations);
    const theirs = await subtleHex(pin, salt, iterations);
    if (ours !== theirs) {
      console.error(iterations, ours, theirs);
      process.exit(1);
    }
    console.log(`iterations ${iterations} match ${ours}`);
  }
  const started = Date.now();
  const full = pbkdf2Hex(pin, salt, 100000);
  const web = await subtleHex(pin, salt, 100000);
  const ms = Date.now() - started;
  if (full !== web) {
    console.error("100000 mismatch");
    process.exit(1);
  }
  console.log(`iterations 100000 match in ${ms} ms (pure JS plus one subtle call)`);
  console.log("source: Node webcrypto. Not a phone. Iterations were not reduced.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

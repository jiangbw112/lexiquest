import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const sources = JSON.parse(readFileSync(path.join(root, "tools/font-sources.json"), "utf8"));
const check = process.argv.includes("--check");
const marks = ["✓", "✔", "☑", "√"];
const maxKuaile = sources.budgets.kuaileMaxChars;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function loc(file, line) {
  return `${path.relative(root, file)}:${line}`;
}

function add(map, text, where) {
  for (const ch of Array.from(text)) {
    if (marks.includes(ch)) fail(`checkmark ${ch} U+${ch.codePointAt(0).toString(16).toUpperCase()} at ${where}`);
    const list = map.get(ch) ?? [];
    if (list.length < 6 && !list.includes(where)) list.push(where);
    map.set(ch, list);
  }
}

function filesUnder(dir, out) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(full);
  }
}

function insideUiLabel(node) {
  let current = node.parent;
  while (current) {
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === sources.kuaileCall &&
      current.expression !== node
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

const core = new Map();
const kuaile = new Map();
const meanings = [];
const tsFiles = [];
for (const dir of sources.typescript) filesUnder(path.join(root, dir), tsFiles);

for (const file of tsFiles) {
  const text = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === sources.kuaileCall
    ) {
      const where = loc(file, sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      const pieces = [];
      const collect = (child) => {
        if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) pieces.push(child.text);
        else ts.forEachChild(child, collect);
      };
      node.arguments.forEach(collect);
      for (const piece of pieces) {
        if (Array.from(piece).length > maxKuaile) fail(`KuaiLe received body copy at ${where}: ${piece.slice(0, 40)}`);
      }
    }
    const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
    const chunk = ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
    if ((literal || chunk) && node.text) {
      const where = loc(file, sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
      add(core, node.text, where);
      if (insideUiLabel(node)) add(kuaile, node.text, where);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

function takeMeanings(file, words) {
  for (const word of words) {
    if (typeof word.meaning_zh !== "string" || typeof word.grade_est !== "number") {
      fail(`${path.relative(root, file)} has a meaning without grade_est`);
    }
    meanings.push({ grade: word.grade_est, text: word.meaning_zh, file: path.relative(root, file) });
  }
}

for (const rel of sources.chapters) {
  const file = path.join(root, rel);
  const chapter = JSON.parse(readFileSync(file, "utf8"));
  if (typeof chapter.name_zh === "string") {
    add(core, chapter.name_zh, `${rel}:name_zh`);
    add(kuaile, chapter.name_zh, `${rel}:name_zh`);
  }
  for (const stage of chapter.stages ?? []) {
    add(core, stage.name_zh ?? "", `${rel}:stage ${stage.id} name_zh`);
    add(kuaile, stage.name_zh ?? "", `${rel}:stage ${stage.id} name_zh`);
    add(core, stage.goal_zh ?? "", `${rel}:stage ${stage.id} goal_zh`);
  }
  takeMeanings(file, chapter.chapter_extra_words ?? []);
}

for (const rel of sources.wordlists) {
  const file = path.join(root, rel);
  const list = JSON.parse(readFileSync(file, "utf8"));
  takeMeanings(file, list.words ?? []);
}

const grades = { 3: new Map(), 4: new Map(), 5: new Map(), 6: new Map() };
const covered = new Set(core.keys());
for (const grade of [3, 4, 5, 6]) {
  for (const item of meanings) {
    if (item.grade !== grade) continue;
    for (const ch of Array.from(item.text)) {
      if (covered.has(ch)) continue;
      const list = grades[grade].get(ch) ?? [];
      if (list.length < 4) list.push(item.file);
      grades[grade].set(ch, list);
      covered.add(ch);
    }
  }
}
for (const item of meanings) {
  for (const ch of Array.from(item.text)) {
    if (!covered.has(ch)) fail(`meaning glyph ${ch} U+${ch.codePointAt(0).toString(16)} from ${item.file} is in neither core nor a grade chunk`);
  }
}

function textOf(map) {
  return Array.from(map.keys()).sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join("\n") + "\n";
}

function plain(map) {
  return Object.fromEntries(Array.from(map.entries()).map(([ch, where]) => [ch, where]));
}

const written = {
  "charset_core.txt": textOf(core),
  "charset_kuaile.txt": textOf(kuaile),
  "charset_g3.txt": textOf(grades[3]),
  "charset_g4.txt": textOf(grades[4]),
  "charset_g5.txt": textOf(grades[5]),
  "charset_g6.txt": textOf(grades[6]),
};
const outDir = check ? mkdtempSync(path.join(tmpdir(), "lexi-charset-")) : path.join(root, "build/fonts");
mkdirSync(outDir, { recursive: true });
for (const [name, body] of Object.entries(written)) writeFileSync(path.join(outDir, name), body);
if (!check) {
  writeFileSync(path.join(outDir, "glyph-sources.json"), JSON.stringify({
    core: plain(core),
    kuaile: plain(kuaile),
    g3: plain(grades[3]),
    g4: plain(grades[4]),
    g5: plain(grades[5]),
    g6: plain(grades[6]),
  }));
  console.log(`charsets core=${core.size} kuaile=${kuaile.size} g3=${grades[3].size} g4=${grades[4].size} g5=${grades[5].size} g6=${grades[6].size}`);
} else {
  for (const name of Object.keys(written)) {
    const committed = readFileSync(path.join(root, "build/fonts", name), "utf8");
    const fresh = readFileSync(path.join(outDir, name), "utf8");
    if (committed !== fresh) fail(`charset drift in build/fonts/${name}. Run npm run build:fonts and commit the charset files.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  console.log("charset files match the source");
}

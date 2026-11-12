import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * The release body is the "## <version>" section, from that heading up to the
 * next line that starts with "## ".
 */
export function extractReleaseSection(markdown, version) {
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error("package.json 没有 version，已停止，不会创建 Release。");
  }
  const heading = `## ${version.trim()}`;
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    throw new Error(`RELEASE_NOTES.md 没有与版本 ${version.trim()} 对应的「${heading}」一节，已停止，不会创建 Release。`);
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      end = index;
      break;
    }
  }
  return `${lines.slice(start, end).join("\n").trimEnd()}\n`;
}

export function releaseNotesFromFiles(notesText, packageJsonText) {
  const version = JSON.parse(packageJsonText).version;
  return extractReleaseSection(notesText, version);
}

function readVersion(packagePath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取 ${packagePath}：${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed.version;
}

function main() {
  const packagePath = "package.json";
  const notesPath = "RELEASE_NOTES.md";
  const version = readVersion(packagePath);
  let notes;
  try {
    notes = readFileSync(notesPath, "utf8");
  } catch (error) {
    throw new Error(`无法读取 ${notesPath}：${error instanceof Error ? error.message : String(error)}`);
  }
  const section = extractReleaseSection(notes, version);
  const out = process.argv[2];
  if (out) writeFileSync(out, section);
  else process.stdout.write(section);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

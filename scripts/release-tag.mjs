import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** v + semver, including a pre-release or build suffix. The v is required. */
const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function releaseTitle(tag) {
  return `LexiQuest ${tag}`;
}

/**
 * An empty tag keeps the generated desktop-r / desktop-dryrun name.
 * A filled tag must be v<semver> and equal v + package.json version.
 */
export function decideReleaseTag({ tag, version, draft, runNumber, sha }) {
  const requested = typeof tag === "string" ? tag.trim() : "";
  const isDraft = String(draft) !== "false";
  const fullSha = String(sha ?? "");
  const shortSha = fullSha.slice(0, 7);
  if (requested === "") {
    return {
      ok: true,
      explicit: false,
      isDraft,
      tag: isDraft ? `desktop-dryrun-${runNumber}-${shortSha}` : `desktop-r${runNumber}-${shortSha}`,
      title: "",
      target: "",
    };
  }
  if (!TAG_PATTERN.test(requested)) {
    return {
      ok: false,
      code: "format",
      message: `tag「${requested}」不是 v<semver>。不填则仍用 desktop-r / desktop-dryrun。已停止，不会创建 Release。`,
    };
  }
  const bare = requested.slice(1);
  if (bare !== String(version)) {
    return {
      ok: false,
      code: "version",
      message: `tag「${requested}」和 package.json 的版本 ${version} 不一致。已停止，不会创建 Release。`,
    };
  }
  return {
    ok: true,
    explicit: true,
    isDraft,
    tag: requested,
    title: releaseTitle(requested),
    target: fullSha,
  };
}

/**
 * Explicit tags never replace an existing tag or Release, including a draft.
 * A generated desktop-* name is not a conflict for a different explicit tag.
 */
export function findReleaseConflict(tag, { remoteTags = [], releases = [] } = {}) {
  const title = releaseTitle(tag);
  if (remoteTags.includes(tag)) return { kind: "tag", name: tag };
  const release = releases.find((item) => item?.tag_name === tag || item?.name === title);
  if (!release) return null;
  return {
    kind: "release",
    name: release.tag_name,
    title: release.name,
    draft: release.draft === true,
  };
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return "";
  return process.argv[index + 1] ?? "";
}

function readJson(file) {
  if (!file) return [];
  return JSON.parse(readFileSync(file, "utf8"));
}

function printDecision(decision) {
  if (!decision.ok) {
    console.error(decision.message);
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify(decision)}\n`);
}

function main() {
  const command = process.argv[2];
  if (command === "decide") {
    printDecision(decideReleaseTag({
      tag: arg("--tag"),
      version: arg("--version"),
      draft: arg("--draft"),
      runNumber: arg("--run"),
      sha: arg("--sha"),
    }));
    return;
  }
  if (command === "conflict") {
    const tag = arg("--tag");
    const conflict = findReleaseConflict(tag, {
      remoteTags: readJson(arg("--tags")),
      releases: readJson(arg("--releases")),
    });
    if (conflict) {
      const where = conflict.kind === "tag"
        ? `远端已有 tag ${conflict.name}`
        : `已有 Release ${conflict.title ?? conflict.name}${conflict.draft ? "（草稿）" : ""}`;
      console.error(`${where}。不会覆盖，已停止。`);
      process.exit(1);
    }
    process.stdout.write("ok\n");
    return;
  }
  console.error("usage: release-tag.mjs decide|conflict");
  process.exit(2);
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) main();

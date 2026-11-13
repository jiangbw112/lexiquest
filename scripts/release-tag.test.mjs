import { describe, expect, it } from "vitest";
import { decideReleaseTag, findReleaseConflict } from "./release-tag.mjs";

const sha = "7e54d811465ca8368f5f54b05505ca6e1fffad39";

describe("release tag decision", () => {
  it("keeps the generated dry-run tag when the input is empty", () => {
    const decision = decideReleaseTag({ tag: "", version: "1.0.0", draft: "true", runNumber: 12, sha });
    expect(decision).toEqual({
      ok: true,
      explicit: false,
      isDraft: true,
      tag: "desktop-dryrun-12-7e54d81",
      title: "",
      target: "",
    });
  });

  it("treats spaces as an empty tag and uses desktop-r when draft is false", () => {
    const decision = decideReleaseTag({ tag: "   ", version: "1.0.0", draft: "false", runNumber: 9, sha });
    expect(decision.ok).toBe(true);
    expect(decision.explicit).toBe(false);
    expect(decision.isDraft).toBe(false);
    expect(decision.tag).toBe("desktop-r9-7e54d81");
    expect(decision.target).toBe("");
  });

  it("accepts v1.0.0 when package.json is 1.0.0", () => {
    const decision = decideReleaseTag({ tag: "v1.0.0", version: "1.0.0", draft: "true", runNumber: 3, sha });
    expect(decision).toEqual({
      ok: true,
      explicit: true,
      isDraft: true,
      tag: "v1.0.0",
      title: "LexiQuest v1.0.0",
      target: sha,
    });
  });

  it("rejects a tag that is not v<semver>", () => {
    for (const tag of ["1.0.0", "v1.0", "vv1.0.0", "version-1.0.0"]) {
      const decision = decideReleaseTag({ tag, version: "1.0.0", draft: "true", runNumber: 1, sha });
      expect(decision.ok, tag).toBe(false);
      expect(decision.code).toBe("format");
    }
  });

  it("rejects a well-formed tag that does not match package.json", () => {
    const decision = decideReleaseTag({ tag: "v1.0.1", version: "1.0.0", draft: "false", runNumber: 1, sha });
    expect(decision.ok).toBe(false);
    expect(decision.code).toBe("version");
    const prerelease = decideReleaseTag({ tag: "v1.0.0-beta", version: "1.0.0", draft: "true", runNumber: 1, sha });
    expect(prerelease.ok).toBe(false);
    expect(prerelease.code).toBe("version");
  });

  it("fails when the same tag or the same release name already exists", () => {
    expect(findReleaseConflict("v1.0.0", { remoteTags: ["v1.0.0"], releases: [] })?.kind).toBe("tag");
    expect(findReleaseConflict("v1.0.0", {
      remoteTags: [],
      releases: [{ tag_name: "v1.0.0", name: "LexiQuest v1.0.0", draft: true }],
    })?.draft).toBe(true);
    expect(findReleaseConflict("v1.0.0", {
      remoteTags: ["desktop-r4-9613161"],
      releases: [{ tag_name: "desktop-dryrun-5-65d0eb2", name: "[草稿] LexiQuest v1.0.0", draft: true }],
    })).toBeNull();
    expect(findReleaseConflict("v1.0.0", {
      remoteTags: [],
      releases: [{ tag_name: "desktop-r9-aaaaaaa", name: "LexiQuest v1.0.0", draft: false }],
    })?.kind).toBe("release");
  });
});

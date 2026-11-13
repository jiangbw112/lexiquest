import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractReleaseSection, releaseNotesFromFiles } from "./release-notes.mjs";

const sample = `# 说明

每发一版，在最上方追加一节。

## 1.1.0

- 下一版才写在这里。

## 1.0.0

- 三到六年级一共 31 章，都已经放进游戏里。
- 在「给家长」里可以勾选要学的年级。

## 0.9.0

- 更早的一版。
`;

describe("release notes", () => {
  it("extracts the section for one version", () => {
    const notes = "## 1.0.0\n\n- 三到六年级一共 31 章。\n";
    expect(extractReleaseSection(notes, "1.0.0")).toBe("## 1.0.0\n\n- 三到六年级一共 31 章。\n");
  });

  it("keeps only the section that matches the version", () => {
    const section = extractReleaseSection(sample, "1.0.0");
    expect(section).toBe("## 1.0.0\n\n- 三到六年级一共 31 章，都已经放进游戏里。\n- 在「给家长」里可以勾选要学的年级。\n");
    expect(section).not.toContain("1.1.0");
    expect(section).not.toContain("0.9.0");
    expect(section).not.toContain("每发一版");
  });

  it("fails clearly when that version has no section", () => {
    expect(() => extractReleaseSection(sample, "2.0.0")).toThrow(
      "RELEASE_NOTES.md 没有与版本 2.0.0 对应的「## 2.0.0」一节，已停止，不会创建 Release。",
    );
    expect(() => extractReleaseSection("## 1.0.0 草稿\n\n- 不是这一节。\n", "1.0.0")).toThrow("不会创建 Release");
  });

  it("uses the version in package.json for the committed notes", () => {
    const notes = readFileSync(new URL("../RELEASE_NOTES.md", import.meta.url), "utf8");
    const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    expect(JSON.parse(pkg).version).toBe("1.0.1");
    const section = releaseNotesFromFiles(notes, pkg);
    expect(section.startsWith("## 1.0.1\n")).toBe(true);
    expect(section).toContain("取消每日新词硬上限");
    expect(section).toContain("只作为每日目标");
    expect(section).toContain("只温和提醒");
    expect(section).toContain("Windows 和 Mac 的安装包只做了文件级核验（产物存在、文件名、大小），没有做真机启动测试。");
    expect(section).not.toContain("## 1.0.0");
    expect(section).not.toContain("清除这台电脑上的存档");
  });

  it("selects 1.0.0 and 1.0.1 separately and fails when that section is missing", () => {
    const notes = readFileSync(new URL("../RELEASE_NOTES.md", import.meta.url), "utf8");
    const current = extractReleaseSection(notes, "1.0.1");
    const previous = extractReleaseSection(notes, "1.0.0");
    expect(current.startsWith("## 1.0.1\n")).toBe(true);
    expect(current).not.toContain("## 1.0.0");
    expect(current).not.toContain("发明家先锁着");
    expect(previous.startsWith("## 1.0.0\n")).toBe(true);
    expect(previous).toContain("清除这台电脑上的存档");
    expect(previous).toContain("Windows 和 Mac 的安装包只做了文件级核验（产物存在、文件名、大小），没有做真机启动测试。");
    expect(previous).not.toContain("## 1.0.1");
    expect(previous).not.toContain("取消每日新词硬上限");
    expect(() => extractReleaseSection(notes, "1.0.2")).toThrow(
      "RELEASE_NOTES.md 没有与版本 1.0.2 对应的「## 1.0.2」一节，已停止，不会创建 Release。",
    );
    expect(() => extractReleaseSection("## 1.0.10\n\n- 别的版本。\n", "1.0.1")).toThrow("不会创建 Release");
  });
});

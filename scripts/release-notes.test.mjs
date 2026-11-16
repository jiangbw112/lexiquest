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
    expect(JSON.parse(pkg).version).toBe("1.0.3");
    const section = releaseNotesFromFiles(notes, pkg);
    expect(section.startsWith("## 1.0.3\n")).toBe(true);
    expect(section).toContain("学堂 · 三年级 · 森林冒险");
    expect(section).toContain("森林冒险（三年级）");
    expect(section).toContain("先打完森林冒险，这一年级就会开启");
    expect(section).toContain("就是职业原本的衣服");
    expect(section).toContain("还要学几个新词才能通过这一关");
    expect(section).toContain("去学堂学新词，对战会出现更多词");
    expect(section).toContain("安装方式没有变");
    expect(section).not.toContain("## 1.0.2");
    expect(section).not.toContain("## 1.0.1");
    expect(section).not.toContain("## 1.0.0");
    expect(section).not.toContain("取消每日新词硬上限");
    expect(section).not.toContain("清除这台电脑上的存档");
    expect(section).not.toContain("游戏");
    expect(section).not.toContain("发明家");
    expect(section).not.toContain("Boss");
    expect(section).not.toContain("考试");
    expect(section).not.toContain("六个");
    expect(section).not.toContain("账本");
    expect(section).not.toContain("学习记录");
    expect(section).not.toContain("自由搭配");
  });

  it("selects 1.0.0, 1.0.1, 1.0.2, and 1.0.3 separately and fails when that section is missing", () => {
    const notes = readFileSync(new URL("../RELEASE_NOTES.md", import.meta.url), "utf8");
    const current = extractReleaseSection(notes, "1.0.3");
    const previous = extractReleaseSection(notes, "1.0.2");
    const earlier = extractReleaseSection(notes, "1.0.1");
    const first = extractReleaseSection(notes, "1.0.0");
    expect(current.startsWith("## 1.0.3\n")).toBe(true);
    expect(current).toContain("就是职业原本的衣服");
    expect(current).not.toContain("## 1.0.2");
    expect(current).not.toContain("## 1.0.1");
    expect(current).not.toContain("## 1.0.0");
    expect(previous.startsWith("## 1.0.2\n")).toBe(true);
    expect(previous).not.toContain("## 1.0.3");
    expect(previous).not.toContain("## 1.0.1");
    expect(previous).not.toContain("## 1.0.0");
    expect(previous).not.toContain("取消每日新词硬上限");
    expect(previous).toContain("保存方式升级为前后两部分");
    expect(previous).toContain("拼写练习时不再露出答案");
    expect(previous).not.toContain("六个");
    expect(previous).not.toContain("自由搭配");
    expect(earlier.startsWith("## 1.0.1\n")).toBe(true);
    expect(earlier).toContain("取消每日新词硬上限");
    expect(earlier).toContain("Windows 和 Mac 的安装包只做了文件级核验（产物存在、文件名、大小），没有做真机启动测试。");
    expect(earlier).not.toContain("## 1.0.3");
    expect(earlier).not.toContain("## 1.0.2");
    expect(earlier).not.toContain("## 1.0.0");
    expect(earlier).not.toContain("保存方式升级为前后两部分");
    expect(earlier).not.toContain("拼写练习时不再露出答案");
    expect(first.startsWith("## 1.0.0\n")).toBe(true);
    expect(first).toContain("清除这台电脑上的存档");
    expect(first).not.toContain("## 1.0.3");
    expect(first).not.toContain("## 1.0.2");
    expect(first).not.toContain("## 1.0.1");
    expect(first).not.toContain("取消每日新词硬上限");
    expect(() => extractReleaseSection(notes, "1.0.4")).toThrow(
      "RELEASE_NOTES.md 没有与版本 1.0.4 对应的「## 1.0.4」一节，已停止，不会创建 Release。",
    );
    expect(() => extractReleaseSection("## 1.0.10\n\n- 别的版本。\n", "1.0.1")).toThrow("不会创建 Release");
    expect(() => extractReleaseSection("## 1.0.20\n\n- 别的版本。\n", "1.0.2")).toThrow("不会创建 Release");
  });
});

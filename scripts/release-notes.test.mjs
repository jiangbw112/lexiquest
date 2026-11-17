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
    expect(JSON.parse(pkg).version).toBe("1.0.4");
    const section = releaseNotesFromFiles(notes, pkg);
    expect(section.startsWith("## 1.0.4\n")).toBe(true);
    expect(section).toContain("期中守护者");
    expect(section).toContain("期末守护者");
    expect(section).toContain("先打败前面的章节守护者");
    expect(section).toContain("第一次打完整场期中或期末挑战，会得到这场挑战的称号");
    expect(section).toContain("你打败了期末大 Boss，发明家来找你了");
    expect(section).toContain("打赢普通战斗（包括森林冒险）");
    expect(section).toContain("等级往上跨了一级");
    expect(section).toContain("刷新页面");
    expect(section).toContain("同一时间只能打开一个窗口");
    expect(section).toContain("六年级下册期末的罗盘原先画到画面外面，现在能看见了");
    expect(section).not.toContain("画在书的右侧");
    expect(section).toContain("休息一下");
    expect(section).toContain("有几张词卡的熟练徽章亮了");
    expect(section).toContain("从这一章的词里抽题");
    expect(section).toContain("听一听");
    expect(section).toContain("Boss 要先学完本章词，还剩几个词");
    expect(section).toContain("3 个选项");
    expect(section).toContain("11 对近义词");
    expect(section).toContain("camp/camping");
    expect(section).toContain("不再互为干扰项");
    expect(section).not.toContain("意思接近的词不再同时出现");
    expect(section).toContain("已知问题：期末王冠和期中徽章目前还显示不出来，下一版修。");
    expect(section).toContain("安装方式没有变");
    expect(section).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(section).not.toContain("## 1.0.3");
    expect(section).not.toContain("## 1.0.2");
    expect(section).not.toContain("## 1.0.1");
    expect(section).not.toContain("## 1.0.0");
    expect(section).not.toContain("取消每日新词硬上限");
    expect(section).not.toContain("清除这台电脑上的存档");
    expect(section).not.toContain("游戏");
    expect(section).not.toContain("六个");
    expect(section).not.toContain("账本");
    expect(section).not.toContain("学习记录");
    expect(section).not.toContain("自由搭配");
    expect(section).not.toContain("就是职业原本的衣服");
  });

  it("selects 1.0.0, 1.0.1, 1.0.2, 1.0.3, and 1.0.4 separately and fails when that section is missing", () => {
    const notes = readFileSync(new URL("../RELEASE_NOTES.md", import.meta.url), "utf8");
    const current = extractReleaseSection(notes, "1.0.4");
    const previous = extractReleaseSection(notes, "1.0.3");
    const earlier = extractReleaseSection(notes, "1.0.2");
    const older = extractReleaseSection(notes, "1.0.1");
    const first = extractReleaseSection(notes, "1.0.0");
    expect(current.startsWith("## 1.0.4\n")).toBe(true);
    expect(current).toContain("同一时间只能打开一个窗口");
    expect(current).not.toContain("## 1.0.3");
    expect(current).not.toContain("## 1.0.2");
    expect(current).not.toContain("## 1.0.1");
    expect(current).not.toContain("## 1.0.0");
    expect(previous.startsWith("## 1.0.3\n")).toBe(true);
    expect(previous).toContain("学堂 · 三年级 · 森林冒险");
    expect(previous).toContain("森林冒险（三年级）");
    expect(previous).toContain("先打完森林冒险，这一年级就会开启");
    expect(previous).toContain("就是职业原本的衣服");
    expect(previous).toContain("打赢一场小战斗，这一关就通过");
    expect(previous).toContain("这一关还有几个新词可以去学堂学");
    expect(previous).toContain("对战会出这一章还没学过的词");
    expect(previous).not.toContain("对战会出这一关还没学过的词");
    expect(previous).toContain("学这些词仍在学堂");
    expect(previous).toContain("家长页另外写出本章已学几个词");
    expect(previous).not.toContain("才能通过");
    expect(previous).toContain("在对战里见到或答对，不会变成已学");
    expect(previous).toContain("本章 Boss（如林心守护者）仍要先通过前面的关卡，并且所选年级的本章词都学完（都有词卡）才能挑战");
    expect(previous).toContain("安装方式没有变");
    expect(previous).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(previous).not.toContain("## 1.0.4");
    expect(previous).not.toContain("## 1.0.2");
    expect(previous).not.toContain("## 1.0.1");
    expect(previous).not.toContain("## 1.0.0");
    expect(previous).not.toContain("发明家");
    expect(previous).not.toContain("期末大 Boss");
    expect(previous).not.toContain("章节 Boss");
    expect(previous).not.toContain("考试");
    expect(earlier.startsWith("## 1.0.2\n")).toBe(true);
    expect(earlier).not.toContain("## 1.0.4");
    expect(earlier).not.toContain("## 1.0.3");
    expect(earlier).not.toContain("## 1.0.1");
    expect(earlier).not.toContain("## 1.0.0");
    expect(earlier).not.toContain("取消每日新词硬上限");
    expect(earlier).toContain("保存方式升级为前后两部分");
    expect(earlier).toContain("拼写练习时不再露出答案");
    expect(earlier).not.toContain("六个");
    expect(earlier).not.toContain("自由搭配");
    expect(older.startsWith("## 1.0.1\n")).toBe(true);
    expect(older).toContain("取消每日新词硬上限");
    expect(older).toContain("Windows 和 Mac 的安装包只做了文件级核验（产物存在、文件名、大小），没有做真机启动测试。");
    expect(older).not.toContain("## 1.0.4");
    expect(older).not.toContain("## 1.0.3");
    expect(older).not.toContain("## 1.0.2");
    expect(older).not.toContain("## 1.0.0");
    expect(older).not.toContain("保存方式升级为前后两部分");
    expect(older).not.toContain("拼写练习时不再露出答案");
    expect(first.startsWith("## 1.0.0\n")).toBe(true);
    expect(first).toContain("清除这台电脑上的存档");
    expect(first).not.toContain("## 1.0.4");
    expect(first).not.toContain("## 1.0.3");
    expect(first).not.toContain("## 1.0.2");
    expect(first).not.toContain("## 1.0.1");
    expect(first).not.toContain("取消每日新词硬上限");
    expect(() => extractReleaseSection(notes, "1.0.5")).toThrow(
      "RELEASE_NOTES.md 没有与版本 1.0.5 对应的「## 1.0.5」一节，已停止，不会创建 Release。",
    );
    expect(() => extractReleaseSection("## 1.0.10\n\n- 别的版本。\n", "1.0.1")).toThrow("不会创建 Release");
    expect(() => extractReleaseSection("## 1.0.20\n\n- 别的版本。\n", "1.0.2")).toThrow("不会创建 Release");
  });
});

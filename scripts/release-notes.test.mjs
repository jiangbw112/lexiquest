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
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    const version = JSON.parse(pkg).version;
    expect(version).toBe("1.0.5");
    expect(readme).toContain(`当前版本：${version}。这一版的更新写在 [更新说明](RELEASE_NOTES.md)。安装方式没有变。`);
    const section = releaseNotesFromFiles(notes, pkg);
    expect(section.startsWith("## 1.0.5\n")).toBe(true);
    expect(section).toContain("学堂学完一个词后直接进入下一个词，不再弹窗确认。");
    expect(section).toContain("今日进度条跟着家长设的每日目标走：轻松 3、标准 5、多一点 8。");
    expect(section).toContain("达标后进度条变成金色，并显示「今天的新词够啦，想继续认识新朋友也可以。」可以接着学，不会被拦住。");
    expect(section).toContain("选章只列出家长打开的年级。这些年级的章节在学堂里都可以自由学。");
    expect(section).toContain("每个打开的年级，第一章是「森林冒险」，内容是这个年级的森林词，再加上 8 个共用词。");
    expect(section).toContain("学词时右上角有「换一章」。");
    expect(section).toContain("进来会写「请重新选章」。");
    expect(section).toContain("标题是已经打开的年级，例如「学堂 · 三年级」或「学堂 · 三年级、五年级」");
    expect(section).toContain("选章会先停在第一个打开年级的森林冒险上，点「确认」之后才换过去。");
    expect(section).toContain("已知问题：学完一个年级的森林课后，另一个年级的森林课一开始就显示已经学了 8 个共用词。");
    expect(section).toContain("安装方式没有变");
    expect(section).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(section).not.toContain("## 1.0.4");
    expect(section).not.toContain("## 1.0.3");
    expect(section).not.toContain("## 1.0.2");
    expect(section).not.toContain("## 1.0.1");
    expect(section).not.toContain("## 1.0.0");
    expect(section).not.toContain("取消每日新词硬上限");
    expect(section).not.toContain("清除这台电脑上的存档");
    expect(section.split("游戏").length - 1).toBe(0);
    expect(section).not.toContain("六个");
    expect(section).not.toContain("账本");
    expect(section).not.toContain("学习记录");
    expect(section).not.toContain("自由搭配");
    expect(section).not.toContain("就是职业原本的衣服");
  });

  it("selects 1.0.0, 1.0.1, 1.0.2, 1.0.3, 1.0.4, and 1.0.5 separately and fails when that section is missing", () => {
    const notes = readFileSync(new URL("../RELEASE_NOTES.md", import.meta.url), "utf8");
    const latest = extractReleaseSection(notes, "1.0.5");
    const current = extractReleaseSection(notes, "1.0.4");
    const previous = extractReleaseSection(notes, "1.0.3");
    const earlier = extractReleaseSection(notes, "1.0.2");
    const older = extractReleaseSection(notes, "1.0.1");
    const first = extractReleaseSection(notes, "1.0.0");
    expect(latest.startsWith("## 1.0.5\n")).toBe(true);
    expect(latest).toContain("请重新选章");
    expect(latest).not.toContain("## 1.0.4");
    expect(latest.split("游戏").length - 1).toBe(0);
    expect(current.startsWith("## 1.0.4\n")).toBe(true);
    expect(current).toContain("期中守护者");
    expect(current).toContain("期末守护者");
    expect(current).toContain("先打败前面的章节守护者");
    expect(current).toContain("第一次打完整场期中或期末挑战，会得到这场挑战的称号");
    expect(current).toContain("你打败了期末大 Boss，发明家来找你了");
    expect(current).toContain("打赢普通战斗（包括森林冒险）");
    expect(current).toContain("等级往上跨了一级");
    expect(current).toContain("刷新页面");
    expect(current).toContain("同一时间只能打开一个窗口");
    expect(current).toContain("六年级下期末守护者的罗盘吊坠挂在左页，贴着书脊。");
    expect(current).not.toContain("现在能看见");
    expect(current).not.toContain("原先画到画面外面");
    expect(current).not.toContain("画在书的右侧");
    expect(current).toContain("休息一下");
    expect(current).toContain("有几张词卡的熟练徽章亮了");
    expect(current).toContain("从这一章的词里抽题");
    expect(current).toContain("听一听");
    expect(current).toContain("Boss 要先学完本章词，还剩几个词");
    expect(current).toContain("3 个选项");
    expect(current).toContain("11 对近义词");
    expect(current).toContain("camp/camping");
    expect(current).toContain("不再互为干扰项");
    expect(current).not.toContain("意思接近的词不再同时出现");
    expect(current).toContain("期末守护者的王冠和金色装饰、期中守护者的徽章和光效都完整显示；守护者不会挡住答题和答错时显示的单词。");
    expect(current).not.toContain("不会再挡住");
    expect(current).not.toContain("已知问题");
    expect(current).not.toContain("还显示不出来");
    expect(current).toContain("安装方式没有变");
    expect(current).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(current).not.toContain("## 1.0.5");
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
    expect(previous).not.toContain("## 1.0.5");
    expect(previous).not.toContain("## 1.0.4");
    expect(previous).not.toContain("## 1.0.2");
    expect(previous).not.toContain("## 1.0.1");
    expect(previous).not.toContain("## 1.0.0");
    expect(previous).not.toContain("发明家");
    expect(previous).not.toContain("期末大 Boss");
    expect(previous).not.toContain("章节 Boss");
    expect(previous).not.toContain("考试");
    expect(earlier.startsWith("## 1.0.2\n")).toBe(true);
    expect(earlier).not.toContain("## 1.0.5");
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
    expect(older).not.toContain("## 1.0.5");
    expect(older).not.toContain("## 1.0.4");
    expect(older).not.toContain("## 1.0.3");
    expect(older).not.toContain("## 1.0.2");
    expect(older).not.toContain("## 1.0.0");
    expect(older).not.toContain("保存方式升级为前后两部分");
    expect(older).not.toContain("拼写练习时不再露出答案");
    expect(first.startsWith("## 1.0.0\n")).toBe(true);
    expect(first).toContain("清除这台电脑上的存档");
    expect(first).not.toContain("## 1.0.5");
    expect(first).not.toContain("## 1.0.4");
    expect(first).not.toContain("## 1.0.3");
    expect(first).not.toContain("## 1.0.2");
    expect(first).not.toContain("## 1.0.1");
    expect(first).not.toContain("取消每日新词硬上限");
    expect(() => extractReleaseSection(notes, "1.0.6")).toThrow(
      "RELEASE_NOTES.md 没有与版本 1.0.6 对应的「## 1.0.6」一节，已停止，不会创建 Release。",
    );
    expect(() => extractReleaseSection("## 1.0.10\n\n- 别的版本。\n", "1.0.1")).toThrow("不会创建 Release");
    expect(() => extractReleaseSection("## 1.0.20\n\n- 别的版本。\n", "1.0.2")).toThrow("不会创建 Release");
  });
});

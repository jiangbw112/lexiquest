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
    expect(version).toBe("1.0.8");
    expect(readme).toContain(`当前版本：${version}。这一版的更新写在 [更新说明](RELEASE_NOTES.md)。安装方式没有变。`);
    const section = releaseNotesFromFiles(notes, pkg);
    expect(section.startsWith("## 1.0.8\n")).toBe(true);
    expect(section).toContain("复习桌在原来的「拼写」旁边增加「盖住拼」。");
    expect(section).toContain("提交前不显示英文。");
    expect(section).toContain("可以点「再听一次」。");
    expect(section).toContain("用键盘输入后提交。");
    expect(section).toContain("只有这个词第一次从没掌握变成已掌握，才加 30 经验，并和已掌握一起记下。");
    expect(section).toContain("同一个词再拼一次不加。");
    expect(section).toContain("Boss 或考试里已经掌握的，也不补这 30。");
    expect(section).toContain("当天新学的词可以练。最早要到这台电脑的下一个自然日，才能记成已掌握。");
    expect(section).toContain("答错或点「不会」后，当天会看到英文。");
    expect(section).toContain("这一天再练只算练习，不记掌握，也不加经验。");
    expect(section).toContain("这些记在这个角色自己的文件里。");
    expect(section).toContain("换角色不会写到别人身上。");
    expect(section).toContain("退出后再打开，还在。");
    expect(section).toContain("保存没有写进去时，这次不算成功。");
    expect(section).toContain("没保存上。掌握和经验都没有记下。再试一次。");
    expect(section).toContain("这里的「已掌握」不是复习桌那一行的「熟练」或「未熟练」。");
    expect(section).toContain("那一行仍是熟练徽章。");
    expect(section).toContain("盖住拼不点亮熟练徽章，也不改复习时间。");
    expect(section).toContain("这一版没有把这两套说法合成一套，也没有改成所有练习都走同一条规则。");
    expect(section).toContain("这 30 经验可能让等级往上跨了一级。");
    expect(section).toContain("盖住拼当场不发这一级的称号。");
    expect(section).toContain("称号仍只在对战或考试自己跨过这一级时给，不会回头补。");
    expect(section).toContain("学堂学会一个词时加上的经验也是这样。");
    expect(section).toContain("Linux 生产包已经单独做过窄界面核对：第一次加 30、再拼不加、退出再打开不补；当天新学只练习，看过答案的当天也只练习。");
    expect(section).toContain("进度写在这台电脑的真实目录里。");
    expect(section).toContain("生产程序文件和打进安装目录的 app.asar 也单独核对过，没有测试用的保存失败入口。");
    expect(section).toContain("Windows 和 macOS 没有在真机上启动。");
    expect(section).toContain("打包检查通过，不等于在这两台系统上打开过。");
    expect(section).toContain("还没核对：界面上真实的保存失败、真实的午夜换日、实际听得见的发音，以及其他评分快捷键。");
    expect(section).not.toContain("学习工具");
    expect(section).toContain("安装方式没有变");
    expect(section).not.toContain("Windows 和 macOS 的安装包只做了文件级核验");
    expect(section).not.toContain("## 1.0.7");
    expect(section).not.toContain("## 1.0.6");
    expect(section).not.toContain("## 1.0.5");
    expect(section).not.toContain("## 1.0.4");
    expect(section).not.toContain("## 1.0.3");
    expect(section).not.toContain("## 1.0.2");
    expect(section).not.toContain("## 1.0.1");
    expect(section).not.toContain("## 1.0.0");
    expect(section).not.toContain("取消每日新词硬上限");
    expect(section).not.toContain("清除这台电脑上的存档");
    expect(section).not.toContain("不可能");
    expect(section.split("游戏").length - 1).toBe(0);
    expect(section).not.toContain("六个");
    expect(section).not.toContain("账本");
    expect(section).not.toContain("学习记录");
    expect(section).not.toContain("自由搭配");
    expect(section).not.toContain("就是职业原本的衣服");
  });

  it("selects 1.0.0, 1.0.1, 1.0.2, 1.0.3, 1.0.4, 1.0.5, 1.0.6, 1.0.7, and 1.0.8 separately and fails when that section is missing", () => {
    const notes = readFileSync(new URL("../RELEASE_NOTES.md", import.meta.url), "utf8");
    const latest = extractReleaseSection(notes, "1.0.8");
    const notes107 = extractReleaseSection(notes, "1.0.7");
    const notes106 = extractReleaseSection(notes, "1.0.6");
    const current = extractReleaseSection(notes, "1.0.5");
    const previousNotes = extractReleaseSection(notes, "1.0.4");
    const previous = extractReleaseSection(notes, "1.0.3");
    const earlier = extractReleaseSection(notes, "1.0.2");
    const older = extractReleaseSection(notes, "1.0.1");
    const first = extractReleaseSection(notes, "1.0.0");
    expect(latest.startsWith("## 1.0.8\n")).toBe(true);
    expect(latest).toContain("盖住拼");
    expect(latest).toContain("才加 30 经验");
    expect(latest).toContain("也不补这 30");
    expect(latest).toContain("熟练徽章");
    expect(latest).toContain("当场不发这一级的称号");
    expect(latest).toContain("真实目录");
    expect(latest).toContain("app.asar");
    expect(latest).toContain("没有在真机上启动");
    expect(latest).toContain("实际听得见的发音");
    expect(latest).not.toContain("学习工具");
    expect(latest).not.toContain("## 1.0.7");
    expect(latest.split("游戏").length - 1).toBe(0);
    expect(notes107.startsWith("## 1.0.7\n")).toBe(true);
    expect(notes107).toContain("会直接回到选择章节");
    expect(notes107).toContain("返回选择章节");
    expect(notes107).toContain("这台电脑最多 6 个角色");
    expect(notes107).not.toContain("学习工具");
    expect(notes107).not.toContain("## 1.0.8");
    expect(notes107).not.toContain("## 1.0.6");
    expect(notes107).not.toContain("盖住拼");
    expect(notes107.split("游戏").length - 1).toBe(0);
    expect(notes106.startsWith("## 1.0.6\n")).toBe(true);
    expect(notes106).toContain("学堂选章时，词都学完的章显示「已学完」。");
    expect(notes106).toContain("学了一部分的章写出已经学了几个、一共几个。");
    expect(notes106).toContain("例如「六年级词 1/3 · 共用 8/8」，两边都齐了才显示「已学完」。");
    expect(notes106).toContain("学完一个年级的森林课后，另一个年级的森林课一开始就显示已经学了 8 个共用词。");
    expect(notes106).toContain("现在学堂把共用词单独计数。这 8 个共用词仍然算学过，写成「共用 8/8」");
    expect(notes106).toContain("对战里这一章的五关都能挑战，包括这一章的 Boss。");
    expect(notes106).toContain("章和章之间的锁没有变：森林冒险要先打完，同一年级里也要先打完上一章。");
    expect(notes106).toContain("词还没学完时，关卡仍是一关一关开。");
    expect(notes106).toContain("不再出现「章节还没通关」。");
    expect(notes106).toContain("锁着的 Boss 面板写出整章进度，例如三年级新存档是「本章已学 0/16 个词」");
    expect(notes106).toContain("在学堂学完本章词就能挑战");
    expect(notes106).toContain("这个新存档在地图上先列出 6 个词，再写「还有 10 个没在学堂学过」。");
    expect(notes106).toContain("结算页只在赢了第 4 关、而且 Boss 还没开放时，才列出还没在学堂学过的词。");
    expect(notes106).toContain("结算页先列出 8 个词，再写「还有 8 个没在学堂学过」。");
    expect(notes106).toContain("还缺词的年级只有一个时，写「去学堂学」。还缺词的年级不止一个时，才写成「去三年级学」");
    expect(notes106).toContain("按钮写成「去六年级学」。");
    expect(notes106).toContain("村子、地图和「给家长」的顶栏写清年级和章名");
    expect(notes106).toContain("三年级 · 森林冒险：已学 0/16 个词");
    expect(notes106).toContain("三、四、五、六年级 · 森林冒险：已学 0/28 个词");
    expect(notes106).toContain("还有 16 个没在学堂学过");
    expect(notes106).toContain("本章全学会了，真棒！");
    expect(notes106).toContain("这一章打完啦，真棒！");
    expect(notes106).toContain("在对战里答对，不会变成已学。");
    expect(notes106).toContain("「对战答对也要去学堂学一次哦」只出现在赢了第 4 关、Boss 还没开放的结算页上");
    expect(notes106).toContain("不再另外写「这一关还有几个新词可以去学堂学」。");
    expect(notes106).toContain("存档没有加新字段。以前的存档照常能用，已经学过的词还在。");
    expect(notes106).not.toContain("学习工具");
    expect(notes106).toContain("安装方式没有变");
    expect(notes106).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(notes106).not.toContain("## 1.0.8");
    expect(notes106).not.toContain("## 1.0.7");
    expect(notes106).not.toContain("## 1.0.5");
    expect(notes106.split("游戏").length - 1).toBe(0);
    expect(current.startsWith("## 1.0.5\n")).toBe(true);
    expect(current).toContain("学堂学完一个词后直接进入下一个词，不再弹窗确认。");
    expect(current).toContain("今日进度条跟着家长设的每日目标走：轻松 3、标准 5、多一点 8。");
    expect(current).toContain("达标后进度条变成金色，并显示「今天的新词够啦，想继续认识新朋友也可以。」可以接着学，不会被拦住。");
    expect(current).toContain("选章只列出家长打开的年级。这些年级的章节在学堂里都可以自由学。");
    expect(current).toContain("每个打开的年级，第一章是「森林冒险」，内容是这个年级的森林词，再加上 8 个共用词。");
    expect(current).toContain("学词时右上角有「换一章」。");
    expect(current).toContain("进来会写「请重新选章」。");
    expect(current).toContain("标题是已经打开的年级，例如「学堂 · 三年级」或「学堂 · 三年级、五年级」");
    expect(current).toContain("选章会先停在第一个打开年级的森林冒险上，点「确认」之后才换过去。");
    expect(current).toContain("已知问题：学完一个年级的森林课后，另一个年级的森林课一开始就显示已经学了 8 个共用词。");
    expect(current).toContain("安装方式没有变");
    expect(current).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(current).not.toContain("## 1.0.8");
    expect(current).not.toContain("## 1.0.7");
    expect(current).not.toContain("## 1.0.6");
    expect(current).not.toContain("## 1.0.4");
    expect(current.split("游戏").length - 1).toBe(0);
    expect(previousNotes.startsWith("## 1.0.4\n")).toBe(true);
    expect(previousNotes).toContain("期中守护者");
    expect(previousNotes).toContain("期末守护者");
    expect(previousNotes).toContain("先打败前面的章节守护者");
    expect(previousNotes).toContain("第一次打完整场期中或期末挑战，会得到这场挑战的称号");
    expect(previousNotes).toContain("你打败了期末大 Boss，发明家来找你了");
    expect(previousNotes).toContain("打赢普通战斗（包括森林冒险）");
    expect(previousNotes).toContain("等级往上跨了一级");
    expect(previousNotes).toContain("刷新页面");
    expect(previousNotes).toContain("同一时间只能打开一个窗口");
    expect(previousNotes).toContain("六年级下期末守护者的罗盘吊坠挂在左页，贴着书脊。");
    expect(previousNotes).not.toContain("现在能看见");
    expect(previousNotes).not.toContain("原先画到画面外面");
    expect(previousNotes).not.toContain("画在书的右侧");
    expect(previousNotes).toContain("休息一下");
    expect(previousNotes).toContain("有几张词卡的熟练徽章亮了");
    expect(previousNotes).toContain("从这一章的词里抽题");
    expect(previousNotes).toContain("听一听");
    expect(previousNotes).toContain("Boss 要先学完本章词，还剩几个词");
    expect(previousNotes).toContain("3 个选项");
    expect(previousNotes).toContain("11 对近义词");
    expect(previousNotes).toContain("camp/camping");
    expect(previousNotes).toContain("不再互为干扰项");
    expect(previousNotes).not.toContain("意思接近的词不再同时出现");
    expect(previousNotes).toContain("期末守护者的王冠和金色装饰、期中守护者的徽章和光效都完整显示；守护者不会挡住答题和答错时显示的单词。");
    expect(previousNotes).not.toContain("不会再挡住");
    expect(previousNotes).not.toContain("已知问题");
    expect(previousNotes).not.toContain("还显示不出来");
    expect(previousNotes).toContain("安装方式没有变");
    expect(previousNotes).toContain("Windows 和 macOS 的安装包只做了文件级核验（构建产物存在、大小和校验），没有在真机上启动测试。");
    expect(previousNotes).not.toContain("## 1.0.8");
    expect(previousNotes).not.toContain("## 1.0.7");
    expect(previousNotes).not.toContain("## 1.0.6");
    expect(previousNotes).not.toContain("## 1.0.5");
    expect(previousNotes).not.toContain("## 1.0.3");
    expect(previousNotes).not.toContain("## 1.0.2");
    expect(previousNotes).not.toContain("## 1.0.1");
    expect(previousNotes).not.toContain("## 1.0.0");
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
    expect(previous).not.toContain("## 1.0.8");
    expect(previous).not.toContain("## 1.0.7");
    expect(previous).not.toContain("## 1.0.6");
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
    expect(earlier).not.toContain("## 1.0.8");
    expect(earlier).not.toContain("## 1.0.7");
    expect(earlier).not.toContain("## 1.0.6");
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
    expect(older).not.toContain("## 1.0.8");
    expect(older).not.toContain("## 1.0.7");
    expect(older).not.toContain("## 1.0.6");
    expect(older).not.toContain("## 1.0.5");
    expect(older).not.toContain("## 1.0.4");
    expect(older).not.toContain("## 1.0.3");
    expect(older).not.toContain("## 1.0.2");
    expect(older).not.toContain("## 1.0.0");
    expect(older).not.toContain("保存方式升级为前后两部分");
    expect(older).not.toContain("拼写练习时不再露出答案");
    expect(first.startsWith("## 1.0.0\n")).toBe(true);
    expect(first).toContain("清除这台电脑上的存档");
    expect(first).not.toContain("## 1.0.8");
    expect(first).not.toContain("## 1.0.7");
    expect(first).not.toContain("## 1.0.6");
    expect(first).not.toContain("## 1.0.5");
    expect(first).not.toContain("## 1.0.4");
    expect(first).not.toContain("## 1.0.3");
    expect(first).not.toContain("## 1.0.2");
    expect(first).not.toContain("## 1.0.1");
    expect(first).not.toContain("取消每日新词硬上限");
    expect(() => extractReleaseSection(notes, "1.0.9")).toThrow(
      "RELEASE_NOTES.md 没有与版本 1.0.9 对应的「## 1.0.9」一节，已停止，不会创建 Release。",
    );
    expect(() => extractReleaseSection("## 1.0.10\n\n- 别的版本。\n", "1.0.1")).toThrow("不会创建 Release");
    expect(() => extractReleaseSection("## 1.0.20\n\n- 别的版本。\n", "1.0.2")).toThrow("不会创建 Release");
  });
});

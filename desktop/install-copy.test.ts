import fs from "node:fs";
import { describe, expect, it } from "vitest";

const parentGuide = fs.readFileSync(new URL("../docs/家长安装说明.md", import.meta.url), "utf8");
const readme = fs.readFileSync(new URL("../README.md", import.meta.url), "utf8");
const faq = "https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions";
const faqZhCn = "https://support.microsoft.com/zh-cn/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions";

describe("install copy", () => {
  it("tells parents the current Smart App Control FAQ, and still says not to turn it off", () => {
    expect(parentGuide).not.toContain("关掉之后就不能再打开");
    expect(parentGuide).toContain("不要关掉「智能应用控制」");
    expect(parentGuide).toContain("最近的 Windows 更新允许不重装系统就重新打开");
    expect(parentGuide).toContain("请改用网页版");
    expect(parentGuide).toContain(faq);
    expect(readme).not.toContain("关掉之后就不能再打开");
    expect(readme).toContain("不要关闭智能应用控制");
    expect(readme).toContain("无需重装系统");
    expect(readme).toContain("请改用网页版");
    expect(readme).toContain(faqZhCn);
  });

  it("adds the three plain Mac steps", () => {
    expect(parentGuide).toContain("第一次被拦时点「完成」，别点「移到废纸篓」");
    expect(parentGuide).toContain("点了「仍要打开」之后，还要再确认一次");
    expect(parentGuide).toContain("「资源库」默认是隐藏的，可以按 ⇧⌘G 打开");
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isDesktopProtocol, isDesktopShell, pinNoteParts, shellCopy } from "./host-copy";
import { SAVE_KEY } from "./storage";

describe("shell copy", () => {
  it("keeps 浏览器 on the web and says 这台电脑 in the desktop shell", () => {
    const web = shellCopy(false);
    const desktop = shellCopy(true);
    expect(web.clearCacheLabel).toBe("清除这台电脑上的存档");
    expect(web.saveCacheNotice).toBe("进度只缓存在这台浏览器里，清掉站点数据就会消失。它不是服务器上的正式存档。");
    expect(web.gradeGateNote).toContain("清掉浏览器数据后要重新设置");
    expect(web.dailyGoalNote).toContain("清掉浏览器数据后要重新设置");

    expect(desktop.clearCacheLabel).toBe("清除这台电脑上的存档");
    expect(SAVE_KEY).toBe("lexiquest.save.v1");
    const guide = readFileSync(new URL("../game/scenes/GuideScene.ts", import.meta.url), "utf8");
    expect(guide).toContain("再按一次，清除这台电脑上的存档");
    expect(guide).toContain("shellCopy(isDesktopShell()).clearCacheLabel");
    expect(desktop.saveCacheNotice).toBe("进度只缓存在这台电脑里，清掉游戏数据就会消失。它不是服务器上的正式存档。");
    expect(desktop.saveCacheNotice).not.toContain("站点数据");
    expect(web.saveCacheNotice).toContain("站点数据");
    expect(web.pinNote).toBe("用来避免孩子不小心改掉年级和每日目标。清掉这台浏览器的数据后要重新设置。这不是安全登录。");
    expect(desktop.pinNote).toBe("用来避免孩子不小心改掉年级和每日目标。清掉这台电脑的数据后要重新设置。这不是安全登录。");
    expect(desktop.gradeGateNote).toContain("清掉这台电脑上的数据后要重新设置");
    expect(desktop.dailyGoalNote).toContain("清掉这台电脑上的数据后要重新设置");
    for (const text of Object.values(desktop)) {
      expect(text).not.toContain("浏览器");
      expect(text).toContain("这台电脑");
    }
    const parts = pinNoteParts(true);
    expect(parts.word).toBe("这台电脑");
    expect(`${parts.before}${parts.word}${parts.after}`).toBe(desktop.pinNote);
    expect(pinNoteParts(false).word).toBe("浏览器");
  });

  it("treats only the app protocol as the desktop shell", () => {
    expect(isDesktopProtocol("app:")).toBe(true);
    expect(isDesktopProtocol("http:")).toBe(false);
    expect(isDesktopProtocol("https:")).toBe(false);
    expect(isDesktopProtocol(undefined)).toBe(false);
    expect(isDesktopShell()).toBe(false);
  });
});

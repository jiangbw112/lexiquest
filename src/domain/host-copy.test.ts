import { describe, expect, it } from "vitest";
import { isDesktopProtocol, isDesktopShell, shellCopy } from "./host-copy";

describe("shell copy", () => {
  it("keeps 浏览器 on the web and says 这台电脑 in the desktop shell", () => {
    const web = shellCopy(false);
    const desktop = shellCopy(true);
    expect(web.clearCacheLabel).toBe("清除这台浏览器的缓存");
    expect(web.saveCacheNotice).toBe("进度只缓存在这台浏览器里，清掉站点数据就会消失。它不是服务器上的正式存档。");
    expect(web.gradeGateNote).toContain("清掉浏览器数据后要重新设置");
    expect(web.dailyGoalNote).toContain("清掉浏览器数据后要重新设置");

    expect(desktop.clearCacheLabel).toBe("清除这台电脑的缓存");
    expect(desktop.saveCacheNotice).toBe("进度只缓存在这台电脑里，清掉站点数据就会消失。它不是服务器上的正式存档。");
    expect(desktop.gradeGateNote).toContain("清掉这台电脑上的数据后要重新设置");
    expect(desktop.dailyGoalNote).toContain("清掉这台电脑上的数据后要重新设置");
    for (const text of Object.values(desktop)) {
      expect(text).not.toContain("浏览器");
      expect(text).toContain("这台电脑");
    }
  });

  it("treats only the app protocol as the desktop shell", () => {
    expect(isDesktopProtocol("app:")).toBe(true);
    expect(isDesktopProtocol("http:")).toBe(false);
    expect(isDesktopProtocol("https:")).toBe(false);
    expect(isDesktopProtocol(undefined)).toBe(false);
    expect(isDesktopShell()).toBe(false);
  });
});

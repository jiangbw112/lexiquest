/**
 * 原来：src/domain/host-copy.ts 只有浏览器和桌面两支，shellCopy(false) 会写出「浏览器」。
 * 现在：微信构建把那个模块指到这里。desktop 仍走桌面原文。false 走微信宿主词，句子结构沿用网页那一支。
 * 为什么：不能改 src。宿主词只替换「浏览器 / 站点数据 / 这台电脑」，不改规则，不加新玩法。
 */

export interface ShellCopy {
  clearCacheLabel: string;
  saveCacheNotice: string;
  gradeGateNote: string;
  dailyGoalNote: string;
  pinNote: string;
}

const WECHAT_COPY: ShellCopy = {
  clearCacheLabel: "清除微信里的存档",
  saveCacheNotice: "进度只缓存在微信里，清掉小程序数据就会消失。它不是服务器上的正式存档。",
  gradeGateNote: "改年级和改每日目标前要先输入家长密码。这是为了避免孩子不小心改掉。清掉小程序数据后要重新设置。这不是安全登录。",
  dailyGoalNote:
    "每天的学习目标按这台设备的当地日期换一天。完成目标只加一枚外观代币，不改战斗数值。改档和改年级共用一个家长密码，只为避免孩子不小心修改。清掉小程序数据后要重新设置。这不是安全登录。忘记密码时答一道算术题即可重设，学习记录不会被清掉。",
  pinNote: "用来避免孩子不小心改掉年级和每日目标。清掉微信的数据后要重新设置。这不是安全登录。",
};

const DESKTOP_COPY: ShellCopy = {
  clearCacheLabel: "清除这台电脑上的存档",
  saveCacheNotice: "进度只缓存在这台电脑里，清掉游戏数据就会消失。它不是服务器上的正式存档。",
  gradeGateNote: "改年级和改每日目标前要先输入家长密码。这是为了避免孩子不小心改掉。清掉这台电脑上的数据后要重新设置。这不是安全登录。",
  dailyGoalNote:
    "每天的学习目标按这台电脑的当地日期换一天。完成目标只加一枚外观代币，不改战斗数值。改档和改年级共用一个家长密码，只为避免孩子不小心修改。清掉这台电脑上的数据后要重新设置。这不是安全登录。忘记密码时答一道算术题即可重设，学习记录不会被清掉。",
  pinNote: "用来避免孩子不小心改掉年级和每日目标。清掉这台电脑的数据后要重新设置。这不是安全登录。",
};

export function pinKeepWord(desktop: boolean): string {
  return desktop ? "这台电脑" : "微信";
}

export function pinNoteParts(desktop: boolean): { before: string; word: string; after: string } {
  const word = pinKeepWord(desktop);
  const note = shellCopy(desktop).pinNote;
  const at = note.indexOf(word);
  return { before: note.slice(0, at), word, after: note.slice(at + word.length) };
}

export function shellCopy(desktop: boolean): ShellCopy {
  return desktop ? DESKTOP_COPY : WECHAT_COPY;
}

export function isDesktopProtocol(protocol: string | undefined): boolean {
  return protocol === "app:";
}

export function isDesktopShell(): boolean {
  if (typeof location === "undefined") return false;
  return isDesktopProtocol(location.protocol);
}

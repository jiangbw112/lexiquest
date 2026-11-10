/** Web keeps the browser wording. The desktop shell says 这台电脑. */
export interface ShellCopy {
  clearCacheLabel: string;
  saveCacheNotice: string;
  gradeGateNote: string;
  dailyGoalNote: string;
}

const WEB_COPY: ShellCopy = {
  clearCacheLabel: "清除这台浏览器的缓存",
  saveCacheNotice: "进度只缓存在这台浏览器里，清掉站点数据就会消失。它不是服务器上的正式存档。",
  gradeGateNote: "改年级和改每日目标前要先输入家长密码。这是为了避免孩子不小心改掉。清掉浏览器数据后要重新设置。这不是安全登录。",
  dailyGoalNote:
    "每天的学习目标按这台电脑的当地日期换一天。完成目标只加一枚外观代币，不改战斗数值。改档和改年级共用一个家长密码，只为避免孩子不小心修改。清掉浏览器数据后要重新设置。这不是安全登录。忘记密码时答一道算术题即可重设，学习记录不会被清掉。",
};

const DESKTOP_COPY: ShellCopy = {
  clearCacheLabel: "清除这台电脑的缓存",
  saveCacheNotice: "进度只缓存在这台电脑里，清掉站点数据就会消失。它不是服务器上的正式存档。",
  gradeGateNote: "改年级和改每日目标前要先输入家长密码。这是为了避免孩子不小心改掉。清掉这台电脑上的数据后要重新设置。这不是安全登录。",
  dailyGoalNote:
    "每天的学习目标按这台电脑的当地日期换一天。完成目标只加一枚外观代币，不改战斗数值。改档和改年级共用一个家长密码，只为避免孩子不小心修改。清掉这台电脑上的数据后要重新设置。这不是安全登录。忘记密码时答一道算术题即可重设，学习记录不会被清掉。",
};

export function shellCopy(desktop: boolean): ShellCopy {
  return desktop ? DESKTOP_COPY : WEB_COPY;
}

export function isDesktopProtocol(protocol: string | undefined): boolean {
  return protocol === "app:";
}

/** True inside the packaged app. The page origin is app://lexiquest/. */
export function isDesktopShell(): boolean {
  if (typeof location === "undefined") return false;
  return isDesktopProtocol(location.protocol);
}

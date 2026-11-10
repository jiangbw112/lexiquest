import path from "node:path";

/** Folder name for userData. Stays lowercase even when productName is LexiQuest. */
export const APP_DATA_NAME = "lexiquest";

/**
 * Electron's usual userData directory for `APP_DATA_NAME`.
 * Windows uses the APPDATA folder when it is set. Linux uses XDG_CONFIG_HOME.
 */
export function userDataPath({ platform, home, appData, configHome }) {
  if (platform === "win32") {
    const base = appData || path.win32.join(home, "AppData", "Roaming");
    return path.win32.join(base, APP_DATA_NAME);
  }
  if (platform === "darwin") {
    return path.posix.join(home, "Library", "Application Support", APP_DATA_NAME);
  }
  const base = configHome || path.posix.join(home, ".config");
  return path.posix.join(base, APP_DATA_NAME);
}

/** `--user-data-dir` from the smoke test wins, so that run does not touch the real save. */
export function userDataDirFromArgs(argv, fallback) {
  const flag = "--user-data-dir";
  const index = argv.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (index === -1) return fallback;
  const arg = argv[index] ?? "";
  if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  return argv[index + 1] ?? fallback;
}

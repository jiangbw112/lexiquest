import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { APP_DATA_NAME, userDataDirFromArgs, userDataPath } from "./app-identity.mjs";

describe("desktop userData", () => {
  it("keeps the save folder named lexiquest after productName is LexiQuest", () => {
    expect(APP_DATA_NAME).toBe("lexiquest");
    expect(userDataPath({ platform: "win32", home: "C:\\Users\\parent", appData: "C:\\Users\\parent\\AppData\\Roaming" })).toBe(
      "C:\\Users\\parent\\AppData\\Roaming\\lexiquest",
    );
    expect(userDataPath({ platform: "darwin", home: "/Users/parent" })).toBe(
      "/Users/parent/Library/Application Support/lexiquest",
    );
    expect(userDataPath({ platform: "linux", home: "/home/parent" })).toBe("/home/parent/.config/lexiquest");
    expect(userDataPath({ platform: "linux", home: "/home/parent", configHome: "/home/parent/cfg" })).toBe(
      "/home/parent/cfg/lexiquest",
    );
  });

  it("honors an explicit user-data-dir and otherwise uses the pinned folder", () => {
    const pinned = userDataPath({ platform: "linux", home: "/home/parent" });
    expect(userDataDirFromArgs(["lexiquest"], pinned)).toBe(pinned);
    expect(userDataDirFromArgs(["lexiquest", "--user-data-dir=/tmp/smoke"], pinned)).toBe("/tmp/smoke");
    expect(userDataDirFromArgs(["lexiquest", "--user-data-dir", "/tmp/smoke"], pinned)).toBe("/tmp/smoke");
  });

  it("pins the name before the app is ready", () => {
    const main = fs.readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
    const builder = fs.readFileSync(new URL("./builder.yml", import.meta.url), "utf8");
    const setName = main.indexOf("app.setName(APP_DATA_NAME)");
    const setPath = main.indexOf('app.setPath(\n  "userData"');
    const ready = main.indexOf("app.whenReady");
    expect(setName).toBeGreaterThan(-1);
    expect(setPath).toBeGreaterThan(setName);
    expect(ready).toBeGreaterThan(setPath);
    expect(builder).toContain("productName: LexiQuest");
    expect(builder).not.toContain("signAndEditExecutable");
  });
});

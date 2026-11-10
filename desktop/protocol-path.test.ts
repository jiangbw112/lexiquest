import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_ORIGIN,
  CONTENT_SECURITY_POLICY,
  appHost,
  appPathname,
  classifyAppPath,
  isAllowedAppUrl,
} from "./protocol-path.mjs";

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function makeWebRoot(): { base: string; root: string; sibling: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "lexiquest-protocol-"));
  scratch.push(base);
  const root = path.join(base, "web");
  const sibling = path.join(base, "web-rel");
  fs.mkdirSync(root);
  fs.mkdirSync(sibling);
  fs.writeFileSync(path.join(root, "index.html"), "<p>ok</p>");
  fs.writeFileSync(path.join(root, "secret.txt"), "inside");
  fs.writeFileSync(path.join(sibling, "secret.txt"), "outside");
  return { base, root, sibling };
}

describe("app protocol paths", () => {
  it("serves a normal file and the directory index", () => {
    const { root } = makeWebRoot();
    const page = classifyAppPath(root, "/index.html");
    expect(page.status).toBe(200);
    expect(page.file).toBe(path.join(root, "index.html"));
    expect(classifyAppPath(root, "/").file).toBe(path.join(root, "index.html"));
    expect(classifyAppPath(root, "/assets/../index.html").status).toBe(200);
  });

  it("returns 404 when the file is inside the root but missing", () => {
    const { root } = makeWebRoot();
    expect(classifyAppPath(root, "/missing.png").status).toBe(404);
  });

  it("rejects .. traversal", () => {
    const { root, sibling } = makeWebRoot();
    const escaped = classifyAppPath(root, "/../web-rel/secret.txt");
    expect(escaped.status).toBe(403);
    expect(escaped.file).toBeUndefined();
    expect(fs.readFileSync(path.join(sibling, "secret.txt"), "utf8")).toBe("outside");
  });

  it("rejects a sibling directory that shares the root prefix", () => {
    const { root } = makeWebRoot();
    const naive = path.resolve(root, "../web-rel/secret.txt");
    expect(naive.startsWith(root)).toBe(true);
    expect(naive.startsWith(root + path.sep)).toBe(false);
    expect(classifyAppPath(root, "/../web-rel/secret.txt").status).toBe(403);
  });

  it("rejects encoded %2e%2e before the URL parser can collapse it", () => {
    const { root } = makeWebRoot();
    const raw = appPathname("app://lexiquest/%2e%2e/%2e%2e/secret.txt");
    expect(raw).toBe("/%2e%2e/%2e%2e/secret.txt");
    expect(new URL("app://lexiquest/%2e%2e/%2e%2e/secret.txt").pathname).toBe("/secret.txt");
    expect(classifyAppPath(root, raw).status).toBe(403);
    expect(classifyAppPath(root, "/%2E%2E/web-rel/secret.txt").status).toBe(403);
    expect(classifyAppPath(root, "/secret.txt").status).toBe(200);
  });

  it("rejects a symlink that points out of the root", () => {
    const { root, sibling } = makeWebRoot();
    fs.symlinkSync(path.join(sibling, "secret.txt"), path.join(root, "linked.txt"));
    expect(classifyAppPath(root, "/linked.txt").status).toBe(403);
  });

  it("allows only app://lexiquest/ navigation", () => {
    expect(isAllowedAppUrl(`${APP_ORIGIN}/`)).toBe(true);
    expect(isAllowedAppUrl(`${APP_ORIGIN}/index.html`)).toBe(true);
    expect(isAllowedAppUrl(APP_ORIGIN)).toBe(false);
    expect(isAllowedAppUrl("app://other/")).toBe(false);
    expect(isAllowedAppUrl("https://example.com/")).toBe(false);
    expect(isAllowedAppUrl("file:///etc/passwd")).toBe(false);
    expect(appHost("app://lexiquest/index.html")).toBe("lexiquest");
    expect(appHost("app://other/index.html")).toBe("other");
  });

  it("publishes the strict content security policy", () => {
    expect(CONTENT_SECURITY_POLICY).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
  });

  it("keeps the packaged shell locked down", () => {
    const main = fs.readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
    const builder = fs.readFileSync(new URL("./builder.yml", import.meta.url), "utf8");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("sandbox: true");
    expect(main).toContain("webSecurity: true");
    expect(main).toContain('action: "deny"');
    expect(main).toContain("will-navigate");
    expect(main).toContain("will-redirect");
    expect(main).toContain("setPermissionRequestHandler");
    expect(main).toContain("setPermissionCheckHandler");
    expect(main).toContain("Menu.setApplicationMenu(null)");
    expect(main).toContain("devTools: !app.isPackaged");
    expect(main).toContain("standard: true");
    expect(main).toContain("secure: true");
    expect(main).toContain("supportFetchAPI: true");
    expect(main).toContain("width: CONTENT_WIDTH");
    expect(main).toContain("height: CONTENT_HEIGHT");
    expect(main).toContain("useContentSize: true");
    expect(main).not.toContain("openDevTools");
    expect(builder).toContain('identity: "-"');
    expect(builder).toContain("deleteAppDataOnUninstall: false");
    expect(builder).toContain("signAndEditExecutable: false");
    expect(builder).toContain("runAsNode: false");
    expect(builder).toContain("enableNodeCliInspectArguments: false");
    expect(builder).toContain("enableNodeOptionsEnvironmentVariable: false");
    expect(builder).toContain("onlyLoadAppFromAsar: true");
  });
});

import { app, BrowserWindow, Menu, protocol, session } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_HOST,
  APP_ORIGIN,
  appHost,
  appPathname,
  appResponseHeaders,
  classifyAppPath,
  contentType,
  isAllowedAppUrl,
} from "./protocol-path.mjs";

const CONTENT_WIDTH = 1280;
const CONTENT_HEIGHT = 800;
const MIN_WIDTH = 1024;
const MIN_HEIGHT = 640;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

function webRoot() {
  return path.join(app.getAppPath(), "dist");
}

function preloadPath() {
  return path.join(path.dirname(fileURLToPath(import.meta.url)), "preload.mjs");
}

function textResponse(status) {
  const body = status === 403 ? "forbidden" : status === 400 ? "bad request" : "not found";
  return new Response(body, { status, headers: appResponseHeaders("text/plain; charset=utf-8") });
}

function handleAppRequest(request) {
  if (appHost(request.url) !== APP_HOST) return textResponse(403);
  const result = classifyAppPath(webRoot(), appPathname(request.url));
  if (result.status !== 200 || !result.file) return textResponse(result.status);
  try {
    const bytes = fs.readFileSync(result.file);
    return new Response(bytes, { status: 200, headers: appResponseHeaders(contentType(result.file)) });
  } catch {
    return textResponse(404);
  }
}

function lockContents(contents) {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    if (!isAllowedAppUrl(url)) event.preventDefault();
  });
  contents.on("will-redirect", (event, url) => {
    if (!isAllowedAppUrl(url)) event.preventDefault();
  });
}

function denyPermissions() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow() {
  const win = new BrowserWindow({
    width: CONTENT_WIDTH,
    height: CONTENT_HEIGHT,
    useContentSize: true,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: "#143d2c",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: !app.isPackaged,
    },
  });
  lockContents(win.webContents);
  win.loadURL(`${APP_ORIGIN}/`);
  return win;
}

app.on("web-contents-created", (_event, contents) => {
  lockContents(contents);
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  protocol.handle("app", handleAppRequest);
  denyPermissions();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

import fs from "node:fs";
import path from "node:path";

export const APP_HOST = "lexiquest";
export const APP_ORIGIN = "app://lexiquest";

/** Sent on every protocol response, including 403 and 404. */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

/** Navigation is allowed only for this origin with a path. `app://lexiquest` alone is not enough. */
export function isAllowedAppUrl(url) {
  return typeof url === "string" && url.startsWith(`${APP_ORIGIN}/`);
}

/** Host from the raw request URL, without URL-parser path collapsing. */
export function appHost(requestUrl) {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/.exec(requestUrl);
  return match?.[1] ?? "";
}

/**
 * Path from the raw request URL. `new URL().pathname` collapses `%2e%2e`, so the
 * traversal check has to see the bytes the client actually sent.
 */
export function appPathname(requestUrl) {
  const match = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*([^?#]*)/.exec(requestUrl);
  if (!match) return "/";
  const pathname = match[1] || "/";
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function contentType(file) {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

export function appResponseHeaders(type) {
  return {
    "Content-Type": type,
    "Content-Security-Policy": CONTENT_SECURITY_POLICY,
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Map a request path onto a file inside `root`.
 * The path is decoded and normalized first. It must then sit at `root` or under
 * `root + sep`. A plain `startsWith(root)` would also accept a sibling such as
 * `web-rel` when `root` is `web`.
 * Outside the root is 403. A missing file is 404. A broken escape is 400.
 */
function anchoredRoot(root) {
  const resolved = path.resolve(root);
  try {
    return fs.realpathSync(resolved);
  } catch {
    // Packaged files live in app.asar. Electron can read them, but realpath
    // does not always resolve an asar path. A real directory is still safe to use.
    try {
      if (fs.statSync(resolved).isDirectory()) return resolved;
    } catch {
      return null;
    }
    return null;
  }
}

export function classifyAppPath(root, pathname) {
  const rootResolved = anchoredRoot(root);
  if (!rootResolved) return { status: 404 };
  const prefix = rootResolved + path.sep;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { status: 400 };
  }
  if (decoded.includes("\0")) return { status: 400 };
  const relative = path.normalize(decoded.replace(/^[/\\]+/, ""));
  if (path.isAbsolute(relative)) return { status: 403 };
  const resolved = path.resolve(rootResolved, relative === "" ? "." : relative);
  if (!isInsideRoot(rootResolved, prefix, resolved)) return { status: 403 };
  return serveFile(rootResolved, prefix, resolved);
}

function isInsideRoot(rootResolved, prefix, file) {
  return file === rootResolved || file.startsWith(prefix);
}

function serveFile(rootResolved, prefix, file) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return { status: 404 };
  }
  if (stat.isSymbolicLink()) {
    let real;
    try {
      real = fs.realpathSync(file);
    } catch {
      return { status: 404 };
    }
    if (!isInsideRoot(rootResolved, prefix, real)) return { status: 403 };
    return serveFile(rootResolved, prefix, real);
  }
  if (stat.isDirectory()) {
    const index = path.join(file, "index.html");
    if (!isInsideRoot(rootResolved, prefix, index)) return { status: 403 };
    return serveFile(rootResolved, prefix, index);
  }
  if (!stat.isFile()) return { status: 404 };
  if (!isInsideRoot(rootResolved, prefix, file)) return { status: 403 };
  return { status: 200, file };
}

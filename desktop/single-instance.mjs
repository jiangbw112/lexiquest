/**
 * One desktop process owns the save file.
 * A second launch must quit before it can open another window and overwrite that save.
 */

/** Bring the window that already holds the save to the front. */
export function focusExistingWindow(win) {
  if (!win) return;
  if (typeof win.isDestroyed === "function" && win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/**
 * `hasLock` is the result of `app.requestSingleInstanceLock()`.
 * The loser quits immediately. The owner listens for a later launch and focuses its window.
 * `getWindow` runs when the second launch happens, so the window created after ready is the one focused.
 */
export function bindSingleInstance(app, hasLock, getWindow) {
  if (!hasLock) {
    app.quit();
    return false;
  }
  app.on("second-instance", () => {
    focusExistingWindow(getWindow());
  });
  return true;
}

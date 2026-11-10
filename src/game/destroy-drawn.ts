/** A scene child that may still own a pointer hit after it leaves the display list. */
export interface DrawnNode {
  destroy(): void;
  disableInteractive?(): void;
}

/**
 * Phaser's display-list `removeAll(true)` skips the remove callback and does not
 * destroy. The object leaves the screen and keeps its hit area. Destroy after
 * turning input off, which is what makes a hidden control ignore clicks and
 * leave the cursor at default.
 */
export function destroyDrawn(nodes: readonly DrawnNode[]): void {
  for (const node of [...nodes]) {
    node.disableInteractive?.();
    node.destroy();
  }
}

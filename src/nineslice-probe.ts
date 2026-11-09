import Phaser from "phaser";

interface ProbeSlice {
  vertices: { u: number; v: number }[];
}

function signature(slice: Phaser.GameObjects.NineSlice): string {
  return (slice as unknown as ProbeSlice).vertices
    .slice(0, 12)
    .map((vertex) => `${vertex.u.toFixed(4)},${vertex.v.toFixed(4)}`)
    .join(";");
}

class ProbeScene extends Phaser.Scene {
  constructor() {
    super("probe");
  }

  preload(): void {
    this.load.atlas("atlas_ui_core", "/assets/warm/atlas/atlas_ui_core.png", "/assets/warm/atlas/atlas_ui_core.json");
  }

  create(): void {
    const slice = this.add.nineslice(400, 300, "atlas_ui_core", "btn_primary_normal", 560, 112, 32, 32, 30, 40);
    const before = { width: slice.width, height: slice.height, frame: slice.frame.name, uv: signature(slice) };
    slice.setFrame("btn_primary_hover");
    const afterSetFrame = { width: slice.width, height: slice.height, frame: slice.frame.name, uv: signature(slice) };
    slice.updateUVs();
    const afterUpdateUVs = { width: slice.width, height: slice.height, frame: slice.frame.name, uv: signature(slice) };
    const result = {
      phaser: Phaser.VERSION,
      renderer: this.game.renderer.type,
      before,
      afterSetFrame,
      afterUpdateUVs,
      sizeKept: before.width === afterSetFrame.width && before.height === afterSetFrame.height,
      frameChanged: afterSetFrame.frame === "btn_primary_hover",
      uvsChangedOnSetFrame: before.uv !== afterSetFrame.uv,
      uvsChangedAfterUpdateUVs: afterSetFrame.uv !== afterUpdateUVs.uv,
    };
    window.__NINE__ = result;
    const out = document.getElementById("out");
    if (out) out.textContent = JSON.stringify(result);
  }
}

declare global {
  interface Window {
    __NINE__?: unknown;
  }
}

new Phaser.Game({
  type: Phaser.WEBGL,
  render: { failIfMajorPerformanceCaveat: false },
  width: 800,
  height: 600,
  parent: "game",
  backgroundColor: "#143d2c",
  scene: [ProbeScene],
});

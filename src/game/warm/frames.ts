/** Resting tab label, in logical pixels. Pressed text sits 2 below this. */
export const TAB_LABEL_Y = -2;

export const BOSS_NODE_ORIGIN = { x: 0.5, y: 142 / 300 } as const;

export type TabPointer = "normal" | "hover" | "pressed";

/**
 * Unselected tabs use normal, hover, and pressed frames.
 * A selected tab stays on tab_selected, including while it is held down.
 * Releasing a press selects the tab.
 */
export function tabFrame(selected: boolean, pointer: TabPointer | "released"): string {
  if (selected || pointer === "released") return "tab_selected";
  return `tab_${pointer}`;
}

export function tabLabelY(selected: boolean, pointer: TabPointer | "released"): number {
  if (!selected && pointer === "pressed") return TAB_LABEL_Y + 2;
  return TAB_LABEL_Y;
}

/** Locked boss nodes keep the lock frame. An open or cleared boss uses the ready frame. */
export function bossMapFrame(status: "locked" | "open" | "cleared" | "skipped"): "map_node_boss" | "map_node_boss_ready" {
  return status === "locked" ? "map_node_boss" : "map_node_boss_ready";
}

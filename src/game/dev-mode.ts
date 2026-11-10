import { parchmentTitleY } from "./layout";

/** Technical review only. Players do not get this unless the page URL has `?dev=1`. */
export function devModeEnabled(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("dev") === "1";
}

export type ReviewClockCommand = "advance-10m" | "advance-1d" | "reset";

const CLOCK_MS = {
  "advance-10m": 10 * 60 * 1000,
  "advance-1d": 24 * 60 * 60 * 1000,
} as const;

/** Time-skip keys do nothing unless dev mode is on. Other keys are not clock commands. */
export function reviewClockCommand(code: string, dev: boolean): ReviewClockCommand | null {
  if (!dev) return null;
  if (code === "KeyT") return "advance-10m";
  if (code === "KeyY") return "advance-1d";
  if (code === "KeyR") return "reset";
  return null;
}

export function reviewClockDelta(command: Exclude<ReviewClockCommand, "reset">): number {
  return CLOCK_MS[command];
}

/** Hourglass row is omitted when dev is off, and the word list moves up into that space. */
export function reviewDeskLayout(dev: boolean): {
  titleY: number;
  subtitleY: number;
  clockY: number;
  bodyY: number;
} {
  const titleY = parchmentTitleY(400, 740);
  const subtitleY = titleY + 46;
  const clockY = titleY + 102;
  const bodyY = dev ? clockY + 48 : subtitleY + 40;
  return { titleY, subtitleY, clockY, bodyY };
}

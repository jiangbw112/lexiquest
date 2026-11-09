export interface ProbeSnapshot {
  scene: string;
  lastEvent: string;
  events: string[];
  battlePhase: string | null;
  learned: number;
  equippedSkills: number;
  audioUnlocked: boolean;
  hidden: boolean;
  bootMs: number | null;
  fps: number | null;
  heapBytes: number | null;
}

const snapshot: ProbeSnapshot = {
  scene: "boot",
  lastEvent: "boot",
  events: [],
  battlePhase: null,
  learned: 0,
  equippedSkills: 0,
  audioUnlocked: false,
  hidden: false,
  bootMs: null,
  fps: null,
  heapBytes: null,
};

let counts = (): Pick<ProbeSnapshot, "learned" | "equippedSkills"> => ({ learned: 0, equippedSkills: 0 });

export function probeEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_E2E === "1";
}

export function setProbeProvider(provider: () => Pick<ProbeSnapshot, "learned" | "equippedSkills">): void {
  counts = provider;
}

export function probeQuestion(answerId: string, choiceIds: readonly string[]): void {
  probeNote(`q:${answerId}:${choiceIds.join(",")}`);
}

export function probeEnter(scene: string): void {
  const extra = counts();
  snapshot.scene = scene;
  snapshot.learned = extra.learned;
  snapshot.equippedSkills = extra.equippedSkills;
  snapshot.battlePhase = scene === "battle" ? snapshot.battlePhase : null;
  probeNote(`scene:${scene}`);
}

export function probeNote(event: string, extra: Partial<ProbeSnapshot> = {}): void {
  snapshot.lastEvent = event;
  snapshot.events = [...snapshot.events, event].slice(-40);
  Object.assign(snapshot, extra);
  if (!probeEnabled() || typeof document === "undefined") return;
  const node = document.getElementById("lexi-probe");
  if (node) node.textContent = JSON.stringify(snapshot);
  window.__LEXIQUEST__ = { ...snapshot, events: [...snapshot.events] };
}

declare global {
  interface Window {
    __LEXIQUEST__?: ProbeSnapshot;
  }
}

import type Phaser from "phaser";

export interface BattleShotRead {
  playerHp: number;
  enemyHp: number;
  displayPlayerHp: number;
  displayEnemyHp: number;
  playerHpBefore: number;
  enemyHpBefore: number;
  playerX: number;
  enemyX: number;
  floaters: readonly string[];
  lunging: boolean;
  phase: string;
  deltas: readonly { target: "player" | "enemy"; amount: number }[];
}

export interface BattleShotControls {
  act(type: "attack" | "block" | "heal"): void;
  answer(correct: boolean): void;
}

export interface BattleShotHandle {
  onShown(kind: string): void;
  holds(): boolean;
}

interface BattleShotApi {
  pauseOnHit: boolean;
  lastShown: string | null;
  read: BattleShotRead | null;
  resume(): void;
  setTimeScale(scale: number): void;
  snapshot(): BattleShotRead;
  act(type: "attack" | "block" | "heal"): void;
  answer(correct: boolean): void;
}

declare global {
  interface Window {
    __LEXI_BATTLE_SHOT__?: BattleShotApi;
  }
}

/**
 * Dev-server only. `?shot=1` freezes time on each hit so a screenshot can catch
 * the lunge apex and the floater. `?shot=play` slows tweens for a recording.
 * Production builds replace `import.meta.env.DEV` with false and drop this body.
 */
export function attachBattleShot(
  scene: Phaser.Scene,
  read: () => BattleShotRead,
  controls: BattleShotControls,
): BattleShotHandle | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const shot = new URLSearchParams(window.location.search).get("shot");
  const api: BattleShotApi = {
    pauseOnHit: shot === "1",
    lastShown: null,
    read: null,
    resume() {
      scene.time.timeScale = 1;
      scene.tweens.timeScale = 1;
    },
    setTimeScale(scale: number) {
      scene.time.timeScale = scale;
      scene.tweens.timeScale = scale;
    },
    snapshot() {
      return read();
    },
    act(type) {
      controls.act(type);
    },
    answer(correct) {
      controls.answer(correct);
    },
  };
  if (shot === "play") api.setTimeScale(0.35);
  window.__LEXI_BATTLE_SHOT__ = api;
  return {
    onShown(kind: string) {
      api.lastShown = kind;
      api.read = read();
      if (api.pauseOnHit) api.setTimeScale(0);
    },
    holds() {
      return api.pauseOnHit;
    },
  };
}

/**
 * 原来：src/game/audio.ts 用 WebAudio 振荡器，并在页面隐藏时 pause。
 * 现在：有 wx.createInnerAudioContext 时用 4 个短音槽和一个循环 BGM。没有 wx 时仍用 WebAudio。
 * 为什么：场景只调 blip() 和 installRuntime。失败写到 game.failures，不静默。
 */

type GameLike = {
  canvas?: { addEventListener?: (event: string, fn: () => void) => void };
  sound: {
    pauseOnBlur: boolean;
    locked: boolean;
    context?: { state: string; resume: () => Promise<void> };
    pauseAll: () => void;
    resumeAll: () => void;
  };
  loop: { sleep: () => void; wake: (fromSleep?: boolean) => void };
  failures: string[];
};

type InnerAudio = {
  src: string;
  loop: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  onError: (fn: (err: { errMsg?: string }) => void) => void;
};

type WxAudio = {
  createInnerAudioContext: () => InnerAudio;
};

let active: GameLike | null = null;
let pool: InnerAudio[] = [];
let poolAt = 0;
let bgm: InnerAudio | null = null;
let bgmWasPlaying = false;

function wxAudio(): WxAudio | null {
  const wx = (globalThis as { wx?: WxAudio }).wx;
  if (!wx || typeof wx.createInnerAudioContext !== "function") return null;
  return wx;
}

export function installRuntime(game: GameLike): void {
  active = game;
  game.sound.pauseOnBlur = true;
  const wx = wxAudio();
  if (wx) {
    pool = [0, 1, 2, 3].map(() => wx.createInnerAudioContext());
    bgm = wx.createInnerAudioContext();
    bgm.loop = true;
    for (const audio of [...pool, bgm]) {
      audio.onError((err) => {
        game.failures.push(`audio: ${err?.errMsg || "inner audio failed"}`);
      });
    }
  }
  const unlock = () => {
    game.sound.locked = false;
    const context = game.sound.context;
    if (context?.state === "suspended") void context.resume();
  };
  game.canvas?.addEventListener?.("pointerdown", unlock);
  const doc = (globalThis as { document?: { addEventListener?: (event: string, fn: () => void) => void; hidden?: boolean } }).document;
  doc?.addEventListener?.("visibilitychange", () => {
    if (doc.hidden) {
      game.loop.sleep();
      game.sound.pauseAll();
      if (bgm) {
        bgmWasPlaying = true;
        bgm.pause();
      }
      return;
    }
    game.loop.wake(true);
    if (bgm && bgmWasPlaying) bgmWasPlaying = false;
  });
}

export function blip(): void {
  const game = active;
  if (!game) return;
  const wx = wxAudio();
  if (wx && pool.length) {
    const audio = pool[poolAt % pool.length];
    poolAt += 1;
    audio.src = "/assets/audio/tap.wav";
    audio.loop = false;
    audio.stop();
    audio.play();
    return;
  }
  const context = game.sound.context as
    | {
        state: string;
        createOscillator: () => { frequency: { value: number }; connect: (node: unknown) => void; start: () => void; stop: (when: number) => void };
        createGain: () => { gain: { value: number }; connect: (node: unknown) => void };
        destination: unknown;
        currentTime: number;
      }
    | undefined;
  if (!context || context.state !== "running") return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.frequency.value = 620;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start();
  osc.stop(context.currentTime + 0.05);
}

export function playBgm(src: string): void {
  if (!bgm || !active) return;
  bgm.src = src;
  bgm.loop = true;
  bgm.play();
  bgmWasPlaying = true;
}

export function pauseBgm(): void {
  bgm?.pause();
  bgmWasPlaying = false;
}

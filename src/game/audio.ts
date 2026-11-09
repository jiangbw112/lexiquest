import Phaser from "phaser";
import { probeNote } from "./probe";

let activeGame: Phaser.Game | null = null;

export function installRuntime(game: Phaser.Game): void {
  activeGame = game;
  game.sound.pauseOnBlur = true;
  const unlock = () => {
    const manager = game.sound as Phaser.Sound.WebAudioSoundManager;
    const context = manager.context;
    if (context?.state === "suspended") void context.resume();
    const running = context ? context.state === "running" : !game.sound.locked;
    probeNote("audio:unlock", { audioUnlocked: running || !game.sound.locked });
  };
  game.canvas.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      game.loop.sleep();
      game.sound.pauseAll();
      probeNote("app:hidden", { hidden: true });
      return;
    }
    game.loop.wake(true);
    game.sound.resumeAll();
    probeNote("app:visible", { hidden: false });
  });
}

export function blip(): void {
  const game = activeGame;
  if (!game) return;
  const context = (game.sound as Phaser.Sound.WebAudioSoundManager).context;
  if (!context || context.state !== "running") return;
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.frequency.value = 620;
  gain.gain.value = 0.03;
  osc.connect(gain);
  gain.connect(context.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.07);
  osc.stop(context.currentTime + 0.08);
}

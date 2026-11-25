/**
 * Phaser 3 easing formulas used by this game.
 * Sine.easeInOut: 0.5 * (1 - cos(pi * v))
 * Quad.easeOut: v * (2 - v)
 * Quad.easeIn: v * v
 * Linear: v
 * Back.easeOut: (--v) * v * ((1.70158 + 1) * v + 1.70158) + 1
 */

export function easeValue(name: string | undefined, t: number): number {
  const v = Math.min(1, Math.max(0, t));
  if (name === "Sine.easeOut") return Math.sin((v * Math.PI) / 2);
  if (name === "Sine.easeInOut") return 0.5 * (1 - Math.cos(Math.PI * v));
  if (name === "Quad.easeOut") return v * (2 - v);
  if (name === "Quad.easeIn") return v * v;
  if (name === "Back.easeOut") {
    const s = 1.70158;
    const x = v - 1;
    return x * x * ((s + 1) * x + s) + 1;
  }
  return v;
}

export interface TweenConfig {
  targets: Record<string, number> | Record<string, number>[];
  duration?: number;
  delay?: number;
  ease?: string;
  yoyo?: boolean;
  repeat?: number;
  onComplete?: () => void;
  [key: string]: unknown;
}

export class Tween {
  elapsed = 0;
  dead = false;
  private repeatsLeft: number;
  private direction = 1;
  private readonly from = new Map<string, number>();
  private readonly keys: string[];

  constructor(readonly config: TweenConfig) {
    this.repeatsLeft = config.repeat ?? 0;
    const target = Array.isArray(config.targets) ? config.targets[0] : config.targets;
    this.keys = Object.keys(config).filter((key) => typeof config[key] === "number" && key in target);
    for (const key of this.keys) this.from.set(key, target[key]);
  }

  isPlaying(): boolean {
    return !this.dead;
  }

  stop(): void {
    this.dead = true;
  }

  step(delta: number): void {
    if (this.dead) return;
    this.elapsed += delta;
    const delay = this.config.delay ?? 0;
    const duration = this.config.duration ?? 0;
    if (this.elapsed < delay) return;
    const raw = duration <= 0 ? 1 : (this.elapsed - delay) / duration;
    const ping = this.direction < 0 ? 1 - Math.min(1, raw) : Math.min(1, raw);
    const eased = easeValue(this.config.ease, ping);
    const targets = Array.isArray(this.config.targets) ? this.config.targets : [this.config.targets];
    for (const target of targets) {
      for (const key of this.keys) {
        const start = this.from.get(key) ?? 0;
        const end = this.config[key] as number;
        target[key] = start + (end - start) * eased;
      }
    }
    if (raw < 1) return;
    if (this.config.yoyo && this.direction > 0) {
      this.direction = -1;
      this.elapsed = delay;
      return;
    }
    if (this.repeatsLeft > 0) {
      this.repeatsLeft -= 1;
      this.direction = 1;
      this.elapsed = delay;
      return;
    }
    this.dead = true;
    this.config.onComplete?.();
  }
}

export class TweenManager {
  timeScale = 1;
  readonly items: Tween[] = [];

  add(config: TweenConfig): Tween {
    const tween = new Tween(config);
    this.items.push(tween);
    return tween;
  }

  killTweensOf(target: object): void {
    for (const tween of this.items) {
      const targets = Array.isArray(tween.config.targets) ? tween.config.targets : [tween.config.targets];
      if (targets.includes(target as Record<string, number>)) tween.dead = true;
    }
  }

  killAll(): void {
    for (const tween of this.items) tween.dead = true;
  }

  step(delta: number): void {
    const scaled = delta * this.timeScale;
    for (const tween of this.items) tween.step(scaled);
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      if (this.items[index].dead) this.items.splice(index, 1);
    }
  }
}

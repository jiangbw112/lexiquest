export interface AnimFrame {
  key: string;
  frame: string;
}

export interface AnimDef {
  key: string;
  frames: AnimFrame[];
  frameRate: number;
  repeat: number;
}

export class AnimationManager {
  private readonly defs = new Map<string, AnimDef>();

  create(config: { key: string; frames: AnimFrame[]; frameRate?: number; repeat?: number }): AnimDef {
    const def: AnimDef = {
      key: config.key,
      frames: config.frames,
      frameRate: config.frameRate ?? 24,
      repeat: config.repeat ?? 0,
    };
    this.defs.set(def.key, def);
    return def;
  }

  exists(key: string): boolean {
    return this.defs.has(key);
  }

  get(key: string): AnimDef | undefined {
    return this.defs.get(key);
  }
}

export class SpritePlayback {
  frameIndex = 0;
  elapsed = 0;
  playing = false;
  repeatsLeft = 0;
  def: AnimDef | null = null;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(private apply: (frame: AnimFrame) => void) {}

  play(def: AnimDef): void {
    this.def = def;
    this.frameIndex = 0;
    this.elapsed = 0;
    this.playing = true;
    this.repeatsLeft = def.repeat;
    if (def.frames[0]) this.apply(def.frames[0]);
  }

  stop(): void {
    this.playing = false;
  }

  on(event: string, fn: (...args: unknown[]) => void): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn);
    this.listeners.set(event, set);
  }

  once(event: string, fn: (...args: unknown[]) => void): void {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      fn(...args);
    };
    this.on(event, wrapped);
  }

  off(event: string, fn?: (...args: unknown[]) => void): void {
    const set = this.listeners.get(event);
    if (!set) return;
    if (!fn) set.clear();
    else set.delete(fn);
  }

  step(delta: number): void {
    if (!this.playing || !this.def || this.def.frames.length === 0) return;
    const frameMs = 1000 / this.def.frameRate;
    this.elapsed += delta;
    while (this.elapsed >= frameMs) {
      this.elapsed -= frameMs;
      this.frameIndex += 1;
      if (this.frameIndex >= this.def.frames.length) {
        this.emit("animationcomplete");
        if (this.def.repeat === -1 || this.repeatsLeft > 0) {
          if (this.repeatsLeft > 0) this.repeatsLeft -= 1;
          this.frameIndex = 0;
        } else {
          this.frameIndex = this.def.frames.length - 1;
          this.playing = false;
          break;
        }
      }
      const frame = this.def.frames[this.frameIndex];
      if (frame) this.apply(frame);
      this.emit("animationupdate");
    }
  }

  private emit(event: string): void {
    for (const fn of this.listeners.get(event) ?? []) fn();
  }
}

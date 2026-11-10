/** Session clock for the rest prompt. It is not written into the save. */

export interface PlayTimer {
  startedAt: number;
  answers: number;
  snoozeUntil: number;
}

export const PLAY_PROMPT_MS = 15 * 60 * 1000;
export const PLAY_PROMPT_ANSWERS = 50;
export const PLAY_SNOOZE_MS = 10 * 60 * 1000;

export function createPlayTimer(now: number): PlayTimer {
  return { startedAt: now, answers: 0, snoozeUntil: 0 };
}

export function notePlayAnswer(timer: PlayTimer): PlayTimer {
  return { ...timer, answers: timer.answers + 1 };
}

export function shouldPromptRest(timer: PlayTimer, now: number): boolean {
  if (now < timer.snoozeUntil) return false;
  return now - timer.startedAt >= PLAY_PROMPT_MS || timer.answers >= PLAY_PROMPT_ANSWERS;
}

export function snoozePlayTimer(timer: PlayTimer, now: number): PlayTimer {
  return { ...timer, snoozeUntil: now + PLAY_SNOOZE_MS };
}

let timer = createPlayTimer(0);

export function playTimer(): PlayTimer {
  return timer;
}

export function recordPlayAnswer(now = Date.now()): void {
  if (timer.startedAt === 0) timer = createPlayTimer(now);
  timer = notePlayAnswer(timer);
}

export function restPromptDue(now = Date.now()): boolean {
  if (timer.startedAt === 0) return false;
  return shouldPromptRest(timer, now);
}

export function snoozeRest(now = Date.now()): void {
  timer = snoozePlayTimer(timer, now);
}

export function resetPlayTimer(now = Date.now()): void {
  timer = createPlayTimer(now);
}

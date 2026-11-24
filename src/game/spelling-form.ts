import { spellingMarkHint } from "../domain/questions";

/** Blocks row buttons under the shared spelling form. Hidden whenever the form closes. */
export function setSpellFormLock(open: boolean): void {
  const scrim = document.getElementById("spell-scrim");
  if (scrim) scrim.hidden = !open;
}

export function showSpellingPrompt(prompt: string | null): void {
  const node = document.getElementById("spell-prompt");
  if (node) node.textContent = prompt ?? "";
}

function coverControls(open: boolean): void {
  const giveUp = document.getElementById("spell-give-up");
  const replay = document.getElementById("spell-replay");
  const label = document.getElementById("spell-label");
  if (giveUp) giveUp.hidden = !open;
  if (replay) replay.hidden = !open;
  if (label) label.textContent = open ? "盖住拼" : "拼写";
}

/** 盖住拼. The prompt is Chinese. The hyphen hint and the answer stay hidden. */
export function showCoverSpellForm(prompt: string): void {
  const hint = document.getElementById("spell-hint");
  if (hint) hint.textContent = "";
  const error = document.getElementById("spell-error");
  if (error) error.textContent = "";
  const input = document.getElementById("spell-input");
  if (input instanceof HTMLInputElement) input.placeholder = "";
  showSpellingPrompt(prompt);
  coverControls(true);
}

export function showSpellingHint(answer: string | null): void {
  coverControls(false);
  const hint = document.getElementById("spell-hint");
  if (hint) hint.textContent = answer ? (spellingMarkHint(answer) ?? "") : "";
  const error = document.getElementById("spell-error");
  if (error && !answer) error.textContent = "";
  showSpellingPrompt(null);
}

export function spellingInstruction(answer: string | null): string {
  const hint = answer ? spellingMarkHint(answer) : null;
  return hint ? `在画面上的输入框里用键盘拼写，然后 Enter。${hint}` : "在画面上的输入框里用键盘拼写，然后 Enter。";
}

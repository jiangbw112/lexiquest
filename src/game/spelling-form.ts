import { spellingMarkHint } from "../domain/questions";

export function showSpellingHint(answer: string | null): void {
  const hint = document.getElementById("spell-hint");
  if (hint) hint.textContent = answer ? (spellingMarkHint(answer) ?? "") : "";
}

export function spellingInstruction(answer: string | null): string {
  const hint = answer ? spellingMarkHint(answer) : null;
  return hint ? `在画面上的输入框里用键盘拼写，然后 Enter。${hint}` : "在画面上的输入框里用键盘拼写，然后 Enter。";
}

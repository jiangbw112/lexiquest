import { pinNoteParts, shellCopy } from "../domain/host-copy";

/** Swap the static web wording for the shell that is actually running. */
export function paintShellDom(doc: Document, desktop: boolean): void {
  const shell = shellCopy(desktop);
  doc.documentElement.dataset.clearCacheLabel = shell.clearCacheLabel;
  doc.documentElement.dataset.saveCacheNotice = shell.saveCacheNotice;
  const note = doc.getElementById("pin-note");
  if (!note) return;
  const parts = pinNoteParts(desktop);
  note.replaceChildren();
  note.append(parts.before);
  const word = doc.createElement("span");
  word.className = "keep-word";
  word.textContent = parts.word;
  note.append(word, parts.after);
}

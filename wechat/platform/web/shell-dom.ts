import { pinNoteParts, shellCopy } from "../../../src/domain/host-copy";

/**
 * 原来：src/game/shell-dom.ts 把桌面或浏览器文案写进页面 DOM。
 * 现在：同一函数。没有 document 或没有 pin-note 节点时直接返回。
 * 为什么：vite 把场景对 shell-dom 的引用指到这里。src/domain/host-copy.ts 只有 web 和 desktop 两支，不能加第三支，所以小程序仍会读到 web 文案。这是未完成项，不是新文案。
 */
export function paintShellDom(doc: { documentElement?: { dataset?: Record<string, string> }; getElementById?: (id: string) => { replaceChildren?: () => void; append?: (...nodes: unknown[]) => void } | null; createElement?: (tag: string) => { className: string; textContent: string } } | undefined, desktop: boolean): void {
  if (!doc?.documentElement?.dataset || !doc.getElementById || !doc.createElement) return;
  const shell = shellCopy(desktop);
  doc.documentElement.dataset.clearCacheLabel = shell.clearCacheLabel;
  doc.documentElement.dataset.saveCacheNotice = shell.saveCacheNotice;
  const note = doc.getElementById("pin-note");
  if (!note?.replaceChildren || !note.append) return;
  const parts = pinNoteParts(desktop);
  note.replaceChildren();
  const word = doc.createElement("span");
  word.className = "keep-word";
  word.textContent = parts.word;
  note.append(parts.before, word, parts.after);
}

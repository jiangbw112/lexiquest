/**
 * WeChat 「拼一拼」 letter slots.
 * The official word stays lowercase. A space is a gap, not a slot.
 * Help reveals one not-yet-visible letter from the left after the pointer lifts.
 */

export interface SpellSlotLetter {
  ch: string;
  /** Index in the lowercased official word, including spaces that are not slots. */
  index: number;
}

export function spellSlotLetters(english: string): SpellSlotLetter[] {
  const official = english.toLowerCase();
  const slots: SpellSlotLetter[] = [];
  for (let index = 0; index < official.length; index += 1) {
    if (official[index] === " ") continue;
    slots.push({ ch: official[index] ?? "", index });
  }
  return slots;
}

export function spellInputValue(): string {
  const doc = (globalThis as { document?: { getElementById?: (id: string) => { value?: string } | null } }).document;
  return String(doc?.getElementById?.("spell-input")?.value ?? "");
}

/**
 * Letters already on screen: the help prefix, then a typed official prefix after it.
 * Typed letters that match the official form count as visible, so the next help
 * action uncovers the next hidden letter instead of repeating one the child typed.
 */
export function spellHelpCovered(english: string, shown: number, typed: string): number {
  const letters = spellSlotLetters(english);
  const value = typed.toLowerCase();
  let cover = Math.max(0, Math.min(Math.floor(shown) || 0, letters.length));
  while (cover < letters.length && value[letters[cover]?.index ?? -1] === letters[cover]?.ch) cover += 1;
  return cover;
}

/** Write the revealed official prefix into the existing spelling field and keep a typed tail. */
export function syncSpellInput(english: string, shown: number): void {
  const doc = (globalThis as { document?: { getElementById?: (id: string) => { value?: string } | null } }).document;
  const input = doc?.getElementById?.("spell-input");
  if (!input) return;
  const official = english.toLowerCase();
  const letters = spellSlotLetters(english);
  const end = shown > 0 ? (letters[Math.min(shown, letters.length) - 1]?.index ?? -1) + 1 : 0;
  const prefix = official.slice(0, Math.max(0, end));
  const current = String(input.value ?? "");
  if (current.toLowerCase().startsWith(prefix)) return;
  const typed = current.toLowerCase();
  let value = "";
  for (let index = 0; index < official.length; index += 1) {
    if (index < end) value += official[index] ?? "";
    else if (typed[index]) value += typed[index];
    else break;
  }
  input.value = value;
}

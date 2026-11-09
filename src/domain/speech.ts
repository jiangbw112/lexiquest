/**
 * Pronunciation source is not decided. Callers talk to this interface.
 * The browser implementation uses speechSynthesis. Tests use the placeholder.
 * Do not ship third-party recordings.
 */
export interface WordSpeaker {
  speak(text: string): void;
  cancel(): void;
}

export function speakWord(english: string, speaker: WordSpeaker): void {
  speaker.cancel();
  speaker.speak(english);
}

export function placeholderSpeaker(log: string[] = []): WordSpeaker {
  return {
    speak(text: string) {
      log.push(text);
    },
    cancel() {
      log.push("cancel");
    },
  };
}

export function browserSpeaker(): WordSpeaker {
  return {
    speak(text: string) {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    },
    cancel() {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
    },
  };
}

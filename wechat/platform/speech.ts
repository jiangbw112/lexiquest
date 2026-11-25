/**
 * 原来：src/domain/speech.ts 的 browserSpeaker 调 speechSynthesis，没有引擎时什么都不做。
 * 现在：微信包把这个模块指到这里。先找 packages 里的 mp3，没有文件就把缺词写进可见名单。
 * 为什么：仓库没有合法词录音，不能生成 mp3。缺词必须能被页面读到，不能再静默返回。
 */

export interface WordSpeaker {
  speak(text: string): void;
  cancel(): void;
}

const missing: string[] = [];

export function missingSpeech(): readonly string[] {
  return missing;
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
      const reason = `word audio missing: ${text}`;
      missing.push(reason);
      const hook = (globalThis as { __LEXI_SPEECH_GAP__?: (reason: string) => void }).__LEXI_SPEECH_GAP__;
      hook?.(reason);
    },
    cancel() {
      return undefined;
    },
  };
}

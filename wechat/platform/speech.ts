/**
 * 原来：src/domain/speech.ts 的 browserSpeaker 调 speechSynthesis，没有引擎时什么都不做。
 * 现在：微信包把这个模块指到这里。先找 packages 里的 mp3，没有文件就把缺词写进可见名单。
 * 为什么：仓库没有合法词录音，不能生成 mp3。缺词必须能被页面读到，不能再静默返回。
 */

import { speakWordFile, stopWordAudio } from "./tts";

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
      // 原来：这里只把缺词推进数组，speakWordFile 没有被调用。
      // 现在：先按英文找词 id，再调用 speakWordFile。仓库里没有 mp3，hasFile 为 false，原因进入可见名单。
      // 为什么：缺文件和没调用是两件事。调用必须发生，文件缺失单独记录。
      const lookup = (globalThis as { __LEXI_WORD_ID__?: (english: string) => string }).__LEXI_WORD_ID__;
      const wordId = lookup?.(text) || text;
      const hasFile = (globalThis as { __LEXI_HAS_WORD_AUDIO__?: (id: string) => boolean }).__LEXI_HAS_WORD_AUDIO__?.(wordId) === true;
      const result = speakWordFile(wordId, hasFile);
      if (!result.ok) {
        missing.push(result.reason);
        const hook = (globalThis as { __LEXI_SPEECH_GAP__?: (reason: string) => void }).__LEXI_SPEECH_GAP__;
        hook?.(result.reason);
      }
    },
    cancel() {
      stopWordAudio();
    },
  };
}

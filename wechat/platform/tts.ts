/**
 * 原来：src/domain/speech.ts 用浏览器 speechSynthesis。
 * 现在：准备按 wordId 找 assets/audio/words/<id>.mp3。文件不存在就返回可见原因。
 * 为什么：没有词表录音，不能造 mp3。连续播放先停上一段。
 */

const missing: string[] = [];
let current: { stop: () => void } | null = null;

export function speakWordFile(wordId: string, hasFile: boolean): { ok: boolean; reason: string } {
  current?.stop();
  current = null;
  if (!hasFile) {
    const reason = `word audio missing: ${wordId}`;
    missing.push(reason);
    return { ok: false, reason };
  }
  const wx = (globalThis as { wx?: { createInnerAudioContext?: () => { src: string; stop: () => void; play: () => void } } }).wx;
  if (!wx?.createInnerAudioContext) return { ok: false, reason: "wx.createInnerAudioContext is not available" };
  const audio = wx.createInnerAudioContext();
  audio.src = `/assets/audio/words/${wordId}.mp3`;
  audio.stop();
  audio.play();
  current = audio;
  return { ok: true, reason: "" };
}

export function missingWordAudio(): readonly string[] {
  return missing;
}

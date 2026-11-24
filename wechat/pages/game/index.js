/**
 * Ordinary mini-program page. Not a web-view, not a Phaser game, not a wx mock.
 *
 * 原来：src/main.ts 用 Phaser.WEBGL 挂到 #game，1280×800，Scale.FIT，键盘和鼠标开、触摸关。
 * 现在：本页只有 type="2d" canvas，按窗口逻辑像素 letterbox，点按命中设计坐标里的图集热区并播放本地音频。
 * 为什么：P0 只证明小程序工程能画一张图集、播一段音频、收一次触摸。场景迁移、mini-engine、存档都不在这里。
 */

const {
  DESIGN_W,
  DESIGN_H,
  canvasPixels,
  layoutView,
  hitTest,
} = require("./layout.js");
const atlas = require("../../assets/atlas/skeleton-atlas.json");

const ATLAS_SRC = "/assets/atlas/skeleton-atlas.png";
const AUDIO_SRC = "/assets/audio/tap.wav";

function touchPoint(touch) {
  if (touch && typeof touch.x === "number" && typeof touch.y === "number") {
    return { x: touch.x, y: touch.y };
  }
  if (touch && typeof touch.clientX === "number" && typeof touch.clientY === "number") {
    return { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

function frameOf(name) {
  const item = atlas.frames[name];
  return item ? item.frame : null;
}

Page({
  onReady() {
    this._pressed = false;
    this.bindCanvas();
  },

  onUnload() {
    if (this._audio) {
      this._audio.destroy();
      this._audio = null;
    }
  },

  bindCanvas() {
    wx.createSelectorQuery()
      .select("#game-canvas")
      .fields({ node: true, size: true })
      .exec((res) => {
        const found = res && res[0];
        if (!found || !found.node) return;
        const info = wx.getWindowInfo();
        const viewW = found.width || info.windowWidth;
        const viewH = found.height || info.windowHeight;
        const pixels = canvasPixels(viewW, viewH, info.pixelRatio);
        const canvas = found.node;
        // 原来：Phaser 自己把画布像素设成 CSS 尺寸乘 pixelRatio。
        // 现在：这里把 type="2d" 节点的 width/height 设成同样的实际像素，绘制时再用 dpr 把坐标折回逻辑像素。
        // 为什么：只改样式宽高不会提高清晰度，点按仍按逻辑像素计算。
        canvas.width = pixels.width;
        canvas.height = pixels.height;
        this._canvas = canvas;
        this._ctx = canvas.getContext("2d");
        this._viewW = viewW;
        this._viewH = viewH;
        this._dpr = pixels.dpr;
        const safe = info.safeArea || { left: 0, top: 0, right: viewW, bottom: viewH };
        this._layout = layoutView(viewW, viewH, {
          left: safe.left,
          top: safe.top,
          right: safe.right,
          bottom: safe.bottom,
        });
        this.loadAtlas(canvas);
        this.draw();
      });
  },

  loadAtlas(canvas) {
    // 原来：BootScene 和 warm/load.ts 用 this.load.atlas 读 png+json。
    // 现在：canvas.createImage 读包内 png，帧矩形来自同目录的 json。
    // 为什么：P0 要有一张真实图集，但不引入 Phaser 的 Loader。
    const image = canvas.createImage();
    image.onload = () => {
      this._image = image;
      this.draw();
    };
    image.onerror = () => {
      this._image = null;
      this.draw();
    };
    image.src = ATLAS_SRC;
  },

  ensureAudio() {
    if (this._audio) return this._audio;
    // 原来：game/audio.ts 在 WebAudio 上下文里用 Oscillator 合成短音，并用 pointerdown/keydown 解锁。
    // 现在：点按后用 InnerAudioContext 播放包内 wav。没有合成器，也没有键盘解锁。
    // 为什么：小程序没有这个页面可依赖的 WebAudio Oscillator 路径，P5 才预生成正式音效。
    const audio = wx.createInnerAudioContext();
    audio.src = AUDIO_SRC;
    audio.onError(() => {
      // Device-only. This page does not add an error string.
    });
    this._audio = audio;
    return audio;
  },

  onTouchStart(event) {
    // 原来：全游戏 input.touch 为 false，场景靠鼠标 pointer 和键盘。
    // 现在：系统 touchstart 的坐标换回 1280×800 再测热区。不在画布上画字母键盘。
    // 为什么：起名、拼写、家长密码以后用原生 input；这一页只证明触摸命中。
    const touch = touchPoint(event.touches && event.touches[0]);
    if (!touch || !this._layout) return;
    const hit = hitTest(this._layout, touch.x, touch.y);
    if (hit === "play") {
      this._pressed = true;
      const audio = this.ensureAudio();
      if (this._playedOnce) audio.stop();
      this._playedOnce = true;
      audio.play();
      this.draw();
      return;
    }
    if (hit === "reset") {
      this._pressed = false;
      if (this._audio && this._playedOnce) this._audio.stop();
      this.draw();
    }
  },

  draw() {
    const ctx = this._ctx;
    const layout = this._layout;
    if (!ctx || !layout) return;
    const dpr = this._dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._viewW, this._viewH);
    ctx.fillStyle = "#143d2c";
    ctx.fillRect(0, 0, this._viewW, this._viewH);
    ctx.fillStyle = "#fff6e4";
    ctx.fillRect(layout.offsetX, layout.offsetY, DESIGN_W * layout.scale, DESIGN_H * layout.scale);

    ctx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, dpr * layout.offsetX, dpr * layout.offsetY);
    ctx.fillStyle = "#17352a";
    ctx.textBaseline = "top";
    ctx.font = `${layout.title.size}px sans-serif`;
    ctx.fillText("词境练习家", layout.title.x, layout.title.y);

    this.paintHit(ctx, layout.hits.play, this._pressed ? "btn_down" : "btn_up", this._pressed ? "#8c3a28" : "#c4533a");
    this.paintHit(ctx, layout.hits.reset, "mark", "#1f7a4d");
  },

  paintHit(ctx, rect, frameName, fallback) {
    const frame = frameOf(frameName);
    if (this._image && frame) {
      ctx.drawImage(this._image, frame.x, frame.y, frame.w, frame.h, rect.x, rect.y, rect.w, rect.h);
      return;
    }
    ctx.fillStyle = fallback;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  },
});

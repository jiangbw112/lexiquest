/**
 * Ordinary mini-program page. Not a web-view, not a Phaser game, not a wx mock.
 *
 * 原来：src/main.ts 用 Phaser.WEBGL 挂到 #game，1280×800，Scale.FIT，键盘和鼠标开、触摸关。
 * 现在：本页只有 type="2d" canvas，按窗口逻辑像素 letterbox。P0.5 补横屏、单指触摸、前后台、重排和可见失败。
 * 为什么：这一阶段只修补骨架。场景迁移、mini-engine、存档都不在这里。
 *
 * 需要复核的偏差：canvas node 缺失时没有 2d context，不能把 “canvas node missing” 画到不存在的画布上。
 * 这一类只显示 cover-view 原生文本，不是 canvas fillText。图集和音频失败仍画在 canvas 上。
 */

const {
  DESIGN_W,
  DESIGN_H,
  canvasPixels,
  reconcileSafeArea,
  safeAreaInCanvas,
  layoutView,
  createPointerState,
  reducePointer,
  shouldReleasePointer,
  paintedFrameNames,
  atlasFailure,
  audioFailure,
  joinFailureLine,
  showsDebugLine,
  safeAreaDebugNote,
  formatDebugLine,
  CANVAS_NODE_MISSING,
  CANVAS_CONTEXT_MISSING,
} = require("./layout.js");
const atlas = require("../../assets/atlas/skeleton-atlas.json");

const ATLAS_SRC = "/assets/atlas/skeleton-atlas.png";
const AUDIO_SRC = "/assets/audio/tap.wav";

function frameOf(name) {
  const item = atlas.frames[name];
  return item ? item.frame : null;
}

Page({
  data: {
    canvasMissing: false,
    canvasMissingText: "",
  },

  onLoad() {
    this._alive = true;
    this._hidden = false;
    this._pointer = createPointerState();
    this._pointSource = "";
    this._failures = { atlas: "", audio: "" };
    this._canvasRect = { left: 0, top: 0, known: false };
    this._background = { hadAudio: false, playing: false, replay: false, pressTarget: null };
    this._playedOnce = false;
    this._queryGen = 0;
    this._layout = null;
    this._dpr = 1;
    this._viewW = 0;
    this._viewH = 0;
    this._safeDecision = null;
    this._safeUsed = null;
    this._windowWidth = 0;
    this._windowHeight = 0;
    this._backingW = 0;
    this._backingH = 0;
    this._audio = null;
    this._onAudioError = null;
    this._onWindowResize = null;
  },

  onReady() {
    // 原来：app.json 和页面 json 都没有 pageOrientation，竖屏 390×844 时 scale 约为 0.305。layout 也只在 onReady 算一次。
    // 现在：两处 json 都是 landscape。onReady 订阅 wx.onWindowResize，每次重新 getWindowInfo，重算 dpr、backing、layout 并重绘。
    // 为什么：竖屏上下会各剩约 300px 空背景。旋转、分屏、折叠屏会改变窗口逻辑像素，热区否则还停在旧坐标。
    this._onWindowResize = () => {
      if (!this._alive) return;
      this._pointer = createPointerState();
      this.measureAndLayout();
    };
    if (typeof wx.onWindowResize === "function") wx.onWindowResize(this._onWindowResize);
    this.measureAndLayout();
  },

  // 原来：game/audio.ts 监听 document.visibilitychange，hidden 时 pauseAll，回来 resumeAll。P0 只在 onUnload 里 destroy 音频。
  // 现在：onHide 暂停并 stop，记下中断且 replay 固定为 false；onShow 只重新量布局并重绘，不调用 play。
  //       onUnload 卸掉 onWindowResize、音频 onError，再 destroy。本页没有 setTimeout/setInterval。
  //       图片 onload 用 _alive 和图片身份挡住卸载后的回调。
  // 为什么：小程序切后台没有 visibilitychange。回来自动重播会在没有新手势时出声。监听不卸会在页面销毁后继续改状态。
  onHide() {
    const playing = !!(this._audio && this._audio.paused === false);
    this._background = {
      hadAudio: !!this._audio,
      playing,
      replay: false,
      pressTarget: this._pointer ? this._pointer.target : null,
    };
    this._hidden = true;
    this.stopAudio();
    this._pointer = createPointerState();
    this.draw();
  },

  onShow() {
    this._hidden = false;
    // _background.replay 保持 false。回来只重绘，不因为记录过“曾经在播”而 play。
    if (!this._alive || !this._canvas) return;
    this.measureAndLayout();
  },

  onUnload() {
    this._alive = false;
    if (this._onWindowResize && typeof wx.offWindowResize === "function") {
      wx.offWindowResize(this._onWindowResize);
    }
    this._onWindowResize = null;
    this.destroyAudio();
    this._pointer = createPointerState();
    this._pendingImage = null;
    this._image = null;
    this._ctx = null;
    this._canvas = null;
    this._layout = null;
  },

  measureAndLayout() {
    if (!this._alive) return;
    this._queryGen += 1;
    const gen = this._queryGen;
    // 原来：fields 只取 node 和 size，触摸默认画布在 (0,0)。P0 只用 wx.createSelectorQuery。
    // 现在：同时取 rect。rect.left/top 不是 0 时，视口坐标先减去它们再做命中。优先用页面自己的 createSelectorQuery。
    // 为什么：rect 才是画布在窗口里的原点。有的基础库上不带页面实例的查询选不到本页节点，会把正常画布误报成缺失。
    const query = typeof this.createSelectorQuery === "function"
      ? this.createSelectorQuery()
      : wx.createSelectorQuery();
    query
      .select("#game-canvas")
      .fields({ node: true, size: true, rect: true })
      .exec((res) => {
        if (!this._alive || gen !== this._queryGen) return;
        const found = res && res[0];
        if (!found || !found.node) {
          this._canvas = null;
          this._ctx = null;
          this._layout = null;
          // 需要复核：这里不是往 canvas 上画字。没有 node，下面的 cover-view 只放一行原生文本。
          this.showCanvasFallback(CANVAS_NODE_MISSING);
          return;
        }
        let info = null;
        try {
          info = wx.getWindowInfo();
        } catch (err) {
          info = null;
        }
        if (!info) {
          info = {
            windowWidth: found.width > 0 ? found.width : 0,
            windowHeight: found.height > 0 ? found.height : 0,
            pixelRatio: 1,
          };
        }
        const rect = {
          left: typeof found.left === "number" ? found.left : 0,
          top: typeof found.top === "number" ? found.top : 0,
          known: typeof found.left === "number" && typeof found.top === "number",
        };
        const viewW = found.width > 0 ? found.width : info.windowWidth;
        const viewH = found.height > 0 ? found.height : info.windowHeight;
        const pixels = canvasPixels(viewW, viewH, info.pixelRatio);
        const canvas = found.node;
        const nodeChanged = this._canvas !== canvas;
        if (nodeChanged || !this._ctx) {
          if (nodeChanged) {
            this._image = null;
            this._atlasLoading = false;
          }
          this._ctx = null;
          try {
            this._ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
          } catch (err) {
            this._ctx = null;
          }
        }
        this._canvas = canvas;
        this._canvasRect = rect;
        if (!this._ctx) {
          this._layout = null;
          this.showCanvasFallback(CANVAS_CONTEXT_MISSING);
          return;
        }
        this.clearCanvasFallback();
        // 原来：Phaser 自己把画布像素设成 CSS 尺寸乘 pixelRatio。
        // 现在：每次量到新的窗口后，把 type="2d" 节点的 width/height 设成同样的实际像素，再用 dpr 把坐标折回逻辑像素。
        // 为什么：只改样式宽高不会提高清晰度。旋转后不重设 backing store，画面会拉伸。点按仍按逻辑像素计算。
        canvas.width = pixels.width;
        canvas.height = pixels.height;
        this._viewW = viewW;
        this._viewH = viewH;
        this._dpr = pixels.dpr;
        this._backingW = pixels.width;
        this._backingH = pixels.height;
        this._windowWidth = info.windowWidth;
        this._windowHeight = info.windowHeight;
        const decision = reconcileSafeArea(info, viewW, viewH);
        const safe = safeAreaInCanvas(decision.safeArea, rect);
        this._safeDecision = decision;
        this._safeUsed = safe;
        this._layout = layoutView(viewW, viewH, safe);
        if (!this._image && !this._atlasLoading) this.loadAtlas(canvas);
        this.draw();
      });
  },

  showCanvasFallback(text) {
    if (!this._alive) return;
    if (this.data.canvasMissing && this.data.canvasMissingText === text) return;
    this.setData({ canvasMissing: true, canvasMissingText: text });
  },

  clearCanvasFallback() {
    if (!this._alive || !this.data.canvasMissing) return;
    this.setData({ canvasMissing: false, canvasMissingText: "" });
  },

  loadAtlas(canvas) {
    // 原来：BootScene 和 warm/load.ts 用 this.load.atlas 读 png+json。
    // 现在：canvas.createImage 读包内 png，帧矩形来自同目录的 json。失败时在画布上写一行红字。
    // 为什么：P0 要有一张真实图集，但不引入 Phaser 的 Loader。静默 return 在真机上就是白屏。
    this._atlasLoading = true;
    let image = null;
    try {
      image = canvas.createImage();
    } catch (err) {
      this._atlasLoading = false;
      this._image = null;
      this._failures.atlas = atlasFailure(ATLAS_SRC);
      this.draw();
      return;
    }
    if (!image) {
      this._atlasLoading = false;
      this._image = null;
      this._failures.atlas = atlasFailure(ATLAS_SRC);
      this.draw();
      return;
    }
    this._pendingImage = image;
    image.onload = () => {
      if (!this._alive || this._pendingImage !== image) return;
      this._atlasLoading = false;
      this._image = image;
      this._failures.atlas = "";
      this.draw();
    };
    image.onerror = () => {
      if (!this._alive || this._pendingImage !== image) return;
      this._atlasLoading = false;
      this._image = null;
      this._failures.atlas = atlasFailure(ATLAS_SRC);
      this.draw();
    };
    image.src = ATLAS_SRC;
  },

  // 原来：game/audio.ts 在 WebAudio 里用 Oscillator 合成短音，并用 pointerdown/keydown 解锁。
  // 现在：左热区抬起后才用 InnerAudioContext 播放包内 wav。按下只改画面，不 play。没有合成器，也没有键盘解锁。
  // 为什么：小程序没有这个页面可依赖的 WebAudio Oscillator 路径。按下就播会把“按下高亮、抬起触发”验成开关。
  ensureAudio() {
    if (this._audio) return this._audio;
    let audio = null;
    try {
      audio = wx.createInnerAudioContext();
    } catch (err) {
      this._failures.audio = audioFailure(err && (err.errMsg || err.message));
      this.draw();
      return null;
    }
    audio.src = AUDIO_SRC;
    this._onAudioError = (err) => {
      if (!this._alive) return;
      const msg = err && (err.errMsg || err.message) ? (err.errMsg || err.message) : "unknown";
      this._failures.audio = audioFailure(msg);
      this.draw();
    };
    audio.onError(this._onAudioError);
    this._audio = audio;
    return audio;
  },

  stopAudio() {
    if (!this._audio || !this._playedOnce) return;
    this.tryCall(() => this._audio.pause());
    this.tryCall(() => this._audio.stop());
  },

  destroyAudio() {
    const audio = this._audio;
    if (!audio) return;
    this.stopAudio();
    if (this._onAudioError && typeof audio.offError === "function") {
      this.tryCall(() => audio.offError(this._onAudioError));
    }
    this.tryCall(() => audio.destroy());
    this._audio = null;
    this._onAudioError = null;
  },

  tryCall(fn) {
    try {
      fn();
    } catch (err) {
      return err;
    }
    return null;
  },

  onTouchStart(event) {
    this.onPointer("start", event);
  },

  onTouchMove(event) {
    this.onPointer("move", event);
  },

  onTouchEnd(event) {
    this.onPointer("end", event);
    this.releaseIfScreenClear(event);
  },

  onTouchCancel(event) {
    this.onPointer("cancel", event);
    this.releaseIfScreenClear(event);
  },

  // 原来：end/cancel 只把 changedTouches 交给 reducePointer。touches 缺失和空数组没有区分。
  // 现在：liveTouches 用 Array.isArray。空数组传 []，字段缺失传 null。
  //       页面兜底只在 end/cancel 之后、且 touches 是长度为 0 的数组、指针仍按下时清空并重绘一次。
  // 为什么：缺失不是“屏上没手指”。把它当成空数组会把还按着的另一指一起取消。
  //       缺失时保持 reducePointer 的旧结果，下一次 start 若带上明确的 liveTouches 再自愈。
  onPointer(type, event) {
    if (!this._alive) return;
    const before = this._pointer ? this._pointer.target : null;
    const result = reducePointer(this._pointer || createPointerState(), {
      type,
      changedTouches: event && event.changedTouches ? event.changedTouches : [],
      liveTouches: event && Array.isArray(event.touches) ? event.touches : null,
      rect: this._canvasRect,
      layout: this._layout,
    });
    this._pointer = result.state;
    if (result.pointSource) this._pointSource = result.pointSource;
    if (result.action) {
      this.applyAction(result.action);
      return;
    }
    if (before !== result.state.target) this.draw();
  },

  releaseIfScreenClear(event) {
    if (!this._alive) return;
    const touches = event && Array.isArray(event.touches) ? event.touches : null;
    if (!shouldReleasePointer(this._pointer, touches)) return;
    this._pointer = createPointerState();
    this.draw();
  },

  applyAction(action) {
    if (!this._alive || this._hidden) return;
    if (action === "play") {
      const audio = this.ensureAudio();
      if (!audio) return;
      this._failures.audio = "";
      if (this._playedOnce) this.tryCall(() => audio.stop());
      this._playedOnce = true;
      const played = this.tryCall(() => audio.play());
      if (played) {
        const msg = played.errMsg || played.message || "play failed";
        this._failures.audio = audioFailure(msg);
      }
      this.draw();
      return;
    }
    if (action === "reset") {
      this.stopAudio();
      this.draw();
    }
  },

  readEnvVersion() {
    try {
      const account = wx.getAccountInfoSync();
      const env = account && account.miniProgram && account.miniProgram.envVersion;
      return typeof env === "string" ? env : "";
    } catch (err) {
      return "";
    }
  },

  draw() {
    if (!this._alive || !this._ctx || !(this._viewW > 0) || !(this._viewH > 0)) return;
    const ctx = this._ctx;
    const dpr = this._dpr > 0 ? this._dpr : 1;
    const layout = this._layout;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this._viewW, this._viewH);
    ctx.fillStyle = "#143d2c";
    ctx.fillRect(0, 0, this._viewW, this._viewH);
    if (layout) {
      ctx.fillStyle = "#fff6e4";
      ctx.fillRect(layout.offsetX, layout.offsetY, DESIGN_W * layout.scale, DESIGN_H * layout.scale);
      ctx.setTransform(dpr * layout.scale, 0, 0, dpr * layout.scale, dpr * layout.offsetX, dpr * layout.offsetY);
      ctx.fillStyle = "#17352a";
      ctx.textBaseline = "top";
      ctx.font = `${layout.title.size}px sans-serif`;
      ctx.fillText("词境练习家", layout.title.x, layout.title.y);
      const names = paintedFrameNames(this._pointer && this._pointer.target);
      this.paintHit(ctx, layout.hits.play, names.play, names.play === "btn_down" ? "#8c3a28" : "#c4533a", false);
      this.paintHit(ctx, layout.hits.reset, names.reset, "#1f7a4d", this._pointer && this._pointer.target === "reset");
    }
    this.paintStatus(ctx, dpr);
  },

  paintHit(ctx, rect, frameName, fallback, dim) {
    const frame = frameOf(frameName);
    if (this._image && frame) {
      ctx.drawImage(this._image, frame.x, frame.y, frame.w, frame.h, rect.x, rect.y, rect.w, rect.h);
    } else {
      ctx.fillStyle = fallback;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    if (dim) {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
  },

  // 原来：canvas、图集、音频失败都是静默 return，正式版和开发版都没有画面上的原因。
  // 现在：图集和音频失败合成画布上的一行红字。调试行只在 envVersion 不是 release 时再画一行。
  //       读不到 envVersion 时不当成 release，调试行仍画。失败行用窗口逻辑像素，不乘设计 scale。
  // 为什么：真机白屏时控制台不一定看得到。正式版不把窗口尺寸和安全区画出来，但失败原因要留下。
  //       canvas node 缺失不走这里，见 showCanvasFallback。那一类需要复核，它不是 canvas 绘制。
  paintStatus(ctx, dpr) {
    const failure = joinFailureLine(this._failures && this._failures.atlas, this._failures && this._failures.audio);
    const debug = showsDebugLine(this.readEnvVersion());
    if (!failure && !debug) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textBaseline = "top";
    let y = 8;
    if (failure) {
      ctx.fillStyle = "#ff5c5c";
      ctx.font = "16px sans-serif";
      ctx.fillText(failure, 16, y);
      y += 22;
    }
    if (!debug) return;
    const names = paintedFrameNames(this._pointer && this._pointer.target);
    const layout = this._layout;
    const safe = this._safeUsed || { left: 0, top: 0, right: 0, bottom: 0 };
    const line = formatDebugLine({
      windowWidth: this._windowWidth,
      windowHeight: this._windowHeight,
      dpr: this._dpr,
      backingWidth: this._backingW,
      backingHeight: this._backingH,
      scale: layout ? layout.scale : NaN,
      offsetX: layout ? layout.offsetX : NaN,
      offsetY: layout ? layout.offsetY : NaN,
      safeLeft: safe.left,
      safeTop: safe.top,
      safeRight: safe.right,
      safeBottom: safe.bottom,
      frames: `play=${names.play} reset=${names.reset}`,
      safeNote: safeAreaDebugNote(this._safeDecision),
      rectLeft: this._canvasRect && this._canvasRect.known ? this._canvasRect.left : NaN,
      rectTop: this._canvasRect && this._canvasRect.known ? this._canvasRect.top : NaN,
      pointSource: this._pointSource,
    });
    ctx.fillStyle = "#d7ecff";
    ctx.font = "14px sans-serif";
    ctx.fillText(line, 16, y);
  },
});

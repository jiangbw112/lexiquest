# P0.6 验证工具（不入小程序包）

`project.config.json` 的 `packOptions.ignore` 已忽略整个 `tools/` 目录。这些脚本只在开发机上跑。

## 前置

- Node 22（仓库要求）
- Google Chrome / Chromium（渲染探针 PNG 用，**不是**项目依赖）
  - macOS 默认路径：`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
  - 其他位置用 `CHROME_PATH=/path/to/chrome` 覆盖

## 命令

```bash
cd wechat

# 1. 450 项静态/布局自检
node p05-check.cjs

# 2. 12 个布局帧的数值（JSON），不渲染
node p06-render.cjs /tmp/p06-spec.json

# 3. 12 张探针 PNG + 真实 measureText 报告
node tools/p06-shots.cjs ../p06-evidence

# 4. 指针/坐标对抗测试
node tools/p06-adversarial.cjs
```

`tools/p06-shots.cjs` 输出：

- `p06-<视口>-<帧>.png`：12 张，像素尺寸等于视口逻辑尺寸
- 同名 `.json`：该帧的真实 `measureText` 宽度、启发式宽度、换行是否一致、标签是否放得下
- `p06-shots.json`：12 帧汇总
- `p06-probe.html`：页面源码，可直接用浏览器打开复核

## 字体说明

渲染用 `PingFang SC → Hiragino Sans GB → Noto Sans CJK SC → sans-serif` 回退链，实测在 macOS 上解析为 PingFang SC。

这不是微信的字体环境：

- iOS 微信 canvas 的中文字体是 PingFang SC，和这里一致的概率高；
- Android 微信是思源黑体 / 系统 Roboto + Noto CJK，字宽不同；
- 所以本工具只能证明「在 PingFang 下断行与宽度成立」，不能替代真机。

## 这些图不是什么

- 不是微信开发者工具截图；
- 不是真机截图；
- 不是小程序运行时。它只把 `layoutProbe()` 的数字画到 Chromium canvas 上，用来核对字号、断行和热区几何。

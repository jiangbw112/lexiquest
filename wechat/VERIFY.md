# 词境练习家 · 全量移植验收材料

- 分支 / 提交：`cursor/wechat-full-port`。提交号以本文件所在提交为准。
- 环境：Linux 6.12.113+，Node v22.23.4，npm 10.9.9。微信开发者工具未安装。基础库未从运行时读取。模拟器机型未读取。真机未连接。
- 结论：未通过。开发者工具、真机、主包体积、场景重排、词音频、字体加载和 `host-copy` 都没有完成。
- 续修后的结论仍是未通过。页面链、词表、战斗到结算、逻辑像素和磁盘分包口径有新的实测，见文末「续修」。开发者工具和真机仍待授权验证。

## 逐项结果

| 项 | 结论 | 证据 | 来源 | 复现命令 |
|---|---|---|---|---|
| W0 vitest | 通过 | evidence/w0-vitest.log，复跑 evidence/w11-vitest.log | Node | `npx vitest run` |
| W0 web build | 通过 | evidence/w0-npm-build.log，复跑 evidence/w11-npm-build.log | Node | `npm run build` |
| W1 图集与调试行 | 通过 | evidence/w1-atlas-rerun.log，evidence/w1-debug-line-rerun.log | Node | `node wechat/tools/check-atlas-match.cjs` |
| W1 状态条字宽 | 未验证 | evidence/w1-status-band.json | 浏览器 | `node wechat/tools/check-status-band.cjs` |
| W1 异常回退可见 | 未验证 | 无新截图 | 无 | `?p06fail=node` 需要开发者工具 |
| W2 两个 CJS 产物 | 未完成 | evidence/w2-build.log | Node | `node wechat/tools/build-lib.mjs` |
| W2 词表 863 与断行 | 通过 | evidence/w2-catalog.log | Node | 见日志里的 `wrapCjkText` |
| W3 文本、九宫格、命中、深度 | 通过 | evidence/w3-engine.log | Node | `node wechat/tools/check-engine.cjs` |
| W3 微信画布出帧 | 未验证 | 无 | 无 | 需要开发者工具 |
| W4 缓动与计时器 | 通过 | evidence/w4-anims.log | Node | `node wechat/tools/check-anims.cjs` |
| W5 存储上限 | 通过 | evidence/w5-storage.log | Node | `node wechat/tools/check-storage.cjs` |
| W5 PIN 100000 次 | 通过 | evidence/w5-pin.log | Node | `node wechat/tools/check-pin.cjs` |
| W5 UUID | 通过 | evidence/w5-uuid.log | Node | `node wechat/tools/check-uuid.cjs` |
| W5 字体、朗读、生命周期 | 未完成 | 无调用记录 | 无 | 缺 TTF、缺 mp3、无 wx |
| W6 四档缩放数字 | 通过 | evidence/w6-layout.log | Node | `node wechat/tools/check-layout.cjs` |
| W6 场景重排到 14px | 未完成 | evidence/w6-layout.log | Node | 844×390 上 18px 设计字约为 8.78 |
| W6 输入法 | 未验证 | pages/game/index.wxml | 无 | 原生 input 默认不显示 |
| W7 四个场景进入 | 未完成 | evidence/w7-scene-smoke.log | Node | `node wechat/tools/scene-smoke.cjs` |
| W7 像素差 | 未完成 | evidence/w7/NOT-CAPTURED.json | 无 | `node wechat/tools/visual-diff.mjs` 退出码 2 |
| W8 其余场景 | 未完成 | evidence/w7-scene-smoke.json | Node | 多个场景 `create()` 后节点数为 0 |
| W9 存档往返 | 通过 | evidence/w9-save.log | Node | `node wechat/tools/check-save.cjs` |
| W9 微信文案分支 | 未完成 | src/domain/host-copy.ts 未改 | 无 | 不能改 src |
| W10 磁盘体积 | 失败 | evidence/w10-size.log | 文件系统 | `node wechat/tools/size-report.cjs` 退出码 2 |
| W10 开发者工具包体 | 未验证 | 无 | 无 | 需要本机开发者工具 |
| W11 开发者工具编译 | 未验证 | 无 | 无 | 需要本机开发者工具 |
| W11 真机 | 待本机确认 | wechat/P6.md | 无 | 需要本机批准 |

`check-status-band.cjs` 的数字来自本机 Chrome，不是微信。W1 不作为微信验收通过。

## 体积

| 包 | 字节 | 说明 |
|---|---|---|
| wechat 目录 | 1352870 | 磁盘。不是开发者工具主包。 |
| wechat/lib | 1088806 | domain.cjs.js 251052，game.cjs.js 837754。 |
| public | 33613886 | 现有网页资源。未裁切，未分包。 |
| 合计 | 34967173 | 超过 20MB。退出码 2。 |
| 开发者工具主包 | 未验证 | 不能用磁盘数字代替。 |
| 分包 | 无 | 没有按测量结果拆包。 |

## 未验证项与原因

- 开发者工具、基础库、模拟器窗口、`wx.getWindowInfo`、`wx.getPerformance`、真机输入法和真机存档都没有跑。云端 Node 和合成尺寸不能代替。
- 场景复杂画面只做了 `create()`。战斗、衣柜、地图、结局没有交互证据。
- 词音频为 0。字体仍是 woff2。没有调用 `wx.loadFontFace`。
- `host-copy` 没有微信分支，因为那要改 `src/domain/host-copy.ts`。
- 构建日志有 `EMPTY_IMPORT_META`。`ensureChapterPlan` 在 CJS 里不能再靠 `import.meta.url` 读 JSON。

## 与 web 版的已知差异

- 小程序入口仍画 P0.6 骨架。`lib/game.cjs.js` 没有在页面加载时执行，避免没有画布循环时替换已经核对过的骨架。
- 世界层缩放公式还在。UI 逻辑像素常量是 16 / 44 / 8。场景里的设计字号没有改成逻辑像素。
- 文本宽度在没有画布时用 ASCII 0.55em、汉字 1em。有 `document` 画布时才用 `measureText`。
- `setScrollFactor` 只记录数值。战斗场景没有滚动相机。
- 缺图写入 `game.failures`，不记成加载成功。
- 存档检查用内存 `localStorage`。微信存储上限按文档是单 key 1MB、总计 10MB，本机没有调用 `wx.setStorageSync`。

## 续修（父提交 1226b89 之后）

上一节保持原样。下面是这一轮普通追加提交的实测。全部门未过：开发者工具和真机仍是待授权验证。

### 实做

| 项 | 证据 | 来源 | 复现命令 |
|---|---|---|---|
| 页面入口加载 port，port 再加载 domain 与 game | `pages/game/index.js` 含 `require("./port.js")`。`evidence/w7-page-chain.log` | Node | `node wechat/tools/check-page-chain.cjs` |
| 词表 863，构建无 `import.meta` | `evidence/w2-rebuild.log` 无 `EMPTY_IMPORT_META`。两个产物里 `import.meta` 出现 0 次 | Node | `node wechat/tools/build-lib.mjs` |
| 默认 boot 进入档案页 | 日志 `scene boot active profiles nodes 25 texts 8` | Node | 同上 |
| 学习四档字号、热区、间距 | 844×390、667×375、915×412、1024×768 都是 font 14、hit 44、gap 8 | Node | 同上 |
| 战斗不是 0 节点 | `battle texts 13 hits 6 font 14`。文案含学习者、林缘小径、1 攻击 | Node | 同上 |
| 点击走到结算，并写入胜场 | `results texts 32 font 14 hit 44 gap 8 battles 1/0` | Node | 同上 |
| 微信文案走适配层 | 家长说明含「小程序数据」。`src/domain/host-copy.ts` 未改 | Node | 同上 |
| 世界层仍是 8.78，UI 字号映射是 16 | `evidence/w6-layout-rerun.log`：`world layer design 18 scales to 8.78; UI map is 16` | Node | `node wechat/tools/check-layout.cjs` |
| 可分发磁盘字节 | `evidence/w10-size-rerun.log`：packed 1084640，lib 932706（domain 251052，game 681654） | 文件系统 | `node wechat/tools/size-report.cjs` |
| 桌面基线 | vitest 637 passed / 1 skipped。web boot 3162002 | Node，网页构建 | `npx vitest run`；`npm run build` |
| p05 | `evidence/w11-p05-rerun.log`：checks 452。engine 断言仍是「目录必须在」 | Node | `node wechat/p05-check.cjs` |

### 场景矩阵

`evidence/w8-chain.json`。来源是 Node 通过 `pages/game/port.js`。

| 启动 | 实际场景 | 节点 | 文本 | 说明 |
|---|---|---|---|---|
| boot | profiles | 25 | 8 | 页面默认路由。约 50ms 后进入档案 |
| profiles | profiles | 25 | 8 | 有文案 |
| title | title | 41 | 4 | 有文案 |
| grades | grades | 52 | 10 | 有文案 |
| create（无年级） | grades | 52 | 10 | 游戏自己的重定向 |
| create（G3） | create | 52 | 27 | 起名页 |
| overworld | overworld | 50 | 13 | 有文案 |
| learn | learn | 94 | 25 | 有文案 |
| stages | stages | 66 | 20 | 有文案 |
| battle | battle | 战斗 13 条文本 | 13 | 带关卡数据 |
| battle-results | battle-results | 结算 32 条文本 | 32 | 由点击战斗得到，胜场 1 |
| collection | collection | 11 | 4 | 空册文案 |
| review | review | 11 | 4 | 空复习桌文案 |
| skills | skills | 60 | 17 | 有文案 |
| wardrobe | wardrobe | 51 | 17 | 有文案 |
| ending | ending | 35 | 9 | 有文案 |
| duel | duel | 19 | 6 | 有文案 |
| guide | guide | 10 | 3 | 家长密码说明 |
| exam-battle（无 id） | stages | 66 | 20 | 游戏自己的重定向 |
| exam-battle（exam_g3_s1_mid） | exam-battle | 5 | 4 | 文案是「先打败前面的章节守护者」和「回地图」 |

### 未完成

- 词 mp3：863 条路径 `assets/audio/words/<id>.mp3`，存在 0。清单 `evidence/w10-resource-gap.json`（114360 字节）。没有生成音频。
- 字体：public 里 12 个 woff2。包内字体文件 0。没有转换成 TTF/WOFF，也没有调用 `wx.loadFontFace`。
- 图：public 图片 297。包内图片只有 `assets/atlas/skeleton-atlas.png`（383 字节，P0.6 骨架）。温色图集 PNG 和 webp 不在小程序包里。13 份图集 JSON 在 `wechat/assets/atlas-json/index.js`。
- 没有新增分包页。磁盘可分发树低于 2MB，所以没有为了过 2MB 去拆包。
- `visual-diff` 仍无截图。`evidence/w7/NOT-CAPTURED.json` 继续有效。这一项是未验证。

### 真实 IDE 待验

- 开发者工具编译、上传体积、`wx.getWindowInfo`、`wx.getPerformance`、真机输入法、真机 `wx.setStorageSync`、`wx.loadFontFace` 成功回调、手机截图。
- 上表的 1084640 字节是按 `project.config.json` 的 `packOptions.ignore` 数的磁盘文件。它不是开发者工具主包。public 的 33613886 字节已排除，不能当成已分包。

### 体积（这一轮）

| 包 | 字节 | 说明 |
|---|---|---|
| packed | 1084640 | ignore 之后的 wechat 文件。低于 2MB。IDE 未验证 |
| lib | 932706 | domain.cjs.js 251052，game.cjs.js 681654 |
| public | 33613886 | 排除，未打进小程序 |
| 词 mp3 | 0 | 包内和 public 都是 0 |
| 字体文件 | 0 | 包内。public 仍是 12 个 woff2 |


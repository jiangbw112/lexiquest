# 词境练习家 · 全量移植验收材料

- 分支 / 提交：`cursor/wechat-full-port`。提交号以本文件所在提交为准。
- 环境：Linux 6.12.113+，Node v22.23.4，npm 10.9.9。微信开发者工具未安装。基础库未从运行时读取。模拟器机型未读取。真机未连接。
- 结论：未通过。开发者工具、真机、主包体积、场景重排、词音频、字体加载和 `host-copy` 都没有完成。
- 续修后的结论仍是未通过。页面链、词表、战斗到结算、逻辑像素和磁盘分包口径有新的实测，见文末「续修」。开发者工具和真机仍待授权验证。

下面两节是历史，不是当前状态。首轮「逐项结果」「体积」停在 `1226b89` 之前。`续修（父提交 1226b89 之后）` 停在 `ec88639`。当前只看文末「当前（父提交 ec88639 之后）」。

## 逐项结果（历史，首轮）

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

## 续修（历史，父提交 1226b89 之后，停在 ec88639）

上一节保持原样。下面是那一轮普通追加提交的实测，不是当前状态。全部门未过：开发者工具和真机仍是待授权验证。

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

## 上一轮（父提交 ec88639，head 0ea60bd）

门禁：未通过。开发者工具、真机、`wx.loadFontFace` 成功回调、词 mp3、以及和原画面重合的重排都没有完成。下面这张表是当前唯一状态。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 用户链 | 新建角色、三年级、原生输入「小林」、学堂听一听、选出「n. 树」、对战里的小战斗、结算、词卡册、复习桌。存档名小林，年级 G3，词卡 tree，胜 1 负 0，复习不再发一张卡 | `evidence/w7-user-chain.log`，`evidence/w7-user-chain.json` | Node 页面适配器的点击和表单。不是 `openPractice`，也不是 `start("battle")` |
| 复习有数据但未到时间 | 册子「已收集 1 个」和 tree。复习桌同时有 tree、「大约 10 分钟后」和「现在没有到复习时间的词」。沙漏按钮只在 `devModeEnabled(location.search)` 时出现，这次没有打开 | 同上 | Node。游戏自己的到期规则 |
| 几何 | 学堂、战斗、结算、词卡册、复习在 844×390、667×375、915×412、1024×768 上 `measured true`，字号至少 14，热区至少 44，间距至少 8，溢出 0 | 同上 | Chrome `measureText`。不是 Node 的汉字宽度估算，不是开发者工具，不是真机 |
| 图集绘制 | 结算画面 57 个 `drawImage`，都带源矩形。其中一个是 `atlas_ui_core.png` 的 sx 680、sy 2、sw 40、sh 40。采样 8×8 有 29 种颜色 | `evidence/w3-browser-canvas.png`，`evidence/w7-user-chain.log` | Chrome 画布重放。不是开发者工具，不是真机 |
| 旋转、翻转、着色 | 这条结算画面的 rotation、flip、tint 都是 0。`paintImage` 会在节点自己带这些值时应用。这次没有这样的节点 | 用户链日志 | Node 计划，Chrome 绘制 |
| 构图 | 未通过。背景和面板仍按世界缩放画在原位，重排后的文字叠在上面。截图看得到星星、面板和文字叠在一起 | 同上截图 | Chrome 画布 |
| 字形缓存 | 未完成。文字仍是 `fillText`，没有按帧缓存成纹理 | `wechat/engine/paint.ts` | 源码 |
| 字体调用 | 12 个已打包 TTF 都调用了 `loadPackedFonts`。这次没有 `wx`，12 次都是失败。原因写明官方 `source` 是 https，或基础库 3.7.9 起的 Data URL。没有编造云地址 | 用户链日志 | Node |
| 字体素材 | 12 个 TTF，998884 字节，在 `packages/fonts`。`project.config.json` 的 `libVersion` 仍是 3.5.5。仓库里没有私有配置里的 3.18.1 | `evidence/w10-size-r2.log` | 文件系统。IDE 能否加载未验证 |
| 词音调用 | 学堂「听一听」调用了 `speakWordFile`。失败原文是 `word audio missing: tree` | 用户链日志 | Node |
| 词音素材 | 包内 mp3 为 0，public 词 mp3 为 0。没有购买，没有生成音频 | `evidence/w10-size-r2.log` | 文件系统 |
| 可导入包 | 主包 1100496。`packages/art-ui` 1986863。`packages/art-world` 384080。`packages/fonts` 999279。合计 4470718。都在 2MB 以内，合计在 20MB 以内 | `evidence/w10-size-r2.log`，`evidence/w10-resource-r2.json` | 磁盘。不是开发者工具上传体积，也不是 git 压缩包 |
| 历史体积 | `ec88639` 的 packed 1084640 是当时还没有这些图和字体的主包磁盘数。它不是现在的可导入包 | 上一节 | 历史 |
| 必需但未入包 | public 图片 297 个、31515282 字节。其中 21 张温色图打进分包。其余 276 张、29145129 字节没有打进包，也没有删 | 同上 | 文件系统 |
| public | 33613886 字节排除在小程序包外 | 同上 | 文件系统 |
| 分包加载 | `app.js` 在有 `wx` 时调用 `wx.loadSubpackage`。这次运行没有 `wx`，没有真的下载 | `wechat/app.js` | 源码。IDE 未验证 |
| 旧页面链 | `check-page-chain.cjs` 仍用练习档和 `start("battle")`，只作回归。它改写 `w8-chain-r2.json`，不覆盖 `w8-chain.json` | `evidence/w7-page-chain-r2.log` | Node。不是这条用户链的证明 |
| 桌面基线 | vitest 637 passed / 1 skipped。web boot 3162002。p05 checks 452 | `evidence/w11-vitest-r2.log`，`evidence/w11-npm-build-r2.log` | Node 网页构建。`src` 未改 |
| 开发者工具和真机 | 未验证 | 无 | 待授权 |
| 衣柜裁剪 | 通过这一项，不代表移植通过。6 行里窗口内 3 行仍在，窗口外像素从 `[245,230,205]` 变成清屏 `[32,32,32]`，窗口内像素保持 `[206,215,192]`。滚轮把 `board.y` 从 168 收到 -32（scroll 200 / maxScroll 288），画面换成下面三行。边界内点击把 `equippedOutfitId` 从 traveler 改成 forest-cape；列表外的指针和被裁掉的点都不改。`clearMask` 之后溢出像素回到 `[245,230,205]`。paint 返回后的绿色填充是 `[0,204,68]`，clip 没有留在后续绘制上 | `evidence/w3-clip.log`，`evidence/w3-wardrobe-before.png`，`evidence/w3-wardrobe-after.png`，`evidence/w3-wardrobe-scrolled.png`，`evidence/w3-wardrobe-full.png` | Chrome 画布，跑的是 `wechat/lib/game.cjs.js`。不是开发者工具，不是真机 |
| 旋转和翻转 | 独立画布：左红右蓝的图，`flipX` 后左边是蓝、右边是红；旋转 90° 后上红下蓝。跨出 mask 的右半边是清屏 `[32,32,32]`，`clearMask` 后变成蓝 `[0,0,255]`。mask 后面的绿色矩形一直是 `[0,204,68]`。容器自身的旋转、翻转，以及旋转后的命中，这次没有采样 | `evidence/w3-clip-transform.png`，`evidence/w3-clip.log` | Chrome 画布。不是开发者工具，不是真机 |
| 裁剪之后仍未完成 | 全场景截图里货架文字仍叠在衣柜面板上。字形仍是 `fillText`。276 张图未入包，mp3 仍是 0，12 个字体在没有 `wx` 时仍失败，`libVersion` 仍是 3.5.5。班级和章节图集这次仍报缺资源 | `evidence/w3-wardrobe-full.png`，上一行的体积和字体 | 同上。开发者工具和真机仍未验证 |

默认存档只有 traveler，列表不溢出。这次把目录里的 forest-cape、star-sash、forest_leaf_cape、acorn_pin、forest_wreath 写进衣柜已经在读的那个存档，用来让第 4 行落到窗口外。这不是新衣服。`board.add` 会把子节点从场景根上拿掉，所以 `check-page-chain` 的根节点数变少，文字数除衣柜外不变。旧的矩阵留在 `evidence/w8-chain-r2-before-clip.json`。衣柜文字从 12 变成 7，是因为行标签改在 mask 里画，不再进货架。p05 仍是 checks 452。`check-engine` 通过。用户链和桌面 vitest 这次没有重跑，`src` 没有改。

## 当前（父提交 0ea60bd 之后）

门禁：未通过。这一轮只收了裁剪和衣柜构图。开发者工具、真机、字形缓存、276 张未入包的图、词 mp3、`libVersion` 3.5.5 都还没做完。下面这张表只引用这一轮真的重跑过的日志。`w10-size-r2.log`、`w11-p05-clip.log`、`w3-engine-clip.log`、`w7-user-chain.log`、`w11-vitest-r2.log` 不是这一轮的结果。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 单层矩形裁剪 | 仍通过。窗口外像素 `[32,32,32]`，窗口内 `[206,215,192]`。滚轮把 `board.y` 从 168 收到 -32。窗口内点击把装备从 traveler 改成 forest-cape。被裁掉的点和直接 emit 的窗口外指针都不改装备。`clearMask` 后溢出像素回到 `[245,230,205]`。paint 返回后的绿块是 `[0,204,68]` | `evidence/w3-clip.log`，`evidence/w3-wardrobe-before.png`，`evidence/w3-wardrobe-after.png`，`evidence/w3-wardrobe-scrolled.png` | Chrome 画布，`wechat/lib/game.cjs.js`。不是开发者工具，不是真机 |
| 子图翻转和旋转 | 仍通过。`flipX` 后左蓝右红，旋转 90° 后上红下蓝。跨出 mask 的一半是 `[32,32,32]`，`clearMask` 后变回蓝。后面的绿矩形一直是 `[0,204,68]` | `evidence/w3-clip-transform.png`，`evidence/w3-clip.log` | Chrome。这是子 Image，不是容器 |
| 嵌套 mask | 通过。外层两个 `fillRect` 中间有缝，内层是圆。交点 `[255,204,0]`。圆的外接正方形角、两矩形之间的缝、只在外层第二块里的点都是 `[32,32,32]`。只有交点命中 `nested-blob`。paint 返回后的绿块仍是 `[0,204,68]` | `evidence/w3-clip-nested.png`，`evidence/w3-clip.log` | Chrome。不是开发者工具，不是真机 |
| 容器自身旋转和翻转 | 通过。容器 `flipX` 后子矩形出现在翻转后的位置，颜色 `[255,0,0]`，原来的位置是 `[32,32,32]`，只有翻转后的点命中 `flipped-board`。容器旋转 90° 后子矩形在下方，颜色 `[0,0,255]`，未旋转的位置和转出 mask 的那一截都是 `[32,32,32]`，只有 mask 内的点命中 `turned-board` | `evidence/w3-clip-container.png`，`evidence/w3-clip.log` | Chrome。不是开发者工具，不是真机 |
| 衣柜构图 | 通过这一项，不代表别的场景。标题、说明、已有装备在列表窗口上方，称号和滚动说明在窗口下方，返回在右下角按钮上。这些字盒和按钮盒都不和列表 mask 相交。列表窗口屏幕盒是 x 178.3、y 81.9、w 331.5、h 140.4。第一行槽中心像素仍是 `[206,215,192]` | `evidence/w3-wardrobe-overlap-before.png`，`evidence/w3-wardrobe-overlap-after.png`，`evidence/w3-wardrobe-full.png`，`evidence/w3-clip.log` | Chrome 844×390。修前图是 head 0ea60bd 的完整衣柜。不是开发者工具，不是真机 |
| 其它场景的货架重排 | 未完成。这一轮没有重跑用户链，也没有改非衣柜场景的排布 | 上一节的 `evidence/w3-browser-canvas.png` | 不是这一轮的新跑 |
| 字形缓存 | 未完成。文字仍是 `fillText` | `wechat/engine/paint.ts` | 源码 |
| 可导入包 | 主包 1111008。`packages/art-ui` 1986863。`packages/art-world` 384080。`packages/fonts` 999279。合计 4481230。`game.cjs.js` 是 702589 字节。都在 2MB 以内，合计在 20MB 以内 | `evidence/w10-size-r3.log`，`evidence/w10-resource-r3.json` | 磁盘。不是开发者工具上传体积 |
| 未入包的图和词音 | 276 张、29145129 字节仍未入包。包内 mp3 是 0。public 词 mp3 是 0。这一轮没有重跑「听一听」 | `evidence/w10-size-r3.log` | 文件系统 |
| 字体和基础库 | `project.config.json` 的 `libVersion` 仍是 3.5.5。这一轮没有重跑 `loadPackedFonts`。上一轮的 12 次失败不能当成这一轮的新结果 | `wechat/project.config.json` | 读文件。IDE 未验证 |
| 开发者工具和真机 | 未验证。没有打开微信开发者工具，没有真机，没有测 `wx` canvas 的 clip | 无 | 待授权 |

844×390 上 scale 是 0.4875，列表 mask 是世界坐标 `fillRect(140, 168, 680, 288)`。衣柜字按设计行放在这个窗口外面，字号收到下一行之前，最小 14。返回的字在按钮盒内：按钮 x 573.1、y 342.2、w 87.8、h 27.3，文字 x 581、y 347.4、w 72.1、h 17。`src` 没有改。p05、engine、用户链、vitest、page-chain 这一轮都没有重跑。


# 词境练习家 · 全量移植验收材料

- 分支 / 提交：`cursor/wechat-full-port`。提交号以本文件所在提交为准。
- 环境：Linux 6.12.113+，Node v22.23.4，npm 10.9.9。微信开发者工具未安装。基础库未从运行时读取。模拟器机型未读取。真机未连接。
- 结论：未通过。开发者工具、真机、主包体积、场景重排、词音频、字体加载和 `host-copy` 都没有完成。
- 续修后的结论仍是未通过。页面链、词表、战斗到结算、逻辑像素和磁盘分包口径有新的实测，见文末「续修」。开发者工具和真机仍待授权验证。

下面的旧节都是历史，不是当前状态。首轮「逐项结果」「体积」停在 `1226b89` 之前。`续修（父提交 1226b89 之后）` 停在 `ec88639`。`上一轮（父提交 ec88639，head 0ea60bd）` 停在 `0ea60bd`。`上一轮（父提交 0ea60bd，head 068d837）` 停在 `068d837`。`上一轮（head cc0287e）` 停在 `cc0287e`。`上一轮（父提交 cc0287e，head 7a2456e）` 停在 `7a2456e`。`上一轮（父提交 7a2456e 之后）` 停在 `85414ea`。`上一轮（父提交 85414ea 之后）` 停在 `60fa631`。`上一轮（父提交 60fa631 之后）` 停在 `42ebeaf`。当前只看文末「当前（父提交 42ebeaf 之后）」。

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

## 上一轮（父提交 0ea60bd，head 068d837）

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

## 上一轮（head cc0287e）

门禁：未通过。编码上能做完的几项有了新日志，体积、词音、字体真机加载、图集 JSON、场景截图比对、开发者工具和真机仍然挡住全部门。`w3-clip.log`、`w7-user-chain.log`、`w10-size-r3.log` 保持上一轮的字节。这一轮的新文件是 `w3-clip-r2.log`、`w3-glyph.log`、`w7-user-chain-r3.log`、`w10-size-r4.log`。桌面 vitest 和 web boot 这一轮没有重跑，不能当作微信验收。p05 没有重跑。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 字形纹理 | 通过这一项。第一遍主画布 `fillText` 0 次、`drawImage` 1 次、新建纹理 1 张。第二遍 `fillText` 仍是 0、`drawImage` 1 次、复用 1 次。画面上有墨点 | `evidence/w3-glyph.log` | Chrome 画布，`wechat/lib/game.cjs.js`。不是开发者工具，不是真机 |
| 单层、嵌套、容器裁剪 | 仍通过。窗口外 `[32,32,32]`，窗口内 `[206,215,192]`。滚轮 168 到 -32。窗口内点击把装备改成 forest-cape。嵌套交点 `[255,204,0]`，缝和圆外接角是 `[32,32,32]`。容器翻转后 `[255,0,0]`，旋转后 `[0,0,255]`，转出 mask 的点不命中 | `evidence/w3-clip-r2.log`，`evidence/w3-wardrobe-before-r2.png`，`evidence/w3-wardrobe-after-r2.png`，`evidence/w3-wardrobe-scrolled-r2.png` | Chrome。不是开发者工具，不是真机 |
| 逻辑像素重排 | 通过这一项的几何。学堂、战斗、结算、词卡册、复习在 844×390、667×375、915×412、1024×768 上 `overlap` 0、`overflow` 0、`minGap` 是 8 或 10、`minFont` 不少于 14、热区不少于 44。宽度来自 Chrome `measureText`。占视口 18% 以上的羊皮纸和 62% 以上的底图不挡字，更小的图和衣柜列表 mask 挡字 | `evidence/w7-user-chain-r3.log` | Chrome 量宽，Node 点按钮。不是开发者工具，不是真机 |
| 用户点击链 | 通过这条路径，不代表门禁。新建角色、三年级、名字表单「小林」、学堂听一听、战斗胜利 1 场。词卡册是「已收集 1 个」并且看得到 tree。复习桌先显示 tree 和「大约 10 分钟后」。村子上第一次点「复习桌」没有离开 overworld，第二次进入。`?dev=1` 后沙漏按钮出现，点「沙漏 +10 分钟」「翻看释义」「记得」后 `reviewInstants` 从 1 变成 2 | `evidence/w7-user-chain-r3.log`，`evidence/w7-user-chain-r3.json`，`evidence/w3-browser-canvas-r3.png` | 同上 |
| 其余场景 | 未完成对照。skills、wardrobe、guide、ending、duel、exam-battle、title 能在这条存档上构造，文字盒 `overlap` 0、`overflow` 0。没有和 web 截图比对，没有开发者工具进出记录 | `evidence/w7-user-chain-r3.log` 的 scene 行 | Node 构造。不是开发者工具，不是真机 |
| 可导入包 | 失败。主包 1165988。art-ui 1986863。art-world 384080。fonts 999279。art-extra-01 到 art-extra-16 见 `w10-size-r4.log`，最大的是 art-extra-02 的 1983633。合计 33687659，超过 20971520，也超过 31457280。退出码 2。`game.cjs.js` 是 705876 字节 | `evidence/w10-size-r4.log`，`evidence/w10-resource-r4.json` | 磁盘。不是开发者工具上传体积 |
| 拆包 | 没有删图。累计到 art-extra-08 是 19595367，仍在 20MB 内。art-extra-09 起超过 20MB。累计到 art-extra-14 是 31263160，仍在 30MB 内。art-extra-15 起超过 30MB。班级图 25 张、5667914 字节，章节类图 148 张、17997908 字节，都在 art-extra 里。图集 JSON 旁路文件 158 个、1203952 字节仍只在 public，没有进 `assets/atlas-json`，所以裁剪日志里的 15 条缺资源不能当成已经消失 | `evidence/w10-pack-plan.json`，`evidence/w10-size-r4.log`，`evidence/w3-clip-r2.log` | 文件系统。JSON 这一条没有重跑启动 |
| 词音 | 调用和素材分开。`听一听` 记下 `word audio missing: tree`。状态行是 `atlas load failed: packed · word audio missing: tree`。包内 mp3 0，public 词 mp3 0。没有生成或购买音频 | `evidence/w7-user-chain-r3.log`，`evidence/w10-size-r4.log` | Node 点击。不是微信内置音频 |
| 字体 | 12 个 TTF 仍在 fonts 分包。这一轮 `loadPackedFonts` 又跑了 12 次，全部失败，原因写明没有 `wx.loadFontFace`，官方 source 是 https，或基础库 3.7.9 起的 Data URL。`project.config.json` 的 `libVersion` 已改成 3.7.9。没有编造 https 地址。开发者工具的 private config 仍可能覆盖这个版本，这一轮没有打开工具，所以字体没有真正加载成功 | `evidence/w7-user-chain-r3.log`，`wechat/project.config.json` | Node。不是开发者工具 |
| 开发者工具和真机 | 未验证 | 无 | 待授权 |

已修的编码：嵌套 mask 与容器变换、字形纹理、四个视口上文字不压插图和列表、点击链写到词卡和一次到期复习、276 张图按分包进包、状态带能看见缺词音、基础库配置改到官方 Data URL 的 3.7.9。仍缺的编码：图集 JSON 没有接进资源读取，所以上一节的缺资源启动错误还在；W8 没有截图差。外部素材：词 mp3 0/863，图集 JSON 158 个还在 public。未授权：微信开发者工具、真机、上传体积。`src`、`desktop`、根 `package.json` 没有改。`?p06` 和 P0.6.1 工装没有改字节。

## 上一轮（父提交 cc0287e，head 7a2456e）

门禁：未通过。这一轮把班级和章节 JSON 接进了读取，复习桌一次点击能进入，结算文字不再靠整张羊皮纸豁免来算 overlap 0。全量包仍然超过 20MB 和 30MB。词 mp3 仍是 0。字体在没有 `wx` 时仍失败。没有 web 像素差，没有开发者工具，没有真机。p05、桌面 vitest、web boot 这一轮没有重跑。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 图集 JSON | 通过这一项的启动检查。158 个已有 JSON、1,203,952 字节复制进 `packages/art-json`。主包只留路径表。衣柜启动 `failureCount` 0，`missingAssets` 是空数组。没有编造下载地址 | `evidence/w3-clip-r3.log`，`evidence/w10-json-plan.json` | Chrome 画布读的是这些文件。不是开发者工具 |
| 复习桌第一次点击 | 通过这条路径。离开词卡册后点一次「复习桌」，再走 400ms，场景是 review，画面有 tree 和「大约 10 分钟后」，没有沙漏。返回村子后再点一次，400ms 后再次进入。`?dev=1` 只用于随后的沙漏写回。`reviewInstants` 从 1 到 2，到期 `2026-11-27T15:50:37.273Z` | `evidence/w7-user-chain-r4.log` | Node 点页面按钮。不是开发者工具 |
| 结算重排 | 羊皮纸木框和小图算重叠，纸心和整屏底图不算。说明按设计顺序先放进纸心。纸心放不下的字放到纸外，并铺一层 `#f3e2c2`，不再是绿底上的淡字。四个视口 `overlap` 0、`overflow` 0。纸外的字还在，没有删 | `evidence/w3-results-before.png`，`evidence/w3-results-after.png`，`evidence/w7-user-chain-r4.log` | Chrome 重放。不是开发者工具 |
| 字形 | 四句不同样式。第一遍主画布 `fillText` 0、`drawImage` 4、新建 4、复用 0。第二遍 `fillText` 0、`drawImage` 4、新建仍是 4、复用 4 | `evidence/w3-glyph-r2.log` | Chrome。不是开发者工具 |
| 裁剪 | 仍通过。窗口外不画，窗口内可装备，嵌套和容器变换的像素与上一轮同一组断言。这一轮启动不再报缺资源 | `evidence/w3-clip-r3.log`，`evidence/w3-wardrobe-full-r3.png` | Chrome |
| 其余场景 | 未完成和 web 的像素差。skills、wardrobe、guide、ending、duel、exam-battle、title 各有一张 Chrome 重放，文字盒 `overlap` 0、`overflow` 0。没有对照图 | `evidence/w8-r4-skills.png` 以及同目录其余 `w8-r4-*.png`，`evidence/w7-user-chain-r4.log` | Chrome 重放。不是 web 差，不是开发者工具 |
| 可导入包 | 失败，硬阻塞。主包 1,190,789。art-json 1,204,347。其余分包见 `w10-size-r5.log`。合计 34,916,807。超过 20,971,520，也超过 31,457,280。退出码 2。单包都没有超过 2MB，最大是 art-extra-02 的 1,983,633。`game.cjs.js` 707,357 字节，SHA256 `afbaa7c4bea0d888196ce73f91ca3838e08e23f768ea84254ea6d4534b7ad671` | `evidence/w10-size-r5.log`，`evidence/w10-resource-r5.json` | 磁盘，按 packOptions.ignore。不是上传体积 |
| 分界 | 没有删原画。累计到 art-extra-08 是 19,620,168，仍小于 20,971,520。art-extra-09 起超过 20MB。累计到 art-extra-14 是 31,287,961，仍小于 31,457,280。art-extra-15 起超过 30MB。art-json 在这两条分界之后 | `evidence/w10-size-r5.log` | 同上 |
| 词音 | 仍是外部素材。调用记下 `word audio missing: tree`。状态行同时有图集失败和这句缺音频。包内 mp3 0，public 词 mp3 0 | `evidence/w7-user-chain-r4.log`，`evidence/w10-size-r5.log` | Node。没有生成音频 |
| 字体 | `libVersion` 仍是 3.7.9。12 次加载全部失败，原因仍是没有 `wx.loadFontFace`。没有写成加载成功 | `evidence/w7-user-chain-r4.log` | Node |
| 开发者工具和真机 | 未验证 | 无 | 待授权 |

已修的编码：图集 JSON 读取、复习桌一次点击进入、纸心与木框分开计的重叠、纸外说明的底色、四句字形复用。仍缺的编码：结算纸外仍有说明，没有收成一张纸内的版面；W8 没有 web 像素差。外部素材：词 mp3 0/863。未授权：开发者工具、真机、上传体积。包体超限是硬阻塞，原画和 JSON 都还在包里。`src`、`desktop`、根 `package.json` 没有改。`?p06` 和 P0.6.1 工装没有改字节。

## 上一轮（父提交 7a2456e 之后）

门禁：未通过。这一轮把结算和 W8 的说明收进纸面，同一局「一共 7 题 / 答对 3 题」的前后图不再是两场战斗。全量包仍然超过 20MB 和 30MB。词 mp3 仍是 0。字体在没有 `wx` 时仍失败。没有现成网页构建，所以没有 web 像素差。没有开发者工具，没有真机。p05、桌面 vitest、web boot 这一轮没有重跑。JSON 读取仍是测试里的文件钩子，不是 `wx.readFileSync` 已通过。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 结算同一帧 | 通过这一项的纸内排版。冻结的是同一份结算：一共 7 题，答对 3 题，还有 5 个新词。前图把说明铺在纸外的奶油条上。后图这些句子都在羊皮纸里，非嵌套文字 `onPaper` 为 0 条在外。844×390、667×375、915×412、1024×768 都是 `minFont` 14、热区 44、`minGap` 8、`overflow` 0、`overlap` 0。文案没有删。纸面下半和奖励卡共用这一张羊皮纸，有的句子落在奖励卡上沿 | `evidence/w3-results-r5-view.json`，`evidence/w3-results-r5-before.png`，`evidence/w3-results-r5-after.png`，`evidence/w7-user-chain-r5.log` | Chrome `measureText` 重放。不是开发者工具，不是两场战斗的像素差 |
| 指南和标题 | 指南的「给家长」和整段说明在羊皮纸里，返回仍是按钮。标题页没有原装羊皮纸，句子放在一张有内边距的 `#fff4dc` 纸上，不再是贴着字形的奶油条 | `evidence/w8-r5-guide.png`，`evidence/w8-r5-title.png` | Chrome 重放 |
| 技能、结局、衣柜、对战 | 说明在各自的羊皮纸里。`off paper` 0，`overlap` 0，`overflow` 0。衣柜标题和「已有装备」不压列表 mask | `evidence/w8-r5-skills.png`，`evidence/w8-r5-ending.png`，`evidence/w8-r5-wardrobe.png`，`evidence/w8-r5-duel.png`，`evidence/w3-clip-r6.log` | Chrome |
| 考试战斗 | `start("exam-battle")` 没有考卷时进入的是关卡地图。侧栏纸心只有约 114 像素宽，装不下状态句，所以这些句子改放到左侧一张有内边距的纸上，不再是绿底奶油条。`overlap` 0，`overflow` 0 | `evidence/w8-r5-exam-battle.png`，`evidence/w7-user-chain-r5.log` | Chrome 重放。不是一场真正开打的考试 |
| web 像素差 | 未完成。仓库里没有现成的 `dist/` 网页构建。这一轮没有改 `src`、`desktop` 或根脚本，也没有新打网页包。上面的图是微信画布适配器的 Chrome 重放，不是网页对照，也不是开发者工具截图 | 无对照图 | 未做差 |
| 图集 JSON | 仍能读到。衣柜启动 `failureCount` 0，`missingAssets` 为空。这是 Chrome 里的文件钩子，不是微信文件 API | `evidence/w3-clip-r6.log` | Chrome |
| 复习桌第一次点击 | 仍是一次点击加 400ms 进入。离开词卡册后第一次进入 review，画面有 tree 和「大约 10 分钟后」。返回后再点一次仍进入。`?dev=1` 只用于随后的沙漏。`reviewInstants` 从 1 到 2，到期 `2026-11-27T16:40:03.434Z` | `evidence/w7-user-chain-r5.log` | Node 点页面按钮 |
| 字形 | 四句仍复用。第一遍主画布 `fillText` 0、`drawImage` 4、新建 4、复用 0。第二遍 `fillText` 0、`drawImage` 4、新建仍是 4、复用 4 | `evidence/w3-glyph-r3.log` | Chrome |
| 裁剪 | 仍通过。窗口外像素 `[32,32,32]`，窗口内 `[206,215,192]`。窗口内点按把装备从 traveler 改成 forest-cape。嵌套和容器变换的像素断言仍在。日志是这一轮新写的 `w3-clip-r6.log`，没有覆盖 `w3-clip-r3.log` | `evidence/w3-clip-r6.log` | Chrome |
| 可导入包 | 失败，硬阻塞。主包 1,192,539。art-json 1,204,347。合计 34,918,557。超过 20,971,520，也超过 31,457,280。退出码 2。`game.cjs.js` 709,107 字节，SHA256 `e10e890e8bd830e1132c7033a9a11dd9c7745c4b7ca851b3ce7c3d378eb999dd`。没有删原画或 JSON | `evidence/w10-size-r6.log`，`evidence/w10-resource-r6.json` | 磁盘，按 packOptions.ignore。不是上传体积 |
| 分界 | 累计到 art-extra-08 是 19,621,918，仍小于 20,971,520。art-extra-09 起超过 20MB。累计到 art-extra-14 是 31,289,711，仍小于 31,457,280。art-extra-15 起超过 30MB | `evidence/w10-size-r6.log` | 同上 |
| 词音 | 仍是外部素材。调用记下 `word audio missing: tree`。状态行同时有图集失败和这句缺音频。包内 mp3 0，public 词 mp3 0。没有生成或购买 | `evidence/w7-user-chain-r5.log`，`evidence/w10-size-r6.log` | Node |
| 字体 | `libVersion` 仍是 3.7.9。12 次加载全部失败，原因仍是没有 `wx.loadFontFace`。没有写成加载成功 | `evidence/w7-user-chain-r5.log` | Node |
| 开发者工具和真机 | 未验证 | 无 | 待授权 |

已修的编码：结算说明和 W8 场景的纸外奶油条改到纸内；同一结算帧的前后重放；字形复用和裁剪在新包上又跑过。仍缺的编码：没有 web 像素差。地图状态句放在另开的纸上，不是塞进那条 114 像素宽的侧栏。外部素材：词 mp3 0/863。未授权：开发者工具、真机、上传体积。包体超限是硬阻塞，原画和 JSON 都还在包里。`src`、`desktop`、根 `package.json` 没有改。`?p06` 和 P0.6.1 工装没有改字节。

## 上一轮（父提交 85414ea 之后）

门禁：未通过。这一轮把结算后两行从奖励卡和经验条上挪走，技能说明不再压列表行，对战说明不再被内层小纸盖住，考试左侧改成一列垫纸。全量包仍然超过 20MB 和 30MB。词 mp3 仍是 0。字体在没有 `wx` 时仍失败。仓库没有现成 `dist/`，没有 web 像素差。没有开发者工具，没有真机。p05、桌面 vitest、web boot 这一轮没有重跑。JSON 读取仍是测试里的文件钩子，不是 `wx.readFileSync` 已通过。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 结算同一帧 | 通过这一项的避让。冻结的仍是同一份结算：一共 7 题，答对 3 题，还有 5 个新词。前图里「已经穿上啦…」「新技能卡 坚守 ★1 ★2」压在奖励卡上沿并贴着经验条。后图这些句子在左侧一张有内边距的 `#fff4dc` 垫纸上，羊皮纸里的奖励卡和经验条没有字压上去。文案没有删。844×390、667×375、915×412、1024×768 都是 `minFont` 14、热区 44、`minGap` 8、`overflow` 0、`overlap` 0、`off paper` 0 | `evidence/w3-results-r5-view.json`，`evidence/w3-results-r6-before.png`，`evidence/w3-results-r6-after.png`，`evidence/w7-user-chain-r6.log` | Chrome `measureText` 重放。不是开发者工具，不是两场战斗 |
| 穿过经验条的试验 | 正式页面不穿过经验条。试验选项 `trial=cross-bar` 只挡住列表行、放行经验条，测得 overlap：844 是 5，667 是 6，915 是 3，1024 是 0。这几条都是 `on progress_frame`，`list_row` 是 0。正式排版四个视口 overlap 都是 0。本包日志里没有「915/1024 变成 9 和 6」 | `evidence/w3-results-r6-bar-trial.log` | Chrome。不是微信通过 |
| 技能 | 技能名和描述在纸内按列排，不再压列表行边。`off paper` 0，`overlap` 0，`overflow` 0。最后一条「盾击 ★2」和它的说明、「战吼」因为这一行排得下而写在同一行，位置在垫纸底部，不在列表行上 | `evidence/w8-r6-skills.png`，`evidence/w7-user-chain-r6.log` | Chrome 重放 |
| 对战 | 内层小纸是空的。规则和「请把电脑交给 小朋友甲 第 1/4 题」在它下面的外层纸里。`overlap` 0，`overflow` 0 | `evidence/w8-r6-duel.png` | Chrome 重放 |
| 考试地图 | `start("exam-battle")` 没有考卷时进入关卡地图。左侧是一列有内边距的垫纸，不再是右列问号。未解锁词的「?」回到词卡上。`overlap` 0，`overflow` 0 | `evidence/w8-r6-exam-battle.png`，`evidence/w7-user-chain-r6.log` | Chrome 重放。不是一场真正开打的考试 |
| 指南、结局、衣柜、标题 | 没有回退。指南的「给家长」和说明仍在羊皮纸里。结局和衣柜说明仍在纸里。标题页仍是 `#fff4dc` 垫纸。指南标题仍靠近纸的上沿，`overlap` 仍是 0，这一轮没有改它 | `evidence/w8-r6-guide.png`，`evidence/w8-r6-ending.png`，`evidence/w8-r6-wardrobe.png`，`evidence/w8-r6-title.png` | Chrome 重放 |
| web 像素差 | 未完成。仓库里没有现成的 `dist/`。这一轮没有改 `src`、`desktop` 或根脚本，也没有新打网页包。上面的图是微信画布适配器的 Chrome 重放，不能代替网页像素差 | 无对照图 | 未做差 |
| 图集 JSON | 衣柜启动 `failureCount` 0，`missingAssets` 为空。这是 Chrome 里的文件钩子，不是 `wx.readFileSync` 已通过 | `evidence/w3-clip-r7.log` | Chrome |
| 复习桌第一次点击 | 仍是一次点击加 400ms 进入。再点一次仍进入。`reviewInstants` 从 1 到 2，到期 `2026-11-27T17:15:00.967Z` | `evidence/w7-user-chain-r6.log` | Node 点页面按钮 |
| 字形 | 四句仍复用。第一遍主画布 `fillText` 0、`drawImage` 4、新建 4、复用 0。第二遍 `fillText` 0、`drawImage` 4、新建仍是 4、复用 4。日志是 `w3-glyph-r4.log`，没有覆盖 `w3-glyph-r3.log` | `evidence/w3-glyph-r4.log` | Chrome |
| 裁剪 | 仍通过。窗口外像素 `[32,32,32]`，窗口内 `[206,215,192]`。窗口内点按把装备从 traveler 改成 forest-cape。日志是 `w3-clip-r7.log`，没有覆盖 `w3-clip-r6.log` | `evidence/w3-clip-r7.log` | Chrome |
| 可导入包 | 失败，硬阻塞。主包 1,198,705。art-json 1,204,347。合计 34,924,723。超过 20,971,520，也超过 31,457,280。退出码 2。唯一的 FAIL 行是合计超限，单个分包没有另外的 FAIL。`game.cjs.js` 715,273 字节，SHA256 `c13eac1199d3a65c04786497d9f962400381cbc020877e778dd094125186b4e7`。没有删原画或 JSON，没有购买云存储，没有下载地址 | `evidence/w10-size-r7.log`，`evidence/w10-resource-r7.json` | 磁盘，按 packOptions.ignore。不是上传体积 |
| 分界 | 累计到 art-extra-08 是 19,628,084，仍小于 20,971,520。art-extra-09 起超过 20MB。累计到 art-extra-14 是 31,295,877，仍小于 31,457,280。art-extra-15 起累计 33,279,405，超过 30MB | `evidence/w10-size-r7.log` | 同上 |
| 词音 | 仍是外部素材。调用记下 `word audio missing: tree`。包内 mp3 0，public 词 mp3 0。没有生成或购买 | `evidence/w7-user-chain-r6.log`，`evidence/w10-size-r7.log` | Node |
| 字体 | `libVersion` 仍是 3.7.9。12 次加载全部失败，原因仍是没有 `wx.loadFontFace`。没有写成加载成功 | `evidence/w7-user-chain-r6.log` | Node |
| 开发者工具和真机 | 未验证 | 无 | 待授权 |

已修的编码：结算奖励句避开奖励卡和经验条；技能说明避开列表行；对战说明避开内层小纸；考试左侧改成一列垫纸，问号回到词卡；同一结算帧的前后重放；穿过经验条的试验日志；字形复用和裁剪在新包上又跑过。仍缺的编码：没有 web 像素差，因为没有现成网页构建，这一轮也不能改 `src`。外部素材：词 mp3 0/863。未授权：开发者工具、真机、上传体积。包体超限是硬阻塞，原画和 JSON 都还在包里。`src`、`desktop`、根 `package.json` 没有改。`?p06` 和 P0.6.1 工装没有改字节。

## 上一轮（父提交 60fa631 之后）

门禁：未通过。这一轮只改了两处构图。技能末行不再把「盾击 ★2」、说明和「战吼」写在一起：名字和星在一行，说明在下一行。指南「给家长」离开左上角的叶子和纸的上沿，正文仍在同一张羊皮纸里。全量包仍然超过 20MB 和 30MB。词 mp3 仍是 0。字体在没有 `wx` 时仍失败。仓库没有现成 `dist/`，没有 web 像素差。没有开发者工具，没有真机。p05、桌面 vitest、web boot 这一轮没有重跑。JSON 读取仍是测试里的文件钩子，不是 `wx.readFileSync` 已通过。这些图是 Chrome 画布重放，不是微信通过。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 技能末行 | 同一条用户链里的技能页。前图底部是「盾击 ★2 撞上去，并挡住下一次一些伤害。 战吼」。后图改成「盾击 ★2」下一行才是它的说明，「战吼」下一行才是「大喊一声，打出更重的一击。」坚守、旋风斩也是名字和说明成对。字在垫纸上，不压列表行边。`overlap` 0 只是附加记录，构图以这两张图为准 | `evidence/w8-r7-skills-before.png`，`evidence/w8-r7-skills.png`，`evidence/w7-user-chain-r7.log` | Chrome 重放。同一条用户链，不是两场不同的技能页 |
| 指南标题 | 同一张未解锁的给家长纸。前图「给」压在叶子上，标题贴着上沿。后图叶子单独留在左上角，「给家长」在叶子下面，正文从标题下面接着排，句子没有删。`overlap` 0 只是附加记录 | `evidence/w8-r7-guide-before.png`，`evidence/w8-r7-guide.png` | Chrome 重放 |
| 结算、对战、考试 | 没有回退。冻结结算仍是一共 7 题、答对 3 题、还有 5 个新词，四个视口 `overlap` 0。对战说明仍在内层小纸下面。考试左侧仍是一列垫纸，问号仍在词卡上 | `evidence/w3-results-r7-after.png`，`evidence/w8-r7-duel.png`，`evidence/w8-r7-exam-battle.png`，`evidence/w7-user-chain-r7.log` | Chrome 重放 |
| web 像素差 | 未完成。仓库里没有现成的 `dist/`。这一轮没有改 `src`、`desktop` 或根脚本。上面的图不能代替网页像素差 | 无对照图 | 未做差 |
| 图集 JSON | 衣柜启动 `failureCount` 0，`missingAssets` 为空。这是 Chrome 里的文件钩子，不是 `wx.readFileSync` 已通过 | `evidence/w3-clip-r8.log` | Chrome |
| 复习桌第一次点击 | 仍是一次点击加 400ms 进入。再点一次仍进入。`reviewInstants` 从 1 到 2，到期 `2026-11-27T17:33:22.461Z` | `evidence/w7-user-chain-r7.log` | Node 点页面按钮 |
| 字形 | 四句仍复用。第一遍主画布 `fillText` 0、`drawImage` 4、新建 4、复用 0。第二遍新建仍是 4、复用 4。日志是 `w3-glyph-r5.log`，没有覆盖 `w3-glyph-r4.log` | `evidence/w3-glyph-r5.log` | Chrome |
| 裁剪 | 仍通过。窗口外像素 `[32,32,32]`，窗口内 `[206,215,192]`。窗口内点按把装备从 traveler 改成 forest-cape。日志是 `w3-clip-r8.log`，没有覆盖 `w3-clip-r7.log` | `evidence/w3-clip-r8.log` | Chrome |
| 可导入包 | 失败，硬阻塞。主包 1,201,547。art-json 1,204,347。合计 34,927,565。超过 20,971,520，也超过 31,457,280。退出码 2。唯一的 FAIL 行是合计超限。`game.cjs.js` 718,115 字节，SHA256 `4a90981685c84ce12976b51951d36d476bfea481b3fc1d7b8e2625243ac5a629`。没有删原画或 JSON | `evidence/w10-size-r8.log`，`evidence/w10-resource-r8.json` | 磁盘，按 packOptions.ignore。不是上传体积 |
| 分界 | 累计到 art-extra-08 是 19,630,926，仍小于 20,971,520。art-extra-09 起超过 20MB。累计到 art-extra-14 是 31,298,719，仍小于 31,457,280。art-extra-15 起累计 33,282,247，超过 30MB | `evidence/w10-size-r8.log` | 同上 |
| 词音 | 仍是外部素材。调用记下 `word audio missing: tree`。包内 mp3 0，public 词 mp3 0。没有生成或购买 | `evidence/w7-user-chain-r7.log`，`evidence/w10-size-r8.log` | Node |
| 字体 | `libVersion` 仍是 3.7.9。12 次加载全部失败，原因仍是没有 `wx.loadFontFace`。没有写成加载成功 | `evidence/w7-user-chain-r7.log` | Node |
| 开发者工具和真机 | 未验证 | 无 | 待授权 |

已修的编码：技能名字和说明按卡成对分行；指南标题离开叶子和上沿。仍缺的编码：没有 web 像素差。外部素材：词 mp3 0/863。未授权：开发者工具、真机、上传体积。包体超限是硬阻塞，原画和 JSON 都还在包里。`src`、`desktop`、根 `package.json` 没有改。`?p06` 和 P0.6.1 工装没有改字节。

## 当前（父提交 42ebeaf 之后）

门禁：未通过。可导入磁盘包这一轮进了 20,971,520 和 31,457,280。词 mp3 仍是 0/863。字体在没有 `wx.loadFontFace` 时仍失败。开发者工具、真机、上传体积没有做。W8 与网页的像素对照做了，六场有差，考试一场没有进入。p05 和桌面 vitest 这一轮没有重跑。这些网页图是 Chrome 打开 `dist/`，适配器图是 Chrome 重放微信布局，都不是开发者工具，也不是真机。

| 项 | 当前 | 证据 | 来源 |
|---|---|---|---|
| 压缩前 | 父提交 `42ebeaf` 的磁盘数，不是这一轮把压缩包拆开重测。主包 1,201,547。art-json 1,204,347。合计 34,927,565。超过两个上限。退出码 2 | `evidence/w10-size-r8.log` | 磁盘，按 packOptions.ignore |
| 压缩后 | 主包 1,201,756。art-ui 1,480,656。art-world 375,151。fonts 999,279。art-extra-01 到 16 依次是 586,757、724,247、965,367、1,044,681、986,602、976,499、951,145、907,135、1,031,599、967,891、1,088,457、1,027,441、1,136,895、928,953、1,264,443、416,011。art-json 1,204,347。合计 20,265,312。低于 20,971,520（余 706,208），也低于 31,457,280（余 11,191,968）。每个分包都低于 2,097,152，最大的是 art-ui。退出码 0。这是磁盘数，不是开发者工具上传体积 | `evidence/w10-size-r9.log`，`evidence/w10-resource-r9.json` | 磁盘，按 packOptions.ignore |
| 原画 | 没有从 `public/` 删文件。268 张被压缩的原画仍在，字节和压缩前的包内副本一致。清单里 `publicOriginalsStillMatchRecordedHash` 为真。public 图仍是 297 个、31,515,282 字节。包内图仍是 298 个、16,853,203 字节。art-ui 和 art-world 只在无损 WebP 更小且像素一致时替换，否则留 PNG。art-extra 用 WebP quality 35、method 4。对应关系在清单里 | `evidence/w10-compress-r9.json` | 文件哈希 |
| 词音 | 仍是缺口。词表 863。包内 mp3 0，public 词 mp3 0。这一轮没有再点听一听，也没有生成或购买 mp3。调用点仍写 `word audio missing` | `wechat/platform/tts.ts`，`evidence/w10-size-r9.log`，`wechat/lib/domain.cjs.js` 的 `CATALOG_WORDS` | 文件计数。不是新的点击日志 |
| 字体 | `libVersion` 仍是 3.7.9。这一轮 12 次加载，成功 0，失败 12。原因写明没有 `wx.loadFontFace`，正式来源是 https 或基础库 3.7.9 的 Data URL。没有写成加载成功 | `evidence/w3-font-r9.log`，`wechat/project.config.json` | Node。不是开发者工具 |
| 开发者工具和真机 | 未验证。没有开 Mac，没有上传 | 无 | 未授权 |
| 裁剪 | 压缩后又通过。窗口外 `[32,32,32]`，窗口内 `[206,215,192]`。装备从 traveler 改成 forest-cape。历史 `w3-clip-r8` 图没有覆盖。新日志是 r9 | `evidence/w3-clip-r9.log` | Chrome 画布。不是微信 |
| 网页构建 | `npm run build` 退出码 0。boot total 3,162,002，预算 4,194,304。`dist/` 已生成，没有提交，没有发布 | `/tmp/lexi-web-build.log` | Node。不是合入 |
| web 像素差 | 有差，不是通过。视口 1280×800：title 任一通道不同 99.80%，差大于 16 的 98.82%。skills 61.13% / 40.97%。wardrobe 51.60% / 40.35%。duel 41.72% / 34.76%。guide 88.80% / 86.07%。ending 57.11% / 53.00%。视口 844×390：title 78.93% / 78.00%。skills 65.14% / 39.28%。wardrobe 48.47% / 37.69%。duel 46.21% / 36.97%。guide 73.42% / 70.68%。ending 52.25% / 46.70%。1280 的技能页：网页是房间背景和分行的技能卡，适配器是绿底上一张纸、名字和说明成对往下排、卸下和换职业在纸外。1280 的给家长：网页标题在纸外，右侧还有设密码卡；适配器标题在叶子下面，纸上只有说明，没有密码卡 | `evidence/w8-r9-web-diff.json`，`evidence/w8-r9-shots.json` | Chrome 对 Chrome。不是开发者工具 |
| exam-battle | 未完成。两边 `dataset` 都停在 stages。网页画面是「当前没有可用题目，请返回学堂学习或稍后再试」，不是考试战。没有把这张图算成考试对照通过 | `evidence/w8-r9-web-1280x800-stages-no-questions.png`，`evidence/w8-r9-web-844x390-stages-no-questions.png` | Chrome |

已进限的是磁盘包，不是上传体积。网页对照已记录差值；考试一场未进入，因为新角色没有题目，不是再改一处布局。仍缺的编码：这一轮没有新的编码缺口。外部素材：词 mp3 0/863。未授权：开发者工具、真机、IDE 上传。复习一次点击、字形缓存、JSON 钩子这一轮没有重跑，不把上一轮日志写成新的通过。`game.cjs.js` 仍是 718,115 字节，SHA256 `4a90981685c84ce12976b51951d36d476bfea481b3fc1d7b8e2625243ac5a629`。`src`、`desktop`、根 `package.json` 没有改。`?p06` 和 P0.6.1 工装没有改字节。


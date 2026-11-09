# LexiQuest 森林章通关奖励外观 · v0.1-provisional（正式暂定图）

游戏里用的是这一包的图集和 `manifest.json`，放在 `public/assets/chapter/forest/v0.1/`。客户端读的是同一份清单的副本 `src/game/art/data/forest-rewards-manifest.json`。逐帧源图、预览和生成脚本留在交付包里，不进游戏。

状态：**暂定**。风格和配色沿用《美术规范 v0.2》和战士 P0 v0.1，等 Bowen 看过 MVP 再定。qaStatus = `integrable`：脚本自检 9/9 通过，并人工看过联系表和换装图；**还没有在 Phaser 运行时实际加载过**。
来源：全部由原创脚本 `tools/make_rewards.py` 用 Pillow + NumPy 矢量绘制，直接复用 P0 战士的逐帧骨架（`p0/tools/make_warrior.py` 的 pose/skeleton），所以每一帧都和身体对齐。没有用 AI 生图，没有参考任何第三方角色或教材图。license：项目自有。
规格依据：DES-04b v1 §6 / §6.2、槽位表 v0.2（`../slots_v0.2/`）。

## 内容
| 物品 | itemId | 槽位 | z | 文件 token | 锚点 | 解锁 | 屏蔽 |
|---|---|---|---|---|---|---|---|
| 林叶披肩 | `forest_leaf_cape` | cosmetic_back | 6 | cosBack | back | 通关 | 隐藏职业 `back`（整层） |
| 橡实别针 | `acorn_pin` | cosmetic_chest（v0.2 新增） | 47 | cosChest | chest（偏移见下） | 掌握度 50% | 无 |
| 森语花环 | `forest_wreath` | cosmetic_head | 65 | cosHead | head | 掌握度 100% | **整层隐藏 `outfit_head`**（战士整顶头盔连羽饰） |
| 叶子章 | `title_leaf_icon` → 帧 `ui_title_leafIcon` | UI | — | — | — | 三个称号共用 | — |
| 称号条 | 帧 `ui_title_chip` | UI 九宫格 | — | — | — | — | — |

- 六职通用、同一儿童体型、MVP 只 1 色（c01）。以后多色就预导出换色图，不用运行时 tint。
- 别针位置：盾和近侧手臂几乎一直挡着胸前，所以别针放在胸侧可见区（hip 局部坐标 (-30,-40)，等于 chest 锚点 + (-30,+10)）。21 帧里有 19 帧露出 ≥50%，attack_02/03 两帧大部分被手臂挡住，DES-04b §6.2 允许这种情况。

## 目录
| 路径 | 内容 |
|---|---|
| `frames/cosmetic_back|cosmetic_chest|cosmetic_head/*.png` | 3 件 × 21 帧 = 63 张，512×512 @2x RGBA，straight alpha，透明像素已做颜色外扩 |
| `frames/ui/ui_title_leafIcon.png`（64×64）、`ui_title_chip.png`（96×56） | UI 源图 |
| `atlas/char_cos_forestLeafCape_e@2x.*` | 1996×308，120.2 KB |
| `atlas/char_cos_acornPin_e@2x.*` | 812×52，11.0 KB |
| `atlas/char_cos_forestWreath_e@2x.*` | 2012×144，62.9 KB |
| `atlas/ui_title_forest@2x.*` | 168×68，4.4 KB（2 帧，不裁切） |
| `manifest.json` | 物品 id、槽位、z、hides、textureKey、layerPrefix、动画、屏蔽规则、UI 九宫格切线、qaStatus |
| `qa_report.json` | 自检结果与指标 |
| `contact_sheet.png` | 战士三件全戴，5 个动作 21 帧（逻辑尺寸，珊瑚十字为脚底锚点） |
| `preview/preview_warrior_forest_all.gif` | 三件全戴，全部动作循环 |
| `preview/wardrobe_still.png` | 换装对比：原装 / 单戴披肩 / 单戴别针 / 单戴花环（头盔隐藏）/ 三件全戴，× idle、attack、victory |
| `preview/layers_breakdown_idle_00.png` | 三层单独显示 + 合成 |
| `preview/ui_title_preview.png` | 叶子章 2x / 逻辑尺寸，称号条九宫格切线与拉伸示例（示例文字只在预览里，图里没有文字） |
| `tools/` | common / make_rewards / compose / pack_atlas / build_manifest / qa_check / previews。依赖 Python3 + Pillow + NumPy，**并且需要旁边的 `../p0/`**（读取战士骨架和图层）。属于资产工具，不是游戏代码 |

## 规格
- 帧网格和 P0 战士完全一致：源 512×512（逻辑 256，scaleFactor 2），foot 轴点 (256,448) = (0.5,0.875)；idle 4f@6 · walk 6f@10 · attack 5f@12 · hit 2f@8 · victory 4f@8，面右 `e`。
- 命名：`char_{subject}_{token}_e_{anim}_{NN}`，subject 为 camelCase 物品名（forestLeafCape / acornPin / forestWreath），按 `_` 切分正好 6 段。图集帧名 = 文件名去掉 `.png`。

## 层序（后 → 前，含章节装饰）
shadow 0 → (back 5，被披肩屏蔽) → **cosmetic_back 6** → hand_main 10 → body_back 20 → outfit_back 25 → body 30 → outfit_body 40 → **cosmetic_chest 47** → hair 50 → (outfit_head 60，被花环屏蔽) → **cosmetic_head 65** → body_front 70 → outfit_front 75 → hand_off 80

## 屏蔽规则（须进配置，见 manifest `hideRules`）
1. 装备 `cosmetic_back` → 隐藏 `back` 整层。
2. 装备 `cosmetic_head` → 隐藏 `outfit_head` 整层。战士会整顶头盔连羽饰一起消失，露出外观 A 的短发，花环戴在头发上。**不提供无羽饰头盔帧**。
3. `cosmetic_chest` 不屏蔽任何层。

## Phaser 3 加载提示（文字说明，不含代码）
1. 每件用 `load.atlas(textureKey, png, json)` 加载，textureKey 用 itemId（`forest_leaf_cape` / `acorn_pin` / `forest_wreath`）；UI 用 `ui_title_forest`。
2. 角色 Container 里按上面的层序，在 P0 战士的 11 个 Sprite 之间插入对应的 Sprite（坐标 (0,0)，`setOrigin(0.5, 0.875)`），或按 z 值 `setDepth` 后排序。Container 位置就是脚底点，整体缩放 0.5。
3. 动画：每件每个动作建一个动画，帧名为 `layerPrefix + _{anim}_{NN}`，帧数和 fps 读 manifest。和战士各层同时播放同一 key，或在主层的 update 里同步 frame index，保证逐帧对齐。图集是 trimmed 格式，Phaser 会按 spriteSourceSize 还原偏移。
4. 换装时先按 hideRules 隐藏被屏蔽的层，再显示装饰层。敌方朝左时对整个 Container 做 flipX 或 scaleX 取负。
5. 称号条：Phaser 3.60+ 用 `add.nineslice(x, y, 'ui_title_forest', 'ui_title_chip', 宽, 高, 26, 26, 24, 24)`（单位 @2x px，再缩放 0.5，或按逻辑值 13/13/12/12 自行换算）。叶子章用帧 `ui_title_leafIcon`，按逻辑 32² 显示。称号文字由游戏用字体渲染。
6. 纹理是 straight alpha（非预乘），用 Phaser 默认设置即可。
7. 占位图在 `../forest_rewards_placeholder_v0.1.zip`，ID、帧名、图集 key、alpha 轮廓都和本包相同。开发可以先接占位图，之后直接替换文件，不用改代码。

## QA（`qa_report.json`，9/9 通过）
命名与帧数 / 帧边缘无裁切、每帧只有一个连通块（没有漂浮碎片）、主要是不透明像素 / 边缘无黑白毛边 / 逐帧对齐：在锚点局部坐标里质心漂移，披肩 0.82 px，别针 0.15 px，花环 0.28 px，而且都贴在身体上 / 花环在隐藏头盔后不过眉不遮眼：脸侧最低点 y=-38.5，眉线约 -7，也没有盖到脸部皮肤 / 披肩在剑、手臂、头之后，领口每帧都连在身上 / 别针 19/21 帧露出 ≥50% / 图集 ≤2048²、帧矩形在范围内、逐像素回读一致 / manifest 中每个帧名都存在，hideRules 和 z 值正确。

## 已知限制
- 风格和配色是暂定版。披肩在正侧面只露出背后一条叶片边和领口几片叶子，主体被身体挡住，看起来更像“背后一串叶子”，不太像完整的斗篷。它有随动作的简单摆动（走路后飘、攻击后甩、受击前扑），但没有布料模拟。
- 别针在实际显示尺寸（逻辑约 11×13 px）下很小，只能看出一颗橡实；攻击 02/03 帧基本被挡住。
- 花环只验证了外观 A 的短发。以后的长发或别的发型，需要重新检查是否过眉。
- 只做了战士 + 外观 A 的 e 方向战斗视角；地图俯视角色没有装饰。其他五个职业共用这套帧的前提是它们用同一骨架，目前那五个职业还没有出图，所以还没验证。
- “不挡脸/不遮眼/对齐”都是脚本检查加人工目检，不能覆盖所有视觉问题。还没有在 Phaser 里实际跑过；JSON 是自写的 Phaser 3 JSON Hash（TexturePacker 兼容）格式，已经逐像素回读校验。

# LexiQuest 森林章节最终 Boss「林冠」（bossId: `canopy`）· v0.1-provisional

状态：**暂定**。风格和配色沿用《美术规范 v0.2》和战士 P0 v0.1 的约定，等 Bowen 看过 MVP 再定。qaStatus = `integrable`：脚本自检 8/8 通过，人工看过联系表和战斗 mock，**还没有在 Phaser 运行时实际加载过**。
设计：原创的古树守护灵。苔藓树皮身体，大片叶冠，青绿色发光眼睛，苔藓胡子，金色叶子和橡果点缀，珊瑚色小浆果，树根当脚。整体亲切但有压迫感，不吓人，也没有血腥内容。
来源：全部由原创脚本 `tools/make_linguan.py` 用代码矢量绘制，没有用 AI 生图，也没有参考任何第三方角色或教材图。授权为项目自有。

## 目录
| 路径 | 内容 |
|---|---|
| `frames/body/*.png` | 19 帧 PNG-32，768×768 @2x，straight alpha，透明像素已做颜色外扩；单层，阴影烘焙在帧内 |
| `atlas/boss_canopy_w_{idle,attack,hit,defeat}@2x.png/.json` | 每个动作一张图集（Phaser 3 JSON Hash，trimmed，带 pivot），都 ≤2048² |
| `manifest.json` | 帧尺寸、foot 轴点、朝向、推荐战斗位置和缩放、动画 key/fps/repeat/帧名、qaStatus、version |
| `qa_report.json` | 自检结果和指标（脚底线、idle 包围盒抖动、边缘色等） |
| `contact_sheet.png` | 逐动作联系表（逻辑尺寸，珊瑚色十字是 foot 轴点） |
| `preview/anim_*.gif` / `preview/anim_*.png` | 每个动作的 GIF 和帧条 |
| `preview/preview_linguan_battle_mock.png` | 按 PR #1 BattleScene 布局做的 1280×800 mock：左边战士 scale 0.72，右边林冠 scale 0.5 |
| `tools/` | make_linguan / pack_atlas / build_manifest / qa_check / contact_sheet / battle_mock（Python3 + Pillow + NumPy），以及 node_check.mjs（Node 校验 manifest 和图集） |

## 规格
- 帧：源图 768×768（逻辑 384×384，scaleFactor 2）。foot 轴点 (384,672)，归一化 (0.5, 0.875)，和战士一致。
- 朝向：**朝左（w）**，放在敌方一侧直接用，**不要 flip**。
- 动画：
  - idle 4f@6fps，循环：叶冠轻摆，呼吸。
  - attack 6f@12fps，一次：先后仰蓄力、举枝，再前扑挥下，地面冒出树根尖刺，叶片和金星四散，最后收势。
  - hit 3f@8fps，一次：第 00 帧受击泛白、向后仰，第 01 帧仰到最大并掉叶，第 02 帧回正。
  - defeat 6f@8fps，**不循环，停在最后一帧**：踉跄，叶冠变暗并下垂，树干下沉，闭眼。最后安静地睡着，头顶冒出一棵带金叶的小芽，地上落着几片叶子。
- 命名：帧 `boss_canopy_body_w_{anim}_{NN}`，图集帧名和文件名相同，只去掉 `.png`。texture key 建议用 `boss_canopy_{anim}`，见 manifest 的 `atlases[].textureKey`。

## 推荐战斗摆放（对照 PR #1 `src/game/scenes/BattleScene.ts`）
- 位置 (980, 520)，origin (0.5, 0.875)，scale **0.5**（逻辑 1x，@2x 精确缩半，最清晰）。
- 所有帧合起来在屏幕上占 x 813–1121、y 197–520，在 safe 区（x 107–1173）和战斗面板（90–1190 × 70–530）以内。显示约 308×323 px，战士约 260 px 高。
- 占位图是 `setOrigin(0.5, 1)` 加 `setFlipX(true)` 加 scale 1.15。换成本包时要改成 origin (0.5, 0.875)、去掉 flipX、scale 改为 0.5，并删掉“外形暂用页灵”提示（y=250）。
- 注意：叶冠顶在 y≈197。如果 `lastNote` 折成两行并且长到 x>810，可能碰到叶冠顶。真碰到的话，把 scale 调到 0.46（顶约 223），或者把提示文字的 wordWrap 宽度收窄到 640 左右。

## Phaser 3 加载提示（文字说明，不含游戏代码）
1. preload：对 manifest 的 4 个 `atlases` 各调用一次 `load.atlas(textureKey, image, json)`，只在 battle 场景加载。
2. 动画：对每个 `animations` 项调用 `anims.create`，参数为 key、frames（`frameNames` 映射成 `{ key: textureKey, frame }`）、`frameRate = fps`、`repeat`。四个动作分在四张纹理里，Phaser 的动画允许每帧来自不同纹理，所以直接这样建就行。
3. 显示：一个 Sprite，`setOrigin(0.5, 0.875)`，`setScale(0.5)`，不要 flip。图集是 trimmed 格式，Phaser 会按 `spriteSourceSize` 还原偏移，所以换动作时脚底不跳。
4. defeat 播完会停在最后一帧（repeat 0），不要接回 idle。hit 播完再接 idle。
5. 纹理是 straight alpha（非预乘），用 Phaser 默认设置即可。

## 已知限制
- 风格和配色都是暂定版。矢量绘制比较平：没有纹理，没有软阴影，叶冠是圆团拼起来的。
- 体型约为战士的 1.25 倍高、2 倍宽。在面板高度允许的范围内已尽量做大。想要更压迫，可以考虑以后把战斗面板做高一些。
- hit 的泛白是烘焙在第 00 帧里的，只提亮内部，描边不变。如果想要更强的闪白，可以在运行时叠加 `setTintFill` 闪一下。
- 攻击特效（树根尖刺、叶片、金星）烘焙在角色帧里，没有单独的 VFX 层。树根尖刺离锚点约 117px（逻辑），显示在 Boss 前方，不会飞到玩家那边。命中玩家的特效需要另做。
- 只有朝左一个方向。没有 walk 和 victory（Boss 不需要移动）。没有地图俯视版本。
- 还没在 Phaser 里实际跑过。JSON 是自写的 Phaser 3 JSON Hash（TexturePacker 兼容）格式，已经用 Python 做了逐像素回读校验，也用 Node 校验了 manifest 和图集。
- 和战士一样，只做了林冠这一个角色。披风、腰带和其他职业都没做。

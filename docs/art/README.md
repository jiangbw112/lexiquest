# LexiQuest P0 美术包：战士 + 外观 A（战斗视角，面右）· v0.1-provisional

状态：**暂定**。风格和配色先按《美术规范 v0.2》的默认值，等 Bowen 看过 MVP 再定。qaStatus = `integrable`（脚本自检 7/7 通过，并已人工目检；**尚未在 Phaser 运行时实际加载测试**）。
来源：全部精灵由原创脚本 `tools/make_warrior.py` 以矢量方式绘制，license 为项目自有。没有参考或模仿任何第三方角色、游戏或教材图。

## 目录
| 路径 | 内容 |
|---|---|
| `slots.md` / `slots.json` | 服装槽位表（暂定 v0.1）：外观/职业/章节分组、层序、锚点、遮挡、P0 启用 |
| `style_ref_v0.1.png` | 风格参考图，**仅 concept**：AI 生成，不是精灵，不进游戏 |
| `frames/<layer>/*.png` | 11 层 × 21 帧 = 231 张 PNG-32，512×512 @2x，straight alpha，透明像素已做颜色外扩 |
| `atlas/char_p0_<layer>_e@2x.png/.json` | 每层一张图集（Phaser 3 JSON Hash，trimmed，带 pivot），最大 2048×636 |
| `manifest.json` | 动画帧数/fps、帧尺寸、foot 锚点与逐帧骨点、层序、来源/授权、qaStatus、version |
| `contact_sheet.png` | 逐动画联系表（逻辑尺寸显示，珊瑚色十字为 foot 轴点） |
| `preview_warrior_all.gif` | 五个动画的合成预览 |
| `preview/anim_*.png`、`preview/layers_breakdown_idle_00.png`、`preview/composite/` | 动画条、分层拆解、逐帧合成图（仅预览，不进游戏） |
| `qa_report.json` | 自检结果 |
| `tools/` | 生成脚本：slots_def / make_warrior / pack_atlas / build_manifest / qa_check / contact_sheet（属于资产工具，不是游戏代码；只依赖 Python3 + Pillow + NumPy） |

## 规格
- 帧：源 512×512（逻辑 256×256，scaleFactor 2）；foot 轴点 (256,448) = 归一化 (0.5, 0.875)。
- 动画：idle 4f@6fps（循环）· walk 6f@10fps（循环，原地踏步，位移由游戏控制）· attack 5f@12fps · hit 2f@8fps · victory 4f@8fps。
- 层序（后→前）：shadow, hand_main, body_back, outfit_back, body, outfit_body, hair, outfit_head, body_front, outfit_front, hand_off。
- 命名：`char_{heroA|warrior}_{layerToken}_e_{anim}_{NN}.png`；图集帧名与文件名相同，只去掉 `.png`。

## Phaser 3 加载提示（文字说明，不含代码）
1. 每层用 `load.atlas` 加载一对 png+json，texture key 建议直接用层名。战斗场景开始时只加载 battle 包。
2. 每个角色用一个 Container，按 manifest 的 `layerOrder_backToFront` 依次放入 11 个 Sprite，坐标都设为 (0,0)。Container 的位置就是脚底点。
3. 图集是 trimmed 格式，sourceSize 为 512。Phaser 会自动还原裁切偏移。每个 Sprite 的 origin 设为 (0.5, 0.875)，即 manifest 的 pivot。
4. 素材是 2x，显示时 Container 缩放 0.5（或把相机或场景统一按 2x 处理）。
5. 每层每个动作各建一个动画（帧名前缀为该层的 `char_..._e`，后接 `_{anim}_{NN}`），帧数和 fps 读 manifest。播放时让所有层同时播放同一个动画 key，或者只驱动一层，在它的 update 事件里把同一 frame index 同步给其他层，确保逐帧对齐。
6. 换装：只替换对应职业层的 texture，或隐藏该层；外观层保持不变。敌方朝左时对 Container 设 flipX，或把 scaleX 设为负值。
7. 纹理是 straight alpha（非预乘），用 Phaser 默认设置即可。

## 已知限制
- 风格和配色是暂定版。矢量纸娃娃比参考图简单：没有纹理和软阴影，腿短，动作幅度偏小。walk 是原地小步，步幅小。
- Q 版手臂短，举不过大头，所以 victory 是把剑举在胸前，再配轻微上下弹动，不是高举过头。attack 第 01 帧剑大半被头盔挡住，属于过渡帧。
- P0 表情烘焙在 body 层里，还没有拆出 face 槽。只做了 e（面右）方向；地图俯视角色（128 逻辑）不在这一包。
- 没有攻击拖尾或命中特效（fx_attach 只预留了位置）。
- “无穿帮”是脚本检查（底装不外露、腿无裸露缝、眼睛不被盔或发遮、剑柄在手下、盾在手上、剑至少 25% 可见）加人工目检，不能覆盖所有视觉问题。
- 没有在 Phaser 里实际跑过加载，JSON 结构按 Phaser 3 JSON Hash（TexturePacker 兼容）规则自写，并用脚本做了逐像素回读校验。
- 风格参考图是 AI 生成的 concept，构图接近 3/4 侧面，和精灵的正侧视角不完全一致，只用来对齐氛围和配色。

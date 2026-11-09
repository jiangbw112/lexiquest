# 服装槽位表 · 暂定 v0.2（provisional）

本仓库里，森林章 v0.1 图集在 `public/assets/chapter/forest/v0.1/`。下面是槽位表 v0.2。

> v0.2 相对 v0.1 的改动：① 新增 `cosmetic_chest`（z=47，token `cosChest`，chest 锚点，章节组）；② 屏蔽规则写入表与 `slots.json → hideRules`：披肩隐藏职业 `back`，花环**整层隐藏** `outfit_head`（不再只隐藏羽饰）；③ 三个章节槽标注资产状态（森林奖励 v0.1 暂定已出图，见 `../forest_rewards/`）。原 `p0/` 文件夹与 zip 未改动。

依据：《英语学习2D RPG 美术规范 v0.2》。机器可读版：`slots.json`（与本目录 `tools/slots_def.py` 同源）。
范围：战斗视角（正侧/约 2/3 侧面）、面右 `e`；帧 512×512 @2x（逻辑 256×256），脚底轴点 foot = (256, 448) px，归一化 (0.5, 0.875)。

## 1. 三组分离
| 组 | 含义 | 槽 |
|---|---|---|
| appearance 外观 | 与职业无关，可单独替换 | 身体（body_back / body / body_front，含头、脸、耳）、肤色（调色参数）、发型（hair / hair_back）、脸（face，P1） |
| class 职业装 | 与外观无关；缺件回退职业底装 | 头 outfit_head、身 outfit_body、手 outfit_front+outfit_back（护腕）、腰 waist、脚（靴，P0 在 outfit_body/outfit_back）、背 back、主手持 hand_main、副手持 hand_off |
| chapter 章节装饰 | 纯外观、不暗示战力 | cosmetic_back、cosmetic_chest（v0.2 新增）、cosmetic_head |
| system | 阴影、特效挂点 | shadow、fx_attach |

## 2. 层序（从后到前）、锚点、遮挡、P0 启用
| z | 槽 id | 组 | 文件 token | 对应规范层 | 锚点 | 遮挡头发 | P0 | P0 内容 / 说明 |
|---|---|---|---|---|---|---|---|---|
| 0 | shadow | system | shadow | shadow | foot | 否 | ✅ | 地面椭圆阴影，#264653 半透明 |
| 5 | back | class | back | back 挂点 | back | 否 | 预留 | 披风/背包/箭袋（P1 探险家背包首用） |
| 6 | cosmetic_back | chapter | cosBack | back 挂点 | back | 否 | 森林 v0.1 暂定 | 林叶披肩 `forest_leaf_cape`；**装备时隐藏 back(5)** |
| 10 | hand_main | class | handMain | hand_item | hand_R（远侧手） | 否 | ✅ | 圆头训练短剑；**持于远侧手，故排在远侧手臂之后**（见第 4 节冲突说明） |
| 20 | body_back | appearance | bodyBack | arms_back + legs | hip / chest | 否 | ✅ | 远侧手臂、远侧腿（肤色） |
| 25 | outfit_back | class | outfitBack | outfit_main（远侧部分） | chest / hip | 否 | ✅ | 远侧袖、护腕、裤腿、靴 |
| 30 | body | appearance | body | body + legs + torso + head | foot / chest / head | 否 | ✅ | 浅色内衬+短裤（儿童友好底装）、近侧腿、颈、头、耳；P0 表情烘焙于此 |
| 35 | hair_back | appearance | hairBack | hair_back | head | — | 预留 | 长发后片（外观 A 短发不用） |
| 40 | outfit_body | class | outfitBody | outfit_under + outfit_main | chest / hip | 否 | ✅ | 珊瑚短上衣+金边、青绿腰带、近侧裤腿与靴（身/腰/脚合并） |
| 45 | waist | class | waist | outfit_main | hip | 否 | 预留 | 独立腰带/腰包（P0 烘焙在 outfit_body） |
| 47 | cosmetic_chest | chapter | cosChest | (chest 挂点) | chest | 否 | 森林 v0.1 暂定 | **v0.2 新增**。橡实别针 `acorn_pin`；部分帧被近侧手臂/盾遮挡可接受 |
| 50 | hair | appearance | hair | hair_front | head | — | ✅ | 外观 A 短棕发含刘海 |
| 55 | face | appearance | face | face_acc | head | 否 | 预留 | P1 三表情拆层 / 眼镜等 |
| 60 | outfit_head | class | outfitHead | outfit_main（头） | head | **是（顶部）** | ✅ | 金色半盔+珊瑚羽饰；不遮眼（脚本检查） |
| 65 | cosmetic_head | chapter | cosHead | face_acc | head | 是 | 森林 v0.1 暂定 | 森语花环 `forest_wreath`；**装备时整层隐藏 outfit_head(60)**；不过眉不遮眼（脚本检查） |
| 70 | body_front | appearance | bodyFront | arms_front | chest / hand_L | 否 | ✅ | 近侧手臂（肤色） |
| 75 | outfit_front | class | outfitFront | arms_front 服装 | chest / hand_L | 否 | ✅ | 近侧袖+青绿护腕 |
| 80 | hand_off | class | handOff | hand_item | hand_L（近侧手） | 否 | ✅ | 圆盾（珊瑚+金边+青绿星） |
| 90 | fx_attach | system | fx | fx_attach | hand_R / chest | 否 | 预留 | 技能特效（单独图集） |

P0 战士包实际启用 11 层（不变）：shadow, hand_main, body_back, outfit_back, body, outfit_body, hair, outfit_head, body_front, outfit_front, hand_off。

## 3. 锚点
- foot：帧内固定 (256, 448)，所有层、所有帧相同。
- hip / chest / head / hand_R（远侧，持剑）/ hand_L（近侧，持盾）/ back：随帧变化，逐帧数值在 `manifest.json → anchorsPerFrame`（512 帧坐标）。
- 新职业装必须按这些骨点绘制，并复用同一帧网格与帧数。

## 4. 与规范 v0.2 的差异（以规范为准，此处为实现细化，待确认）
1. 规范层序把 hand_item 放在接近最前；侧面面右时远侧手持剑，剑须在远侧手臂之后，故 hand_main 放在 z=10。近侧的盾 hand_off 仍在最前，与规范一致。
2. 规范的 arms_back / arms_front 拆成 body_back / body_front（外观）+ outfit_back / outfit_front（职业），以满足“外观与职业分离”。
3. 文件名 slot 段使用 camelCase（如 outfitBody），保证 `{domain}_{subject}_{slot}_{dir}_{anim}_{frame}` 按 `_` 切分恰好 6 段；规范示例 `outfit_warrior` 中含下划线，会让解析产生歧义。subject：外观层=heroA，职业层=warrior。

## 5. 章节装饰规则与屏蔽规则（v0.2，须进配置）
- 章节装饰只占 cosmetic_* 槽，不替换职业槽；PvP 中纯外观，不影响战斗数值。
- 屏蔽规则（`slots.json → hideRules`）：

| 装备了 | 隐藏 | 说明 |
|---|---|---|
| cosmetic_back | back（整层） | 披肩与背包/箭袋等同装时显示披肩 |
| cosmetic_head | outfit_head（整层） | 花环与职业头饰同装时显示花环；战士=整顶头盔连羽饰一起隐藏，露出发型。**不做无羽饰头盔帧** |

- cosmetic_chest 无屏蔽规则；它画在 outfit_body 之上、hair/手臂/盾之下，被手臂或盾挡住属正常。
- 六职共用同一儿童体型骨架，章节装饰一套帧通用；MVP 只 1 色（c01），多色以后预导出，不用运行时 tint。

## 6. 资产状态（截至 v0.2）
| 槽 | 资产 | 状态 |
|---|---|---|
| cosmetic_back | 林叶披肩 forest_leaf_cape | 正式暂定 v0.1 + 单色占位，`../forest_rewards/` |
| cosmetic_chest | 橡实别针 acorn_pin | 同上 |
| cosmetic_head | 森语花环 forest_wreath | 同上 |
| UI | 叶子章 ui_title_leafIcon + 称号条 ui_title_chip | 同上（UI 图集，不占换装槽） |

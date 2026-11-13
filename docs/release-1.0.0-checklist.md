# 1.0.0 发布前检查

核对的提交是 `origin/main` `22931e6a28aaddca73f2d4e598d96074269f16db`。这一份只记录当时仓库里能对上的文件。没有发布，没有打 tag。

## 规格在哪里

规格原文在仓库外，已按哈希核对。仓库里没有 `CLASS_SPEC` 或 `class_spec` 文件，规格文件也不放进仓库。对照用的两份附件：

- `CLASS_SPEC_v1.0.3.md` sha256 `d6109331faa80b4600cf8968075b9287eddb90dc7526866e7e98700fa889b464`
- `class_spec_v1.0.3.json` sha256 `512c4bb2fcccf0787b945950ff4ed8d0deaa3739459b45535654950f56c9ffd2`

两份都和指定哈希一致。下面的符合、不符合按这两份原文逐项对过。界面上的治疗职业叫「治愈师」，不是「治疗」。

31 个年级章没有单独的文件名。表在 `src/domain/chapters/chapters_v0.2.json`。这个文件一共 32 条。第 1 条是 `forest_adventure`（森林冒险，grade 为空）。后面 31 条是年级章：三年级 8、四年级 8、五年级 9、六年级 6。本清单的「31 章」指这 31 条。

## 六职业

立绘、行走、技能特效、技能卡、升级结算都已经接到画面上。发明家用编译期常量锁住，数据和画面仍然在。

| 职业 | 立绘 | 行走 | 技能特效 | 技能卡 | 升级结算 |
| --- | --- | --- | --- | --- | --- |
| 战士 | `public/assets/classes/v1.0/portrait/cls_portraits@2x.json` 的 `portrait_warrior_side` | 俯视 `cls_warrior_top@2x` 的 walk；侧视 `cls_warrior_side@2x` 的 walk。村子用 `OverworldScene` 的 `ClassTopSprite.play("walk")` | 近战冲到敌人面前。`src/game/art/class-atlas.ts` 的 `DASH_RULES.warrior` 是 `dashToEnemy`，不发弹 | `atlas_skills` 有 `skill_warrior_bash`、`skill_warrior_shout`、`skill_warrior_hold`、`skill_warrior_spin`。定义在 `src/domain/skills.ts` | 和另外五职共用 `src/game/scenes/BattleResultsScene.ts` 的 `starMark`，写出「★N 到 ★N」 |
| 法师 | 同图集 `portrait_mage_side` | `cls_mage_top@2x`、`cls_mage_side@2x` 的 walk | 火球弹道。`atlas_fx_projectiles.json` 有 `fx_proj_mage_fly_00`–`03` 和 `fx_proj_mage_hit_00`–`02`。`src/game/art/projectile-art.ts` | `skill_mage_spark`、`skill_mage_ward`、`skill_mage_glow`、`skill_mage_star` | 同上 |
| 游侠 | 同图集 `portrait_ranger_side` | `cls_ranger_top@2x`、`cls_ranger_side@2x` 的 walk | 箭。`fx_proj_ranger_fly_00`–`01`、`fx_proj_ranger_hit_00`–`02` | `skill_ranger_aim`、`skill_ranger_step`、`skill_ranger_herb`、`skill_ranger_volley` | 同上 |
| 治愈师 | 同图集 `portrait_healer_side` | `cls_healer_top@2x`、`cls_healer_side@2x` 的 walk | 光点。`fx_proj_healer_fly_00`–`02`、`fx_proj_healer_hit_00`–`02` | `skill_healer_beam`、`skill_healer_cure`、`skill_healer_guard`、`skill_healer_light`。旧档里的 `healer-cheer` 在 `src/domain/progress.ts` 换成 `healer-beam` | 同上 |
| 发明家 | 同图集 `portrait_inventor_side`。锁定卡是 `cls_portraits_locked@2x.json` 的 `portrait_inventor_locked` | `cls_inventor_top@2x`、`cls_inventor_side@2x` 的 walk | 齿轮。`fx_proj_inventor_fly_00`–`03`、`fx_proj_inventor_hit_00`–`02` | `skill_inventor_gear`、`skill_inventor_pad`、`skill_inventor_fix`、`skill_inventor_over` | 同上。玩家在 1.0.0 选不到这个职业，所以正常对局里不会走到这张结算 |
| 探险家 | 同图集 `portrait_explorer_side` | `cls_explorer_top@2x`、`cls_explorer_side@2x` 的 walk | 近战冲到敌人面前。`DASH_RULES.explorer` 是 `dashToEnemy`，没有弹道帧 | `skill_explorer_staff`、`skill_explorer_bandage`、`skill_explorer_map`、`skill_explorer_find` | 同上 |

发明家的锁：

- `src/domain/class-unlock.ts` 里 `INVENTOR_UNLOCK_ENABLED = false as const`。`isClassSelectable` 在这个常量为 false 时直接返回 false，不读存档。
- 创建页 `src/game/scenes/CreateScene.ts` 和技能页 `src/game/scenes/SkillsScene.ts` 都画锁定立绘，点击后用 `INVENTOR_LOCK_TIP` 整句，按钮是「好的」。
- 数值仍在 `src/domain/classes.ts`、`src/domain/skills.ts`、`src/domain/provisional.ts`。

## 31 个年级章

背景由 `src/domain/chapter-scenes.ts` 的 `chapterBackdrop` 选择。小怪由同文件的 `chapterMinion` 选择。Boss 图由 `src/domain/chapter-bosses.ts` 的 `chapterBossAsset` 选择，名字和关卡来自 `chapters_v0.2.json`，开战时 `src/domain/chapter-plan.ts` 的 `stageCombatFor` 把它们接进战斗。

下表的背景和小怪路径都在 `public/assets/chapter/scenes/` 下面。Boss 图在 `public/assets/chapter/` 下面。每一章的四套 Boss 姿势（idle、attack、hit、defeat 的 png 和 json）都在磁盘上。血量不是每章一张表：所有年级章 Boss 都用 `src/domain/provisional.ts` 的 `bossPhaseHpByClass`，按玩家职业取每阶段血量。年级章 Boss 的两句阶段提示用本章显示名，在 `src/domain/chapter-plan.ts` 的 `stageCombatFor` 里把「林心守护者」换成 `chapter.bossName`。森林章提前返回，文案仍是 `provisional.ts` 里的「林心守护者挡住了去路。」和「林心守护者进入第二阶段。」

| 序 | 章名 | id | 场景背景 | 小怪 | Boss 美术 | Boss 数据 |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 朋友与家人 | `pep_g3_01` | `home/bg_map.webp`、`home/bg_battle.webp` | 抱枕灵 `cushion`，`minions/atlas_monsters_scenes.json` 的 `monster_cushion_idle` / `monster_cushion_hit` | `family_album`：`bosses/family_album/boss_family_album_w_idle@2x.png` 及 attack、hit、defeat | 名「全家福守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 3 | 动物好朋友 | `pep_g3_02` | `animals/bg_map.webp`、`animals/bg_battle.webp` | 爪爪灵 `pawlet`，`minions/atlas_monsters_scenes.json` 的 `monster_pawlet_idle` / `monster_pawlet_hit` | `tigerkin`：`bosses/tigerkin/boss_tigerkin_w_idle@2x.png` 及 attack、hit、defeat | 名「温柔小虎灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 4 | 花园调色盘 | `pep_g3_03` | `farm/bg_map.webp`、`farm/bg_battle.webp` | 芽芽灵 `sprout`，`minions/atlas_monsters_scenes.json` 的 `monster_sprout_idle` / `monster_sprout_hit` | `duckbrush`：`bosses/duckbrush/boss_duckbrush_w_idle@2x.png` 及 attack、hit、defeat | 名「绿鸭画笔灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 5 | 彩虹数数 | `pep_g3_04` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `envelope`：`bosses/envelope/boss_envelope_w_idle@2x.png` 及 attack、hit、defeat | 名「远方来信灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 6 | 认识新朋友 | `pep_g3_05` | `school/bg_map.webp`、`school/bg_battle.webp` | 橡皮灵 `rubkin`，`minions/atlas_monsters_scenes.json` 的 `monster_rubkin_idle` / `monster_rubkin_hit` | `giftbox`：`bosses/giftbox/boss_giftbox_w_idle@2x.png` 及 attack、hit、defeat | 名「礼物盒守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 7 | 爱学习的我 | `pep_g3_06` | `school/bg_map.webp`、`school/bg_battle.webp` | 橡皮灵 `rubkin`，`minions/atlas_monsters_scenes.json` 的 `monster_rubkin_idle` / `monster_rubkin_hit` | `penciler`：`bosses/penciler/boss_penciler_w_idle@2x.png` 及 attack、hit、defeat | 名「铅笔尺子灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 8 | 好吃又健康 | `pep_g3_07` | `food/bg_map.webp`、`food/bg_battle.webp` | 热气灵 `steam`，`minions/atlas_monsters_scenes.json` 的 `monster_steam_idle` / `monster_steam_hit` | `mealmap`：`bosses/mealmap/boss_mealmap_w_idle@2x.png` 及 attack、hit、defeat | 名「营养餐盘守护者」（不是玩具箱守护者）。`CHAPTER_BOSS_ID.pep_g3_07` 与 `PEP_G3_07_BOSS` 都是 `mealmap`。toychest 只在 `BOSS_RESERVE`，不绑定章节 |
| 9 | 玩具与数字 | `pep_g3_08` | `home/bg_map.webp`、`home/bg_battle.webp` | 抱枕灵 `cushion`，`minions/atlas_monsters_scenes.json` 的 `monster_cushion_idle` / `monster_cushion_hit` | `piggybank`：`bosses/piggybank/boss_piggybank_w_idle@2x.png` 及 attack、hit、defeat | 名「存钱罐守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 10 | 家里好帮手 | `pep_g4_01` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `wreath`：`bosses/wreath/boss_wreath_w_idle@2x.png` 及 attack、hit、defeat | 名「善良友谊灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 11 | 我们的社区 | `pep_g4_02` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `lookout`：`bosses/lookout/boss_lookout_w_idle@2x.png` 及 attack、hit、defeat | 名「社区守望者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 12 | 天气变变变 | `pep_g4_03` | `weather/bg_map.webp`、`weather/bg_battle.webp` | 风叶灵 `leafkin`，`minions/atlas_monsters_scenes_2.json` 的 `monster_leafkin_idle` / `monster_leafkin_hit` | `windsock`：`bosses/windsock/boss_windsock_w_idle@2x.png` 及 attack、hit、defeat | 名「明天风向灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 13 | 四季换衣 | `pep_g4_04` | `weather/bg_map.webp`、`weather/bg_battle.webp` | 风叶灵 `leafkin`，`minions/atlas_monsters_scenes_2.json` 的 `monster_leafkin_idle` / `monster_leafkin_hit` | `desk`：`bosses/desk/boss_desk_w_idle@2x.png` 及 attack、hit、defeat | 名「小课桌守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 14 | 家规小约定 | `pep_g4_05` | `home/bg_map.webp`、`home/bg_battle.webp` | 抱枕灵 `cushion`，`minions/atlas_monsters_scenes.json` 的 `monster_cushion_idle` / `monster_cushion_hit` | `sleeplamp`：`bosses/sleeplamp/boss_sleeplamp_w_idle@2x.png` 及 attack、hit、defeat | 名「安睡小夜灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 15 | 一天的时间 | `pep_g4_06` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `pricetag`：`bosses/pricetag/boss_pricetag_w_idle@2x.png` 及 attack、hit、defeat | 名「价签守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 16 | 逛店去农场 | `pep_g4_07` | `farm/bg_map.webp`、`farm/bg_battle.webp` | 芽芽灵 `sprout`，`minions/atlas_monsters_scenes.json` 的 `monster_sprout_idle` / `monster_sprout_hit` | `bowlkin`：`bosses/bowlkin/boss_bowlkin_w_idle@2x.png` 及 attack、hit、defeat | 名「小羊碗筷灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 17 | 农场餐桌 | `pep_g4_08` | `farm/bg_map.webp`、`farm/bg_battle.webp` | 芽芽灵 `sprout`，`minions/atlas_monsters_scenes.json` 的 `monster_sprout_idle` / `monster_sprout_hit` | `emptybowl`：`bosses/emptybowl/boss_emptybowl_w_idle@2x.png` 及 attack、hit、defeat | 名「不浪费小灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 18 | 不一样的朋友 | `pep_g5_01` | `school/bg_map.webp`、`school/bg_battle.webp` | 橡皮灵 `rubkin`，`minions/atlas_monsters_scenes.json` 的 `monster_rubkin_idle` / `monster_rubkin_hit` | `smilesign`：`bosses/smilesign/boss_smilesign_w_idle@2x.png` 及 attack、hit、defeat | 名「笑脸心情灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 19 | 忙碌一周 | `pep_g5_02` | `school/bg_map.webp`、`school/bg_battle.webp` | 橡皮灵 `rubkin`，`minions/atlas_monsters_scenes.json` 的 `monster_rubkin_idle` / `monster_rubkin_hit` | `weekcal`：`bosses/weekcal/boss_weekcal_w_idle@2x.png` 及 attack、hit、defeat | 名「一周日历灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 20 | 健康好习惯 | `pep_g5_03` | `food/bg_map.webp`、`food/bg_battle.webp` | 热气灵 `steam`，`minions/atlas_monsters_scenes.json` 的 `monster_steam_idle` / `monster_steam_hit` | `lotusk`：`bosses/lotusk/boss_lotusk_w_idle@2x.png` 及 attack、hit、defeat | 名「荷花湖守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 21 | 走进大自然 | `pep_g5_04` | `weather/bg_map.webp`、`weather/bg_battle.webp` | 风叶灵 `leafkin`，`minions/atlas_monsters_scenes_2.json` 的 `monster_leafkin_idle` / `monster_leafkin_hit` | `waterfall`：`bosses/waterfall/boss_waterfall_w_idle@2x.png` 及 attack、hit、defeat | 名「风雨瀑布灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 22 | 守规则的城 | `pep_g5_05` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `turnsign`：`bosses/turnsign/boss_turnsign_w_idle@2x.png` 及 attack、hit、defeat | 名「左转路标灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 23 | 街区与节日 | `pep_g5_06` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `dragonboat`：`bosses/dragonboat/boss_dragonboat_w_idle@2x.png` 及 attack、hit、defeat | 名「假期龙舟灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 24 | 四季与远方 | `pep_g5_07` | `weather/bg_map.webp`、`weather/bg_battle.webp` | 风叶灵 `leafkin`，`minions/atlas_monsters_scenes_2.json` 的 `monster_leafkin_idle` / `monster_leafkin_hit` | `camelbell`：`bosses/camelbell/boss_camelbell_w_idle@2x.png` 及 attack、hit、defeat | 名「沙丘驼铃灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 25 | 家乡与旅行 | `pep_g5_08` | `journey/bg_map_day.webp`、`journey/bg_battle_day.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `bootprint`：`bosses/bootprint/boss_bootprint_w_idle@2x.png` 及 attack、hit、defeat | 名「远足脚印灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 26 | 旅行计划 | `pep_g5_09` | `journey/bg_map_day.webp`、`journey/bg_battle_day.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `travelmap`：`bosses/travelmap/boss_travelmap_w_idle@2x.png` 及 attack、hit、defeat | 名「旅行地图灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 27 | 神奇的地方 | `pep_g6_01` | `journey/bg_map_night.webp`、`journey/bg_battle_night.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `starlight`：`bosses/starlight/boss_starlight_w_idle@2x.png` 及 attack、hit、defeat | 名「倒数星光灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 28 | 赛跑与健康 | `pep_g6_02` | `food/bg_map.webp`、`food/bg_battle.webp` | 热气灵 `steam`，`minions/atlas_monsters_scenes.json` 的 `monster_steam_idle` / `monster_steam_hit` | `sleepmoon`：`bosses/sleepmoon/boss_sleepmoon_w_idle@2x.png` 及 attack、hit、defeat | 名「早睡小月灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 29 | 攒钱去太空 | `pep_g6_03` | `journey/bg_map_day.webp`、`journey/bg_battle_day.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `marble`：`bosses/marble/boss_marble_w_idle@2x.png` 及 attack、hit、defeat | 名「火星弹珠灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 30 | 星空与能源 | `pep_g6_04` | `journey/bg_map_day.webp`、`journey/bg_battle_day.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `warmsun`：`bosses/warmsun/boss_warmsun_w_idle@2x.png` 及 attack、hit、defeat | 名「暖暖能量灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 31 | 比一比 | `pep_g6_05` | `journey/bg_map_day.webp`、`journey/bg_battle_day.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `heightrod`：`bosses/heightrod/boss_heightrod_w_idle@2x.png` 及 attack、hit、defeat | 名「量身高小灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 32 | 上周去哪儿 | `pep_g6_06` | `journey/bg_map_day.webp`、`journey/bg_battle_day.webp` | 行囊灵 `knapsack`，`minions/atlas_monsters_scenes_2.json` 的 `monster_knapsack_idle` / `monster_knapsack_hit` | `oldalbum`：`bosses/oldalbum/boss_oldalbum_w_idle@2x.png` 及 attack、hit、defeat | 名「旧相册守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |

森林冒险不在这 31 章里。它仍用 `public/assets/warm/backgrounds/bg_map_forest_2x.webp`、`bg_forest_battle_2x.webp`，小怪 `monster_inkling_idle`，Boss 是 `public/assets/boss/canopy/v0.1` 的林冠。

## 下一版

期中 Boss、期末 Boss、小学毕业 Boss，以及这些考试对应的头衔，这一版不算缺口。

- `src/domain/provisional.ts` 的 `examBossPhaseHp` 写了期中、期末的每阶段血量。战斗代码不读这张表，只有 `src/domain/class-combat.test.ts` 对过数字。
- 期末场次 id（`exam_g3_s1_final` 到 `exam_g6_s2_final`）出现在 `src/domain/class-unlock.test.ts` 和存档测试里。没有考试场景、没有考试 Boss 图、没有毕业 Boss `grad_primary`。
- 已有的称号是森林章的，在 `src/domain/chapters/forest-rewards.json`。那不是期中、期末或毕业头衔。

## 这一支改动的图集

核对时，`skill_healer_cheer` 还在技能图集里，游戏代码已经不画它。`src/` 里剩下的 `healer-cheer` 只用于旧档迁移，不是帧名。这一支删掉了这一帧。像素尺寸仍是 1024×512。

| 文件 | 之前 | 之后 |
| --- | --- | --- |
| `public/assets/warm/atlas/atlas_skills.png` | 206011 字节，`3ca812e445b0eaface42c5907c7339a446a82244c395c7035a5e924ef53118f9` | 236868 字节，`f809d6cc811ceaea4a328f56d3d8498934156051399d1b4ac30eeeb5c86eb76b` |
| `public/assets/warm/atlas/atlas_skills.json` | 7444 字节，`a9eb50ae15ae3ea508ed524dde750aae166594ada24ebdf094548278c9367ff6` | 7170 字节，`f51db1b842c273601b0c4a27b2ce86ca15db348190a762c855b717e71455c647` |
| `src/game/warm/slices.json` | 47922 字节，`a609238e2646cdd80c38117d60d79e3ae7ce0f4ac5646f92b3f957b850cfc42e` | 47627 字节，`75e74d181c5d7efda13c56495e9eb284866711a004587508259ef320a67c0d15` |

没有别的资产清单把这三份哈希写死，所以没有改 manifest。

这一支再次核对时，`rg` 在 `public/assets/warm/atlas/atlas_skills.json` 和 `src/game/warm/slices.json` 里没有 `skill_healer_cheer`，也没有技能帧名「鼓舞」。`atlas_skills.json` 现有 25 个帧，其中有 `skill_healer_beam`。旧鼓舞帧矩形（x=492，y=100，96×96）的 RGBA 极值都是 0，alpha 最大为 0。三份哈希与上表「之后」相同，这次没有再改文件。词表里的「令人鼓舞的」是单词释义，不是技能帧。

## 六职业对规格

职业显示名、短句、天赋、数值和 `classes.ts` 的 `ClassDef` 与 JSON `classes.ts.ClassDef` 一致。24 张技能卡的 id、中文名、说明、cost、kind、power、order、healPower 与 JSON `skills.ts.SKILLS` 逐字段一致。★1/★2/★3 和答错伤害用代码公式 `Math.round(power * skillPower * (1 + 0.3 * (level - 1)))`、答错 `Math.round(★1 × 0.5)` 对过 JSON `derived.skills`，24 张都对上。显示消耗是 `Math.max(1, cost + skillCostDelta)`，发明家因此少 1。证据：`src/domain/classes.ts`、`src/domain/skills.ts`、`src/domain/class-combat.test.ts`。

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 六职各 4 张卡，没有 `healer-cheer` | 符合 | `skills.ts` 的 `SKILLS`；治愈师顺序是光愈、治愈、守护、光击 |
| 战士 盾击/战吼/坚守/旋风斩，power 10/14/12/18，cost 2/2/1/3 | 符合 | `skills.ts`；★ 11/14/17、15/19/24、13/16/20、19/25/30 |
| 法师 火花/星盾/微光/星落，火花 power 10 | 符合 | `skills.ts`；火花 ★ 14/18/22 |
| 游侠 瞄准/疾走/草药/连射 | 符合 | `skills.ts` |
| 治愈师 光愈 power 7、healPower 10、cost 2 | 符合 | `skills.ts`；★ 伤害 7/9/11，治疗 10/13/16，答错伤害 4、治疗 5。`class-combat.test.ts` |
| 发明家 齿轮弹 kind `delay-damage`、power 9、卡面 cost 2、显示消耗 1 | 符合 | `classes.ts` 的 `skillCostDelta: -1`；分半 ★1 5+5、★2 7+6、★3 8+8、答错 3+2。`battle.ts` 的 `splitDelayDamage` 与 `class-combat.test.ts` |
| 探险家 探路杖/绷带/地图光/发现一击；`xpBonus` 为 1 | 符合 | `classes.ts`、`skills.ts`。胜利经验 `Math.round(20 * xpBonus)` 在 `progress.ts`，六职都是 20 |
| 生命、攻防治疗、能量、技能倍率 | 符合 | 战士 42/8/8/6、能量 2、倍率 1.05；法师 46/7/8/4、1.35；游侠 46/7/8/5、能量 3、1.1；治愈师 40/6/10/5、1；发明家 46/7/8/5、倍率 1.1、消耗 −1；探险家 46/7/8/5、1.05。都在 `classes.ts` |
| Boss 每阶段血量 | 符合 | `provisional.ts` 的 `bossPhaseHpByClass`：75/90/85/48/70/75。期中、期末是 `examBossPhaseHp`，战斗不读 |
| 探索敌人血量 | 符合 | `provisional.ts`：40/42/44/46；治愈师 26/28/28/30 |
| 解锁：起始卡、≥3 张词卡、胜场 ≥1、≥4 张词卡且胜场 ≥1 | 符合 | `progress.ts` 的 `refreshUnlocks` |
| 升级写出 ★N 到 ★N | 符合 | `BattleResultsScene.ts` 的 `starMark` |
| 游侠换牌、探险家下一题题型 | 符合 | `class-copy.ts` 与 `BattleScene.ts`。文案与规格 `additions.copy` 相同 |
| 发明家硬锁与锁定文案 | 符合 | `class-unlock.ts`：`INVENTOR_UNLOCK_ENABLED = false as const`。标题「藏起来的职业」，小字「打败期末大 Boss 后解锁」，提示整句与按钮「好的」。创建页和换职业页都用 `INVENTOR_LOCK_TIP`，不用期末版的 `INVENTOR_SWITCH_LOCKED_TIP`。不读 URL、存档来解锁。`class-unlock.test.ts` |
| 默认战士；五职可选；不出现「即将开放」 | 符合 | `CreateScene.ts` 的 `classId = "warrior"`。`rg` 没有「即将开放」「给战士起名字」 |
| 锁定图集哈希 | 符合 | `public/assets/classes/v1.0/portrait/cls_portraits_locked@2x.png` 为 `652d28919d792b67361cc2b07a34fb54ee3605eecdf03b1a854d1779fcc4a7ea`；json 为 `043e977c6c0331a616c7dd0772da0f13c8aab48e919075838d6be0f0e9eaf522`。帧名 `portrait_inventor_locked` 在 `class-atlas.ts`。创建页和换职业页用这个帧，不叠 `icon_lock` |
| 技能图标帧 | 符合 | `atlas_skills.json` 有六职 24 张卡的 `skill_*` 帧，含 `skill_healer_beam`。规格附的源 PNG 哈希是仓库外文件，仓库里用的是打进图集的帧 |
| `dashRules` 含发明家 | 符合 | `public/assets/classes/v1.0/manifest.json` 的 changelog 写了补 inventor |

创建页还有 4 条和规格不一致。它们不阻塞 1.0.0，本版不改代码，记在「1.0.1 待修」。`RELEASE_NOTES.md` 不写这些。

## 验收口径

`rg 'CH-07|D-ART-6|K42'` 在仓库源码和文档里找不到验收清单 v2.10（技术报告里的 sha256 以 `7aeb4f06` 开头）。`package-lock.json` 里只有无关的哈希片段。那份清单不在仓库，所以没有它的修改前、修改后哈希，也没有按它的行号改文件。同样的口径写在下面。L44–47 的 v2.8 变更记录不在本仓库，无从改，也按要求不动。

v2.11：31/31 年级章 Boss 已采用（mealmap，D-ART-6 按口径关闭）；年级章只验胜利横幅和「继续」；结局句只验森林；K44 仅单测证据。

- CH-07：v2.11：31/31 已采用。pep_g3_07 用 mealmap 营养餐盘守护者（bosses_v1.0.3_g3_07，经 integration_v1.0.4 入库，4 图集 19 帧，id 与另外 30 个都不同）。toychest 只是备用：不绑定章节，不入包（ledger reserve.toychest.boundChapter=null, shipped=false）。#17 780d58b 已实拍。
- CH-08：pep_g3_07 的 boss_name_zh 已是『营养餐盘守护者』（chapters_v0.2.json；PEP_G3_07_BOSS.nameZh 相同）。地图节点名也是『营养餐盘守护者』，其他章是『××守护』，属数据原样，不是缺陷。年级章只验『打败了××！』横幅与『继续』按钮；结局句只验森林结局页『词灵验收 打败了林心守护者。这一章走完了。』，不新增年级章结局句。
- §2.2 第 8 行：Boss 列「mealmap 营养餐盘守护者 · bosses_v1.0.3_g3_07（integration_v1.0.4）」；状态「已采用」；备注「#17 780d58b 已实拍；toychest 转为备用，不绑定」。
- 原 L483 位置要补的句子：v2.11：31/31 已采用（mealmap，D-ART-6 已关闭）。
- K42：已关闭：integration_v1.0.4 / #17 绑定 mealmap；toychest 备用。
- D-ART-6：已到并入库（v1.0.3 素材，经 v1.0.4 集成），关闭。
- 基线表（报告里的 L768–769、L778，对应 f7b4616）：原文若在那份清单里应保留，并加注「已过时，见 v2.11 CH-07/CH-08」。本仓库没有那张表。
- PR 表 #17：780d58b 已验收、已合并。
- K44：无合法触发路径（包内 18 张背景齐全），仅单测证据：chapter-scene-load.test.ts 3/3。

本仓库里能对上的代码：`src/domain/chapters/chapters_v0.2.json` 的 `pep_g3_07` `boss_name_zh` 和第 5 关都是「营养餐盘守护者」；`src/domain/chapter-bosses.ts` 的 `PEP_G3_07_BOSS` id 是 `mealmap`，`BOSS_RESERVE` 只有 toychest。胜利横幅是 `src/domain/battle-results.ts` 的 `bossVictoryBanner`，即 `打败了${bossName}！`。森林结局句在 `src/game/scenes/EndingScene.ts`，模板是 `${玩家名} 打败了${ending.bossName}。这一章走完了。` 年级章没有这条结局句。

## 1.0.1 待修

创建页这 4 条不阻塞 1.0.0。本版不改代码，`RELEASE_NOTES.md` 也不写。

1. 优先级最高：可选卡要画出天赋和起始卡名，描边用各职主色。现在 `src/game/scenes/CreateScene.ts` 约 L163–188 只画序号、职业名和 blurb。选中描边固定 `0xc4533a`（战士的 color）。
2. 顺手修：锁定卡描边换成中性灰。`CreateScene.ts` L157 和 `src/game/scenes/SkillsScene.ts` L153 的未选中描边仍是 `0x3b2a20`。底色用了 `0xc8bfb0`。
3. 顺手修：去掉创建页锁定卡上多画的「?」。问号已经在锁定图里。`CreateScene.ts` L170–175。换职业页没有这层字。
4. 顺手修：`src/game/p0.ts` 仍导出 `P0_CLASS_ID = "warrior"`。创建页不引用它。

## 正式发布步骤

只写步骤，这一支不执行、不删、不改任何 Release，也不触发 workflow。

2026-11-13 只读看到的旧草稿：id `442757802`，name `[草稿] LexiQuest v1.0.0`，`tag_name` `desktop-dryrun-5-65d0eb2`，`draft` true。`refs/tags/desktop-dryrun-5-65d0eb2` 是 404，tag 还没创建。`65d0eb2cb20d58727abe3aa5cc709ffe50623f56` 是 Merge pull request #12。没有名为 `v1.0.0` 的 tag。

`release.yml` 仍只有 `workflow_dispatch`。新增可选输入 `tag`，默认空字符串（L14–18）。不填时 tag 仍是 `desktop-r${run}-${shortsha}` 或 `desktop-dryrun-${run}-${shortsha}`，名称和跳过逻辑不变（判定在 `scripts/release-tag.mjs`。不填时的生成和跳过在 workflow L132–194；填了 tag 时，创建前的拒绝在 L42–63 和 L163–168，创建在 L326–376。草稿提示在 Generate release notes，约 L275–280）。填了 `v1.0.0` 时必须是 `v` 加 `package.json` 的版本；远端已有同名 tag，或已有同名 Release（含草稿，名称 `LexiQuest v1.0.0` 或 tag 相同）就失败，不覆盖。通过后创建名为 `LexiQuest v1.0.0` 的 Release，tag 为该值，target 为本次 `github.sha`。`draft` 仍决定是不是草稿。正文仍由 `scripts/release-notes.mjs` 取 `RELEASE_NOTES.md` 的 `## 1.0.0`，其中有「Windows 和 Mac 的安装包只做了文件级核验（产物存在、文件名、大小），没有做真机启动测试。」显式 tag 即使 `draft=true` 也不写入「这是草稿 Release，仅用于测试验证，请勿使用。」`gh release edit --draft=false` 不改正文，所以这句不能留到发布后再删。不填 tag 时，草稿仍写这句，正式 `desktop-r` 不写。判定是 `scripts/release-tag.mjs` 的 `draftNoticeFor`。

按这个顺序做（现在不要做）：

1. Haru 合 #18。合并之后的 main 提交才是这次 Release 的 target。
2. Haru 删旧草稿 `442757802`。不要点 Publish。命令：`gh release delete desktop-dryrun-5-65d0eb2 --repo jiangbw112/lexiquest --yes`。确认：`gh api repos/jiangbw112/lexiquest/releases/442757802` 是 404，并且 `refs/tags/desktop-dryrun-5-65d0eb2` 仍是 404。
3. 从 main 跑 `release.yml`，参数 `tag=v1.0.0`、`draft=true`。命令：`gh workflow run release.yml --repo jiangbw112/lexiquest --ref main -f tag=v1.0.0 -f draft=true`。
4. 核对这份草稿的资产哈希和正文。命令：`gh release view v1.0.0 --repo jiangbw112/lexiquest --json tagName,targetCommitish,isDraft,name,body`。`targetCommitish` 应是第 1 步的合并提交 SHA。正文要含文件级核验、没有真机启动测试那一句，并且没有「请勿使用」。再下载三个安装包，对每个文件算 sha256。
5. 发布。命令：`gh release edit v1.0.0 --repo jiangbw112/lexiquest --draft=false`。确认 `gh api repos/jiangbw112/lexiquest/git/ref/tags/v1.0.0` 的 SHA 等于第 1 步的合并提交，并且 `gh release list` 里 tag 为 `v1.0.0` 的只有这一条。`desktop-r3-ab2c554` 和 `desktop-r4-9613161` 是更早的已发布 tag，不要为了这一步删掉。

## 缺口

游戏内容上，六职和 31 个年级章没有缺立绘、行走、技能特效、技能卡、场景、小怪或章节 Boss 图。Boss 血量是六职共用的一张表，不是每章各写一个数。

规格原文在仓库外，已按哈希核对。创建页 4 条差异记在「1.0.1 待修」，不阻塞 1.0.0。验收清单 v2.10 不在本仓库。

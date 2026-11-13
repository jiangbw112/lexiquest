# 1.0.0 发布前检查

核对的提交是 `origin/main` `22931e6a28aaddca73f2d4e598d96074269f16db`。这一份只记录当时仓库里能对上的文件。没有发布，没有打 tag。

## 规格在哪里

仓库里找不到 CLASS_SPEC v1.0.3 的正文。`git ls-files` 没有 `CLASS_SPEC` 或 `class_spec`。代码只在注释里点到它：`src/domain/class-copy.ts`、`src/domain/class-unlock.ts`。下面的六职名单以游戏里的 `src/domain/classes.ts` 为准：战士、法师、游侠、治愈师、发明家、探险家。界面上的治疗职业叫「治愈师」，不是「治疗」。

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

下表的背景和小怪路径都在 `public/assets/chapter/scenes/` 下面。Boss 图在 `public/assets/chapter/` 下面。每一章的四套 Boss 姿势（idle、attack、hit、defeat 的 png 和 json）都在磁盘上。血量不是每章一张表：所有年级章 Boss 都用 `src/domain/provisional.ts` 的 `bossPhaseHpByClass`，按玩家职业取每阶段血量。

| 序 | 章名 | id | 场景背景 | 小怪 | Boss 美术 | Boss 数据 |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 朋友与家人 | `pep_g3_01` | `home/bg_map.webp`、`home/bg_battle.webp` | 抱枕灵 `cushion`，`minions/atlas_monsters_scenes.json` 的 `monster_cushion_idle` / `monster_cushion_hit` | `family_album`：`bosses/family_album/boss_family_album_w_idle@2x.png` 及 attack、hit、defeat | 名「全家福守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 3 | 动物好朋友 | `pep_g3_02` | `animals/bg_map.webp`、`animals/bg_battle.webp` | 爪爪灵 `pawlet`，`minions/atlas_monsters_scenes.json` 的 `monster_pawlet_idle` / `monster_pawlet_hit` | `tigerkin`：`bosses/tigerkin/boss_tigerkin_w_idle@2x.png` 及 attack、hit、defeat | 名「温柔小虎灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 4 | 花园调色盘 | `pep_g3_03` | `farm/bg_map.webp`、`farm/bg_battle.webp` | 芽芽灵 `sprout`，`minions/atlas_monsters_scenes.json` 的 `monster_sprout_idle` / `monster_sprout_hit` | `duckbrush`：`bosses/duckbrush/boss_duckbrush_w_idle@2x.png` 及 attack、hit、defeat | 名「绿鸭画笔灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 5 | 彩虹数数 | `pep_g3_04` | `town/bg_map.webp`、`town/bg_battle.webp` | 路灯灵 `lampkin`，`minions/atlas_monsters_scenes.json` 的 `monster_lampkin_idle` / `monster_lampkin_hit` | `envelope`：`bosses/envelope/boss_envelope_w_idle@2x.png` 及 attack、hit、defeat | 名「远方来信灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 6 | 认识新朋友 | `pep_g3_05` | `school/bg_map.webp`、`school/bg_battle.webp` | 橡皮灵 `rubkin`，`minions/atlas_monsters_scenes.json` 的 `monster_rubkin_idle` / `monster_rubkin_hit` | `giftbox`：`bosses/giftbox/boss_giftbox_w_idle@2x.png` 及 attack、hit、defeat | 名「礼物盒守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 7 | 爱学习的我 | `pep_g3_06` | `school/bg_map.webp`、`school/bg_battle.webp` | 橡皮灵 `rubkin`，`minions/atlas_monsters_scenes.json` 的 `monster_rubkin_idle` / `monster_rubkin_hit` | `penciler`：`bosses/penciler/boss_penciler_w_idle@2x.png` 及 attack、hit、defeat | 名「铅笔尺子灵」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
| 8 | 好吃又健康 | `pep_g3_07` | `food/bg_map.webp`、`food/bg_battle.webp` | 热气灵 `steam`，`minions/atlas_monsters_scenes.json` 的 `monster_steam_idle` / `monster_steam_hit` | `mealmap`：`bosses/mealmap/boss_mealmap_w_idle@2x.png` 及 attack、hit、defeat | 名「营养餐盘守护者」；id 在 `chapter-bosses.ts`；血量走 `provisional.ts` 的 `bossPhaseHpByClass` |
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

## 缺口

游戏内容上，六职和 31 个年级章没有缺立绘、行走、技能特效、技能卡、场景、小怪或章节 Boss 图。Boss 血量是六职共用的一张表，不是每章各写一个数。

仓库里没有 CLASS_SPEC v1.0.3 文件。README 的「玩法说明」仍写着只能扮演战士、战斗图仍是暂定 v0.1。那一段不在这次改动范围内，所以没有改。

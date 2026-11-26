# WeChat landscape UI v0.2

Chrome adapter `paintFrame` replay at 844×390 (and 1280×800 for the title, parent gate, and wardrobe). Not WeChat DevTools, not a phone, and not a device measurement. The safe rect `(56,16,732,350)` and the capsule `(740,0,104,44)` are the design assumptions from UI_SPEC.

Shots are `w8-v02-*`. The earlier `w8-r11-*` and `w8-r13-*` files are the before shots and were not overwritten.

## Nine-slice

`src/game/warm/slices.json` was not edited. Phone drawing keeps the repo @2x crop (buttons 32/32/30/40, parchment 40, wood 48, input 40, dialog 56/56/104/56) and uses about half of that as the destination inset, then clamps short controls so a 48px face still has room for the glyph. Digit keys use a 3px destination inset because the visible stroke is about 3px, not the 16px slice. Battle and exam HP bars reuse the existing `hp_frame` 24/24 and `hp_fill_*` 16/16 insets from `slices.json`; that file was not edited. Large panels are wood plus parchment. Dialog frames are not used for those panels. The parent-gate 确认 is `btn_primary_normal` from `atlas_ui_core` with ink text. That scene does not load `atlas_battle`, so the teal action frame is not relied on. Exam intro has no scroll-roller frame in the atlas, so the body sits on a parchment panel. The title plaque is a packed copy at `wechat/packages/art-ui/logo_lexiquest_v02.png`, not a new public original.

## Pages

- Title: plaque 「词境练习家」, tagline, 继续学习 / 重新开始 / 换角色. Old `logo_title` stays hidden.
- Village: cover of `bg_village` with the plaza kept in frame. Building sprites sit on the path pads. HUD is the grade line plus the daily goal. 换角色 is a real button, clear of the capsule assumption. The 学堂 name sits in that building's cream plate. The other nameplates stay where they were.
- Parent gate: masked 4 dots, keypad 1–9, 清除 80×48, 0 48×48, 确认 80×48. First 确认 moves to 再输入一次. Second 确认 submits. No plaintext. Note stays left of the keys.
- Wardrobe: 已有装备, then the wreath rule, then the outfit, then 称号. 穿着 is an 88×44 chip. Mirror and hero stay on the right.
- Skills: 盾击, 战吼, 坚守, 旋风斩 each keep the name and the description on one card. Fresh practice only has 盾击 equipped, shown as 已装备. Locked cards still show 未装备, including 旋风斩, as a caption rather than a hit, so a new save does not have to unequip 盾击 first. Nothing is unlocked and the equipped count stays 1. The three-card rule is the existing sentence. 换职业 stays a button.
- Academy: chapter picker still has 确认, disabled until a chapter is chosen. Study shows 学一学 as a tab and the real actions 听一听 / 选意思 / 拼一拼. No word picture; the repo has no apple asset for the study card.
- Grades: 三年级–六年级, 选好了，去起名字 stays disabled until a grade is chosen. The sentence is 先选年级.
- Create: 3×2 class cards, blurbs stay 11px, the 选一个职业 plank stays 40 tall. Name field shows the real prefilled 学习者. 出发 stays the gold primary button and submits the existing name form. The selected class sheet is drawn once, inside the right-hand preview panel. The other class sheets are not painted, so they do not sit on the top bar or the plank.
- Stages: chapter line still reads 第 n / 9 章. 上一章, 下一章, 去学堂, 小战斗 or 再战, and 期中挑战 when the map node is ready. 期中挑战 is the labeled hit.
- Battle: choose shows 攻击 / 格挡 / 治疗. The question phase shows the prompt and the three choices (`w8-v02-battle-question-844x390.png`). While `phase` is `question`, the existing player name gains ` · 第N题` from `questionsAsked`. Teal and coral bars use `displayHp` or the stored HP divided by the stored max. There is no fixed question total in the engine, so 「共 N 题」 is not drawn. The bars sit under the names and stop before the hero and the monster.
- Results: `bg_ending` covers the view. English words and glosses share a row. 继续 sits outside the board. Extra reward lines that do not fit are left off the painted list rather than drawn past the screen.
- Exam intro: parchment stand-in, the practice sentence, and 开始答题. The question after that press is three choices (`w8-v02-exam-question-844x390.png`). The exam scene does not draw a player name, so the left line is only `第N题` from `questionsAsked`. HP bars use the same stored ratios as battle. 「共 N 题」 is not drawn. 第 n 段 is not shown. The boss moves down only when the enemy bar is drawn, so the bar stays above the scroll.

Word mp3 count stays 0. Speak-call and missing-audio stay separate labels. No WeChat upload, review, or acceptance is claimed.

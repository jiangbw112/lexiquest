# 词境冒险 LexiQuest

A desktop browser adventure for Chinese primary-school students in grades 3–6. The child plays a warrior, learns the Forest Adventure sample words, collects word cards, battles a word monster with up to three skill cards, and reviews on an adaptive schedule.

This is a local browser MVP. Progress stays in `localStorage` and is only a cache. There is no chat and no real-money shop.

## Setup

Requirements: Node.js 22. Developed on 22.x. npm 10 is enough.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Use a desktop Chrome, Edge, or Safari window. This MVP is keyboard and mouse only. It does not add tablet touch controls.

```bash
npm test
npm run lint
npm run build
npm run preview
```

Chinese text uses WenQuanYi Micro Hei when it is installed, then Noto Sans SC or PingFang SC.

## How to play

1. Press Enter, choose one or more grades (3, 4, 5, 6; grade 3 if you leave them all off), and type a name with the keyboard. This chapter is a warrior. The painted figure is provisional art v0.1 (outfit A, battle view, facing right). Grades can be changed later on 给家长.
2. On the village map, click a building or press its number. 1 学堂, 2 对战, 3 词卡册, 4 复习桌, 5 技能, 6 衣柜, 7 同机练习, 8 给家长.
3. In 学堂, study a SAMPLE DATA word from the grades you picked. Enter asks a meaning question, L plays a listening question, and P asks for keyboard spelling when that word allows it. Grade-3 basic words still use spelling. Advanced words spell only while the mastery badge is lit. Words marked none are never spelled. A correct answer grants the word card immediately.
4. 对战 opens the five forest stages. A stage clears when its new words are learned and one small battle is won. Empty stages for a turned-off grade are skipped. Attack, block, and heal are keys 1–3. Skill slots are keys 4–6. Casting a skill card draws a question from due learned chapter words, or from learned chapter words if nothing is due. The same word is not asked again inside the last 3 questions when another word is available. A correct answer uses the card’s full effect. A wrong answer uses only the reduced base effect. Empty skill slots are filled with a weaker class base skill, so one equipped card is enough to start.
5. Winning grants experience, may level a skill, and earns the 林间斗篷. Losing does not take cards away and does not change review memory. A lost boss fight can be retried.
6. The boss is 林心守护者, on the fifth stage, after the earlier stages are cleared and every chapter word in the selected grades has a card. The fight has two phases. Beating the boss clears the chapter even if no mastery badge is lit. The completion screen shows lit badges out of 28. The boss figure is the provisional v0.1 林冠, one layer, facing left. Turning a grade off keeps cards you already collected. 给家长 opens 学习进度: today's new words, due reviews, lit badges, and words that keep getting mixed up. The daily goal is on the village and on that page. Its numbers are confirmed v1 in `src/domain/proposals.ts`. The study day rolls at 04:00 in the device time zone. A clock or time-zone change does not take tokens back, roll state back, or fill in skipped days. Finishing the goal adds one appearance token and lights that day. It does not add a streak, XP, or battle stats. Changing the goal tier and changing grades share one parent PIN. It is a local gate against accidental changes, not a login. Clearing browser data removes it. The record is PBKDF2-SHA256 in its own localStorage key, separate from the save. Forgetting it asks a two-digit multiplication, which is a tech default still waiting on product and design, then resets only the PIN. Nothing here is sent over the network. Battle questions and due reviews for that grade pause, and come back with the same FSRS state when you select it again. 给家长 shows a notice when that happens. If a future list is too small to start a battle, the village says so instead of starting a broken fight. The village token bobs in place and walks to a building when you choose it. The figure is still the placeholder.
7. Open 复习桌. Scheduling follows FSRS (`ts-fsrs`), not a fixed 1/3/7-day ladder. The 学习沙漏 (T, Y, R) moves a local practice clock. An earned badge turns grey when the word is due or lapsed, and turns bright again after a correct review. The card stays.
8. Collecting every sample card earns the 星光绶带. Collection is not mastery.
9. 同机练习 is the existing same-device practice. It is not an online match, and it does not update FSRS. Friend 1v1 is deferred.

## Rules this MVP keeps

- Learning grants the word card at once. A mastery badge is separate. The card is permanent. The badge greys out when the word is due or lapsed and is restored after a correct review. Changing the badge never deletes the card.
- Word cards and skill cards are different. A skill card is not bound to a word. Players carry at most 3 skill cards. Empty slots are auto-filled with the weaker class base skill.
- When a skill card is cast in PvE, the question comes from that child’s FSRS-due learned words in this chapter and in the grades that are still selected. If none are due, it comes from learned chapter words in those grades. A deselected grade is not asked, and its reviews pause. Unlearned words are never used. The deck uses the whole pool before repeating the same words, and it also skips a word that was one of the last 3 questions when another word is available.
- In a friend 1v1, both sides use one shared learned-word pool and identical slot values. Scoring is lexicographic: more correct answers wins; if the counts match, the lower total time on correct answers wins. Wrong answers add neither a count nor time. 1v1 answers do not update FSRS.
- Review state is per word and follows FSRS. Mastery needs a correct review on at least 2 different Asia/Shanghai days and FSRS stability of at least 7 days. Repeating a word on the same day cannot award mastery by itself. Winning or losing a battle does not change memory or cards. Pausing a grade does not change that word’s FSRS state.
- Rewards are earned. There is no random paid loot.
- The P0 hero is one warrior appearance. Other classes and looks stay in the domain data for later art. The battle figure is 11 layered PNG atlases from the provisional v0.1 pack, not skeletal animation. Garment layers (`outfit_back`, `outfit_body`, `outfit_head`, `outfit_front`) stay separate from the body layers and from the sword and shield, so a later outfit can replace the clothes only. The village map has no top-down sheet in this pack, so the map token stays the geometric placeholder.
- 林心守护者 uses the provisional v0.1 林冠 pack: one layer, 768² @2x, foot pivot (0.5, 0.875), facing left, scale 0.5, no flip. Idle loops at 6 fps. Attack, hit, and defeat play once. Defeat holds its last frame. The battle note wraps at 640px so a second line stays clear of the canopy.
- Pronunciation for v1 is the browser speech engine. There are no third-party recordings.

## Decided v1 numbers

These are decided. They live in `src/domain/provisional.ts`. Boss health is v1 tuning in the same file. Exploration health, the question gap, and the completion title and cosmetic are still provisional.

| Rule | Value |
| --- | --- |
| Mastery badge | A correct review on at least 2 different Asia/Shanghai days, and FSRS stability ≥ 7 days |
| Skill cards carried | 3 |
| Base skill power scale | 0.45 of the class starter at level 1, and always weaker than that starter |
| Base skill energy cost | 0, so a battle can start with one real card |
| Wrong PvE skill answer | Level-1 power × 0.5. A correct answer still uses the full leveled power |
| Grades | At least one of grades 3–6, default grade 3. Cards stay if a grade is turned off. Battle questions and due reviews for that grade pause until it is selected again |
| Pronunciation | Browser text-to-speech |

Friend 1v1 comparison is a confirmed rule, not a point formula. Combat health and damage in `src/domain/classes.ts` are ordinary MVP tuning.

Provisional chapter numbers, also in `src/domain/provisional.ts`:

| Item | Value |
| --- | --- |
| Exploration enemy health / attack | 44 / 6, about 3–5 casts of 盾击, 战吼, or 旋风斩 |
| Question gap | No repeat inside the last 3 questions when another word can be asked |
| Completion reward | Read from `src/domain/data/forest-rewards.json`. First clear grants `forest_leaf_cape` and the default title candidate. Mastery uses `ceil(chapter length × 0.5)` and `ceil(chapter length × 1)`. Names are not final (`final_name_selected_by_pm` is false) |

林心守护者 is two phases of 65 health. 盾击 clears in 12 casts and 战吼 in 9. 旋风斩 is heavier and clears in 7. Spelling stays at or under 30% of boss questions. These can move after playtesting.

Forest chapter cosmetics and titles are `src/domain/data/forest-rewards.json`. The word loader skips that file because it has no `words` array. The first clear and the two mastery milestones grant cosmetics and titles once. A grey badge does not take them back, and a replay does not grant them again. They do not change XP, FSRS, or combat stats. The daily cosmetic token is still the daily-goal reward. The drawn pieces in `public/assets/chapter/forest/v0.1-placeholder/` are single-color silhouettes, not finished art. The cape is `cosmetic_back`, the acorn pin is `cosmetic_chest` at z 47, and the wreath is `cosmetic_head`. This warrior pack has no `back` atlas and no separate helmet plume, so those hide rules have nothing of their own to hide. The plume stays inside `outfit_head`.

Placeholder art, the village map, and the provisional v0.1 warrior atlases together are about 818 KB. The provisional v0.1 林冠 atlases add about 1.15 MB, so `public/assets` is about 1.98 MB, over the earlier 1.5 MB figure that covered the warrior pack only. The production JavaScript bundle is about 1.31 MB before gzip because it includes Phaser. A headless desktop Chrome run on this machine booted to the title in 995 ms, then measured 26 fps and 54 MB of JavaScript heap on the village after 45 frames. Headless frame rate is below the 60 fps target and the 30 fps floor; a normal desktop window should be higher. Boot time and heap are inside the 2 second and 150 MB budgets.

## Sample data

`src/domain/data/forest-adventure.json` is the approved 28-word Forest Adventure list. The words are self-chosen common words, marked SAMPLE DATA, not textbook text. `grade_est` is an estimate. Spelling is `basic` (allowed from the start, including grade 3), `advanced` (only after the mastery badge), or `none`. Every word supports meaning and listening questions. Distractors come from the same theme and grade first. The grade map still has G3–G6, two semesters, and six unit slots. Only the first unit of each grade is filled.

The forest loader reads every JSON file in `src/domain/data/` that has a `words` array. `forest-stages.json` is the chapter, not a word list, so the loader skips it. A word file uses `theme`, `sample`, and a `words` array of `{ word, meaning_zh, grade_est, spelling }`. Extra fields, including `senses`, `notes`, and top-level lists such as `dedup_dropped`, are ignored. One file can hold every grade, or each grade can have its own file. Adding a word file there does not require a code change. A repeated word id is refused. The PEP grades 3–6 list is loaded separately from `src/domain/pep/` and is not part of that directory, because 20 ids also appear in the forest sample. The playable chapter stays on the sample list. `docs/pep/forest_chapter_mapping_v1.json` is kept for later and is not read by the game. `unitId` is still hard-coded, and semester and unit are not used.

## Save data

The key is `lexiquest.save.v1` in the browser’s `localStorage`. It is an MVP cache, not authoritative progress. Clearing site data, or 给家长 → 清除这台浏览器的缓存, deletes it. Rewards stored here must be checked again before any future server grant.

## What is left

- Server-authoritative save. This browser cache is not the child’s real progress.
- Networked friend 1v1. Same-device practice uses the tested comparison. A real match must be server-authoritative for the room, judging, timing, the lexicographic result, and rewards, with replay, forgery, and duplicate-reward protection. The client must not submit the final result.
- Switching the forest chapter onto PEP ids. The two lists stay separate until that reference is decided. `unitId` is still hard-coded, and semester and unit are not used.
- Explorer and the other classes as painted characters. The domain already has their skills. This chapter draws the provisional v0.1 warrior only.
- A top-down warrior for the village map. v0.1 is battle view only, so the map token is still the placeholder. It only bobs and walks with a tween.
- Whether a turned-off grade should change the boss gate. The clear itself is the boss win. Lit badges stay a count of this chapter’s words. The boss figure is provisional v0.1 林冠 (`bossSprite` is `canopy`).
- Finished drawings for the leaf cape, acorn pin, wreath, and leaf icon. The files in `public/assets/chapter/forest/v0.1-placeholder/` are labeled silhouettes. Title names stay the first candidate until the config sets `final_name_selected_by_pm`.
- A separate `back` layer and a separate helmet plume. The cape hide rule and the wreath plume rule are in the reward config, and this pack cannot apply them to their own art.
- A final 林冠 drawing. v0.1 is the integrable pack under `public/assets/boss/canopy/v0.1`, documented in `docs/art/boss-canopy/`.
- Outfit variants. 林间斗篷 and 星光绶带 are stored, but v0.1 bakes a single outfit A. Equipping them does not change the painted layers.
- More appearances. The save still stores ponytail and freckles. The painted appearance A is short brown hair with the face baked into the body layer.
- Walk is in the atlas (6 frames at 10 fps) and is not played in battle, because the battle scene does not move the figure.
- Tablet touch and an iPad app. This MVP does not target them.

## Layout

- `src/domain` — cards, FSRS review, battle, skill slots, duel scoring, rewards, save shape
- `src/domain/proposals.ts` — confirmed v1 numbers for the parent page and the daily goal
- `src/domain/parent-pin.ts` — local parent PIN gate against accidental changes. The adult-check form is a tech default pending product and design confirmation
- `src/domain/data/forest-adventure.json` — the approved sample word list, still the playable chapter
- `src/domain/pep/pep_words_g3-6_v1_loader.json` — the PEP grades 3–6 list, loaded separately
- `docs/pep/forest_chapter_mapping_v1.json` — unused forest-to-PEP mapping
- `src/game` — Phaser 3 client, placeholder atlas, provisional warrior v0.1, provisional 林冠 v0.1, and scenes
- `public/assets/warrior/v0.1` — the 11 battle-view atlases, `manifest.json`, and `slots.json`
- `public/assets/boss/canopy/v0.1` — the four 林冠 atlases and `manifest.json`
- `docs/art` — the warrior pack README, slot table, and QA report. `docs/art/boss-canopy` is the 林冠 readme and QA report. `style_ref_v0.1.png` is concept art and is not in the game
- `src/domain/*.test.ts` — review scheduling, card and badge tone, the 3-slot loadout, question pools, and lexicographic scoring

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

## Desktop app

The browser build is unchanged. `npm run build` still produces the web `dist/` and the same boot-budget check. The desktop shell is a separate package that loads that `dist/` through a custom `app://lexiquest/` origin. It does not add save import or export.

Pack the app for the machine you are on:

```bash
npm run build:desktop
```

Platform-specific installers, still unsigned except for the Mac ad-hoc signature:

```bash
npm run build:desktop:win
npm run build:desktop:mac
npm run build:desktop:linux
```

- Windows is an NSIS installer, x64 only, with no code signature. `dist-desktop/LexiQuest-<version>-win-x64.exe`.
- Mac is a zip of the `.app`, one x64 and one arm64. `dist-desktop/LexiQuest-<version>-mac-x64.zip` and `dist-desktop/LexiQuest-<version>-mac-arm64.zip`. The app is ad-hoc signed (`identity: "-"`). It is not notarized.
- Linux `build:desktop:linux` writes an unpacked directory used to smoke-test the shell. It is not a release installer.

Windows SmartScreen will say “Windows protected your PC” because the installer is unsigned. Choose **More info**, then **Run anyway**.

macOS Gatekeeper will say the app is from an unidentified developer, or that it cannot be opened. In Finder, Control-click the app and choose **Open**, then **Open** again. If that is still blocked, open **System Settings → Privacy & Security** and use the **Open Anyway** button for LexiQuest. Do not disable Gatekeeper.

The save stays in Electron’s `userData` directory (`localStorage` for `app://lexiquest`). On Windows that is `%APPDATA%\LexiQuest`. On macOS it is `~/Library/Application Support/LexiQuest`. The NSIS uninstaller leaves that folder in place (`deleteAppDataOnUninstall` is false, which is electron-builder’s default). Uninstalling the app does not delete the save.

A desktop save and a browser save do not see each other. The browser copy is the site’s `localStorage`. The desktop copy is this app’s `userData`. Clearing one does not clear the other. There is no import and no export.

Chinese text uses WenQuanYi Micro Hei when it is installed, then Noto Sans SC or PingFang SC.

## How to play

1. Press Enter. A new game asks for one or more grades (3, 4, 5, or 6) before the name. Nothing is selected, including grade 3. With none selected, Continue stays disabled and the picker says 至少选一个年级. An older save that never stored a grade opens that same picker before the village. A save that is already empty and was confirmed does not: it says 请家长选年级, and that page cannot write a grade. 学堂 and 对战 stay closed until at least one grade is picked. Grades can be changed later on 给家长. Chips can all be turned off in the draft, but 保存年级 stays disabled and the page says 至少选一个年级. An empty grade list is not saved. Then type a name with the keyboard. This chapter is a warrior. The painted figure is provisional art v0.1 (outfit A, battle view, facing right).
2. On the village map, click a building or press its number. 1 学堂, 2 对战, 3 词卡册, 4 复习桌, 5 技能, 6 衣柜, 7 同机练习, 8 给家长.
3. In 学堂, study a SAMPLE DATA word from the grades you picked. Enter asks a meaning question, L plays a listening question, and P asks for keyboard spelling when that word allows it. Grade-3 basic words still use spelling. Advanced words spell only while the mastery badge is lit. Words marked none are never spelled. A correct answer grants the word card immediately.
4. 对战 opens the five forest stages. A stage clears when its new words are learned and one small battle is won. A stage with no learnable words for the selected grades is not skipped: winning one small battle clears it. The map and the village line say that, and they do not show a 0/0 count. The map header 已学 count uses the same word list as the boss gate. Attack, block, and heal are keys 1–3. Skill slots are keys 4–6. Casting a skill card draws a question from due learned chapter words, or from learned chapter words if nothing is due. The same word is not asked again inside the last 3 questions when another word is available. A correct answer uses the card’s full effect. A wrong answer uses only the reduced base effect. Empty skill slots are filled with a weaker class base skill, so one equipped card is enough to start.
5. Winning grants experience, may level a skill, and earns the 林间斗篷. Losing does not take cards away and does not change review memory. A lost boss fight can be retried.
6. The boss is 林心守护者, on the fifth stage, after the earlier stages are cleared and every chapter word in the selected grades has a card. The fight has two phases. Beating the boss clears the chapter even if no mastery badge is lit. The completion screen shows lit badges out of 28. The boss figure is the provisional v0.1 林冠, one layer, facing left. Turning a grade off keeps cards you already collected. 给家长 opens 学习进度: today's new words, due reviews, lit badges, and words that keep getting mixed up. The daily goal is on the village and on that page. Its numbers are confirmed v1 in `src/domain/proposals.ts`. The study day changes at local midnight on the device. A clock or time-zone change does not take tokens back, roll state back, or fill in skipped days. Finishing the goal adds one appearance token and lights that day. It does not add a streak, XP, or battle stats. Changing the goal tier and changing grades share one parent PIN. It is a local gate against accidental changes, not a login. Clearing browser data removes it. The record is PBKDF2-SHA256 in its own localStorage key, separate from the save. Forgetting it asks a two-digit multiplication, which is a tech default still waiting on product and design, then resets only the PIN. Nothing here is sent over the network. Battle questions and due reviews for that grade pause, and come back with the same FSRS state when you select it again. 给家长 shows a notice when that happens. If a future list is too small to start a battle, the village says so instead of starting a broken fight. The village token bobs in place and walks to a building when you choose it. The figure is the actors atlas v0.2 top view: shadow, body, hair, cape, and sash.
7. Open 复习桌. Scheduling follows FSRS (`ts-fsrs`), not a fixed 1/3/7-day ladder. The 学习沙漏 is hidden unless the page is opened with `?dev=1` (for example `http://localhost:5173/?dev=1`). With that query, T, Y, and R move a local practice clock; without it those keys do nothing. An earned badge turns grey when the word is due or lapsed, and turns bright again after a correct review. The card stays.
8. Collecting every sample card earns the 星光绶带. Collection is not mastery.
9. 同机练习 is the existing same-device practice. It is not an online match, and it does not update FSRS. Friend 1v1 is deferred.

## Rules this MVP keeps

- Learning grants the word card at once. A mastery badge is separate. The card is permanent. The badge greys out when the word is due or lapsed and is restored after a correct review. Changing the badge never deletes the card.
- Word cards and skill cards are different. A skill card is not bound to a word. Players carry at most 3 skill cards. Empty slots are auto-filled with the weaker class base skill.
- When a skill card is cast in PvE, the question comes from that child’s FSRS-due learned words in this chapter and in the grades that are still selected. If none are due, it comes from learned chapter words in those grades. A deselected grade is not asked, and its reviews pause. Unlearned words are never used. The deck uses the whole pool before repeating the same words, and it also skips a word that was one of the last 3 questions when another word is available.
- In a friend 1v1, both sides use one shared learned-word pool and identical slot values. Scoring is lexicographic: more correct answers wins; if the counts match, the lower total time on correct answers wins. Wrong answers add neither a count nor time. 1v1 answers do not update FSRS.
- Review state is per word and follows FSRS. Mastery needs a correct review on at least 2 different local calendar days on the device, and FSRS stability of at least 7 days. Repeating a word on the same day cannot award mastery by itself. Winning or losing a battle does not change memory or cards. Pausing a grade does not change that word’s FSRS state.
- Rewards are earned. There is no random paid loot.
- The P0 hero is one warrior appearance. Other classes and looks stay in the domain data for later art. The battle figure is 11 layered PNG atlases from the provisional v0.1 pack, not skeletal animation. Garment layers (`outfit_back`, `outfit_body`, `outfit_head`, `outfit_front`) stay separate from the body layers and from the sword and shield, so a later outfit can replace the clothes only. The village map token is the actors atlas v0.2 top view (shadow, body, hair, cape, and sash), not a geometric placeholder. The warrior pack itself is still the battle view and has no separate top-down sheet.
- 林心守护者 uses the provisional v0.1 林冠 pack: one layer, 768² @2x, foot pivot (0.5, 0.875), facing left, scale 0.5, no flip. Idle loops at 6 fps. Attack, hit, and defeat play once. Defeat holds its last frame. The battle note wraps at 640px so a second line stays clear of the canopy.
- Pronunciation for v1 is the browser speech engine. There are no third-party recordings.

## Decided v1 numbers

These are decided. They live in `src/domain/provisional.ts`. Boss health is v1 tuning in the same file. Exploration health, the question gap, and the completion title and cosmetic are still provisional.

| Rule | Value |
| --- | --- |
| Mastery badge | A correct review on at least 2 different local calendar days on the device, and FSRS stability ≥ 7 days |
| Skill cards carried | 3 |
| Base skill power scale | 0.45 of the class starter at level 1, and always weaker than that starter |
| Base skill energy cost | 0, so a battle can start with one real card |
| Wrong PvE skill answer | Level-1 power × 0.5. A correct answer still uses the full leveled power |
| Grades | At least one of grades 3–6, chosen before learning or battle. No default grade. Cards stay if a grade is turned off. Battle questions and due reviews for that grade pause until it is selected again |
| Pronunciation | Browser text-to-speech |

Friend 1v1 comparison is a confirmed rule, not a point formula. Combat health and damage in `src/domain/classes.ts` are ordinary MVP tuning.

Provisional chapter numbers, also in `src/domain/provisional.ts`:

| Item | Value |
| --- | --- |
| Exploration enemy health / attack | 44 / 6, about 3–5 casts of 盾击, 战吼, or 旋风斩 |
| Question gap | No repeat inside the last 3 questions when another word can be asked |
| Completion reward | Read from `src/domain/chapters/forest-rewards.json`. First clear grants `forest_leaf_cape` and the default title candidate. Mastery uses `ceil(chapter length × 0.5)` and `ceil(chapter length × 1)`. Names are not final (`final_name_selected_by_pm` is false) |

林心守护者 is two phases of 65 health. 盾击 clears in 12 casts and 战吼 in 9. 旋风斩 is heavier and clears in 7. Spelling stays at or under 30% of boss questions. These can move after playtesting.

Forest chapter cosmetics and titles are `src/domain/chapters/forest-rewards.json`. That file stays outside the word-list directory. The first clear and the two mastery milestones grant cosmetics and titles once. A grey badge does not take them back, and a replay does not grant them again. They do not change XP, FSRS, or combat stats. The daily cosmetic token is still the daily-goal reward. The painted pieces are forest rewards v0.1 under `public/assets/chapter/forest/v0.1/`. The manifest status is 暂定. The cape is `cosmetic_back` at z 6, the acorn pin is `cosmetic_chest` at z 47, and the wreath is `cosmetic_head` at z 65. Slot table v0.2 adds `cosmetic_chest`. The pin's chest offset is already inside the trimmed frames. This warrior pack has no `back` atlas, so the cape hide rule has no backpack to hide. The wreath hides the whole `outfit_head` layer, which is the helmet with the plume baked in. The plume is not split into its own frame. In side view the cape reads as a strip of leaves behind the body. The pin is small, and on attack frames 02 and 03 most of it sits under the near arm.

Placeholder art, the village map, and the provisional v0.1 warrior atlases together are about 818 KB. The provisional v0.1 林冠 atlases add about 1.15 MB. Forest rewards v0.1 adds about 228 KB. `public/assets` is about 2.12 MB, over the earlier 1.5 MB figure that covered the warrior pack only. The production JavaScript bundle is about 1.31 MB before gzip because it includes Phaser. A headless desktop Chrome run on this machine booted to the title in 995 ms, then measured 26 fps and 54 MB of JavaScript heap on the village after 45 frames. Headless frame rate is below the 60 fps target and the 30 fps floor; a normal desktop window should be higher. Boot time and heap are inside the 2 second and 150 MB budgets.

## Sample data

`src/domain/data/pep_words_g3-6_v1.2.2_loader.json` is the only word list. It is the PEP grades 3–6 library, v1.2.2, 863 words, `sample` false. The loader reads `word`, `meaning_zh`, `grade_est`, `spelling`, and an optional `pos`. `pos` is an opaque string and is shown exactly as written, including `modal v.` and `v./n.`. Null, a missing field, or `""` leaves the meaning with no prefix. A number or an object is refused. The v1.2.2 loader file has word-level `pos` only. When an entry also has `senses`, a shown sense uses that sense's `pos` and falls back to the word's `pos`. A sense marked `new_sense` is not loaded and is never a quiz answer or distractor. Notes, change notes, and top-level lists such as `dedup_dropped` are still ignored. A file in that directory without a `words` array is refused. One file can hold every grade, or each grade can have its own file. A repeated word id is refused. `unitId` is still hard-coded as `${grade}-S1-U1`. Semester and unit are on the formal table and are not used yet.

The forest chapter is `src/domain/chapters/chapter_forest_v1.1.json`, outside the word-list directory. Its five stages and the 6/6/6/6/4 split come from that file. Twenty words are resolved by id from the v1.2.2 library, so spelling, meaning, grade, and `pos` follow that list. The chapter file's `words_resolved_snapshot` is not read. Eight words (`bridge`, `brave`, `path`, `treasure`, `journey`, `discover`, `adventure`, `protect`) belong only to this chapter. They can be learned here and they never enter a grade pool. Boss clear rules that the chapter file does not define stay in `forest-stage-rules.json`. The school teaches this 28-word chapter. Grade pools used for “enough words to battle” and the daily-goal learn fallback are the library. Saved card ids match the previous forest ids, so existing saves keep those cards. A card’s displayed grade, meaning, spelling, and part of speech now follow v1.2.2. `docs/pep/forest_chapter_mapping_v1.json` is an older mapping and is not read.

Spelling comparison is trim, lower case, and collapsed whitespace, then an exact string. A hyphen, an apostrophe, or a space is part of the answer. `camp` and `camping` are two ids. Words with `spelling` `none`, including the conversation cards `hello`, `hi`, and `goodbye`, are never spelling questions.

## Save data

The key is `lexiquest.save.v1` in the browser’s `localStorage`. It is an MVP cache, not authoritative progress. Clearing site data, or 给家长 → 清除这台浏览器的缓存, deletes it. Rewards stored here must be checked again before any future server grant.

## What is left

- Server-authoritative save. This browser cache is not the child’s real progress.
- Networked friend 1v1. Same-device practice uses the tested comparison. A real match must be server-authoritative for the room, judging, timing, the lexicographic result, and rewards, with replay, forgery, and duplicate-reward protection. The client must not submit the final result.
- `unitId` is still hard-coded as `${grade}-S1-U1`. The v1.2.2 table has semester and unit, and this build does not use them. The school still teaches the 28-word forest chapter rather than walking every library word in that one unit.
- Explorer and the other classes as painted characters. The domain already has their skills. This chapter draws the provisional v0.1 warrior only.
- The village map token uses the actors atlas v0.2 top frames (shadow, body, hair, cape, and sash). It only bobs and walks with a tween.
- Whether a turned-off grade should change the boss gate. The clear itself is the boss win. Lit badges stay a count of this chapter’s words. The boss figure is provisional v0.1 林冠 (`bossSprite` is `canopy`).
- Title names stay the first candidate until the config sets `final_name_selected_by_pm`. The v0.1 forest drawings are in the game. The pack itself is still marked 暂定.
- A separate `back` layer. The cape hide rule targets it, and this pack does not draw one. The wreath hides the whole `outfit_head` helmet instead of a split plume.
- A final 林冠 drawing. v0.1 is the integrable pack under `public/assets/boss/canopy/v0.1`, documented in `docs/art/boss-canopy/`.
- Outfit variants. 林间斗篷 and 星光绶带 are stored, but v0.1 bakes a single outfit A. Equipping them does not change the painted layers.
- More appearances. The save still stores ponytail and freckles. The painted appearance A is short brown hair with the face baked into the body layer.
- Walk is in the atlas (6 frames at 10 fps) and is not played in battle, because the battle scene does not move the figure.
- Tablet touch and an iPad app. This MVP does not target them.

## Layout

- `src/domain` — cards, FSRS review, battle, skill slots, duel scoring, rewards, save shape
- `src/domain/proposals.ts` — confirmed v1 numbers for the parent page and the daily goal
- `src/domain/parent-pin.ts` — local parent PIN gate against accidental changes. The adult-check form is a tech default pending product and design confirmation
- `src/domain/data/pep_words_g3-6_v1.2.2_loader.json` — the PEP grades 3–6 library, the only word list
- `src/domain/chapters/chapter_forest_v1.1.json` — the forest chapter, resolved by reference
- `docs/pep/forest_chapter_mapping_v1.json` — an older mapping, not read by the game
- `src/game` — Phaser 3 client, village actors atlas v0.2, provisional warrior v0.1, forest rewards v0.1, provisional 林冠 v0.1, and scenes
- `public/assets/warrior/v0.1` — the 11 battle-view atlases, `manifest.json`, and slot table v0.2
- `public/assets/chapter/forest/v0.1` — the cape, pin, wreath, and title atlases, plus `manifest.json`
- `public/assets/boss/canopy/v0.1` — the four 林冠 atlases and `manifest.json`
- `docs/art` — the warrior pack README, slot table v0.2, and QA report. `docs/art/forest-rewards` is the forest reward readme and QA report. `docs/art/boss-canopy` is the 林冠 readme and QA report. `style_ref_v0.1.png` is concept art and is not in the game
- `src/domain/*.test.ts` — review scheduling, card and badge tone, the 3-slot loadout, question pools, and lexicographic scoring

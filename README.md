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

1. Press Enter and type a name with the keyboard. This chapter is a warrior. The painted figure is provisional art v0.1 (outfit A, battle view, facing right).
2. On the village map, click a building or press its number. 1 学堂, 2 对战, 3 词卡册, 4 复习桌, 5 技能, 6 衣柜, 7 同机练习, 8 给家长.
3. In 学堂, study a SAMPLE DATA word. Enter asks a meaning question, L plays a listening question, and P asks for keyboard spelling when that word allows it. A correct answer grants the word card immediately.
4. After 4 cards, battle 墨团. Attack, block, and heal are keys 1–3. Skill slots are keys 4–6. Casting a skill card draws a question from due learned words, or from learned words if nothing is due. A correct answer uses the card’s full effect. A wrong answer uses only the reduced base effect. Empty skill slots are filled with a weaker class base skill, so one equipped card is enough to start.
5. Winning grants experience, may level a skill, and earns the 林间斗篷. Losing does not take cards away and does not change review memory.
6. Open 复习桌. Scheduling follows FSRS (`ts-fsrs`), not a fixed 1/3/7-day ladder. The 学习沙漏 (T, Y, R) moves a local practice clock. An earned badge turns grey when the word is due or lapsed, and turns bright again after a correct review. The card stays.
7. Collecting every sample card earns the 星光绶带. Collection is not mastery.
8. 同机练习 is two children sharing this computer. It is not an online match, and it does not update FSRS.

## Rules this MVP keeps

- Learning grants the word card at once. A mastery badge is separate. The card is permanent. The badge greys out when the word is due or lapsed and is restored after a correct review. Changing the badge never deletes the card.
- Word cards and skill cards are different. A skill card is not bound to a word. Players carry at most 3 skill cards. Empty slots are auto-filled with the weaker class base skill.
- When a skill card is cast in PvE, the question comes from that child’s FSRS-due learned words. If none are due, it comes from learned words. Unlearned words are never used. The deck uses the whole pool before repeating the same words.
- In a friend 1v1, both sides use one shared learned-word pool and identical slot values. Scoring is lexicographic: more correct answers wins; if the counts match, the lower total time on correct answers wins. Wrong answers add neither a count nor time. 1v1 answers do not update FSRS.
- Review state is per word and follows FSRS. Repeating a word on the same Asia/Shanghai calendar day cannot award mastery by itself. Winning or losing a battle does not change memory or cards.
- Rewards are earned. There is no random paid loot.
- The P0 hero is one warrior appearance. Other classes and looks stay in the domain data for later art. The battle figure is 11 layered PNG atlases from the provisional v0.1 pack, not skeletal animation. Garment layers (`outfit_back`, `outfit_body`, `outfit_head`, `outfit_front`) stay separate from the body layers and from the sword and shield, so a later outfit can replace the clothes only. The village map has no top-down sheet in this pack, so the map token stays the geometric placeholder.
- Audio is an interface. The game uses the browser speech engine when it exists. There are no third-party recordings.

## Provisional and configurable numbers

These product numbers are not approved. They live in `src/domain/provisional.ts`.

| Rule | Value |
| --- | --- |
| Mastery badge | At least 2 different Asia/Shanghai calendar days, and FSRS stability ≥ 4 |
| Base skill power scale | 0.45 of the class starter at level 1, and always weaker than that starter |
| Base skill energy cost | 0, so a battle can start with one real card |
| Wrong PvE skill answer | Level-1 power × 0.5. A correct answer still uses the full leveled power |

Friend 1v1 comparison is a confirmed rule, not a point formula. Combat health and damage in `src/domain/classes.ts` are ordinary MVP tuning, not these unapproved numbers.

Placeholder art, the village map, and the provisional v0.1 warrior atlases together are about 818 KB, under the 1.5 MB asset budget. The production JavaScript bundle is about 1.29 MB before gzip (about 348 KB gzipped) because it includes Phaser. A headless desktop Chrome run on this machine booted to the title in 995 ms, then measured 26 fps and 54 MB of JavaScript heap on the village after 45 frames. Headless frame rate is below the 60 fps target and the 30 fps floor; a normal desktop window should be higher. Boot time and heap are inside the 2 second and 150 MB budgets.

## Sample data

`src/domain/data/forest-adventure.json` is the approved 28-word Forest Adventure list. The words are self-chosen common words, marked SAMPLE DATA, not textbook text. `grade_est` is an estimate. Spelling is `basic` (allowed from the start, including grade 3), `advanced` (only after the mastery badge), or `none`. Every word supports meaning and listening questions. Distractors come from the same theme and grade first. The grade map still has G3–G6, two semesters, and six unit slots. Only the first unit of each grade is filled.

## Save data

The key is `lexiquest.save.v1` in the browser’s `localStorage`. It is an MVP cache, not authoritative progress. Clearing site data, or 给家长 → 清除这台浏览器的缓存, deletes it. Rewards stored here must be checked again before any future server grant.

## What is left

- Server-authoritative save. This browser cache is not the child’s real progress.
- Networked friend 1v1. Same-device practice uses the tested comparison. A real match must be server-authoritative for the room, judging, timing, the lexicographic result, and rewards, with replay, forgery, and duplicate-reward protection. The client must not submit the final result.
- Reviewed word lists beyond this 28-word sample. Do not paste copyrighted textbook content into the empty unit slots.
- Explorer and the other classes as painted characters. The domain already has their skills. This chapter draws the provisional v0.1 warrior only.
- A top-down warrior for the village map. v0.1 is battle view only, so the map token is still the placeholder.
- Outfit variants. 林间斗篷 and 星光绶带 are stored, but v0.1 bakes a single outfit A. Equipping them does not change the painted layers.
- More appearances. The save still stores ponytail and freckles. The painted appearance A is short brown hair with the face baked into the body layer.
- Walk is in the atlas (6 frames at 10 fps) and is not played in battle, because the battle scene does not move the figure.
- A decided pronunciation source. The speech interface can take a future recording set. Do not drop in third-party audio without that decision.
- Tablet touch and an iPad app. This MVP does not target them.
- Approved replacements for the mastery threshold and the skill-card numbers above.

## Layout

- `src/domain` — cards, FSRS review, battle, skill slots, duel scoring, rewards, save shape
- `src/domain/data/forest-adventure.json` — the approved sample word list
- `src/game` — Phaser 3 client, placeholder atlas, provisional warrior v0.1, and scenes
- `public/assets/warrior/v0.1` — the 11 battle-view atlases, `manifest.json`, and `slots.json`
- `docs/art` — the pack README, slot table, and QA report. `style_ref_v0.1.png` is concept art and is not in the game
- `src/domain/*.test.ts` — review scheduling, card and badge tone, the 3-slot loadout, question pools, and lexicographic scoring

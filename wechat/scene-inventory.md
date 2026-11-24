# P0 scene and touch inventory

Recorded from `acecfe1c71a2cf93d958170c00297d8e8f2582dc`. Conclusions only. No scene was migrated.

The 18 scenes are the classes under `src/game/scenes/` registered in `src/main.ts`. `src/nineslice-probe.ts` is a probe, not one of them. The game is created at 1280×800 with `Phaser.Scale.FIT` and `CENTER_BOTH`. Input is keyboard and mouse. `touch` is false.

Direct calls inside the 18 scene files match the spec totals: `add.text` 218, `add.image` 44, `add.rectangle` 24, `add.container` 11, `add.graphics` 8, `add.zone` 6, `tweens.add` 8, `time.delayedCall` 7, `time.addEvent` 1, `textures.exists` 23, `textures.get` 8. Scene files themselves do not call `physics`, `cameras`, or particles. Two gaps sit outside those totals and are called out per scene below.

Shared, not per scene:

- DOM forms in `index.html`: `#name-form` (create), `#spell-form` (learn, battle, exam battle, review), `#pin-form` (profiles, guide), `#profile-import` (profiles). `paintShellDom` only swaps the pin note for web vs desktop.
- `src/game/ui.ts` `listenKeys` binds `keydown`. `backButton` is defined there and is not used by these scenes; scenes draw their own back control.
- `src/game/warm/kit.ts` `warmButton`, `warmPanel`, `warmChip`, `warmOption`, `warmTab`, `warmBar`, `warmTitlePlank`, and `warmSlice` are how most screens get buttons and panels. They use `add.nineslice`, `add.text`, `add.container`, `Phaser.Geom` hit areas, pointer over/down/up, and short scale tweens. Hover is a mouse state. Touch replacement for every one of these: pressed on touch start, release on touch end, no hover. Default button height is 56 design pixels.
- `src/game/audio.ts` unlocks WebAudio on canvas `pointerdown` and `window` `keydown`, pauses on `document.visibilitychange`, and synthesizes the UI blip with an Oscillator. There is no audio file in the web game. WeChat later uses a short file and the mini-program hide/show lifecycle. The skeleton plays one local clip from a touch; it does not port this module.
- `browserSpeaker` in `src/domain/speech.ts` calls `speechSynthesis`. WeChat has no browser TTS. Later phases play pre-generated clips. Call sites stay `speakWord(text, speaker)`.
- Saves go through `localStorage` (`lexiquest.save.v1`, `lexiquest.profile.v1.*`, `lexiquest.profiles.v1`, `lexiquest.parent-pin.v1`). `ExamBattleScene` also reads and writes `localStorage` itself. Storage compression is a later adapter decision, written in `wechat/P0.md`. Not implemented here.
- `document.fonts` is used by `BootScene`, `StageMapScene`, `LearnScene`, and `src/game/warm/theme.ts`. Font files are a later phase (`wx.loadFont` plus a system font fallback).
- Keyboard mapping used below, from the spec: Escape becomes a top-left back control; Space becomes a visible continue control or a tap on the existing mask; Enter becomes the primary button; digit and arrow navigation become taps on the rows plus vertical scrolling where the screen is a list. Naming, spelling, and the parent PIN keep the system input method. They do not become an on-canvas alphabet.
- Hit rule for later ports: every tappable control at least 44×44 logical pixels, neighboring controls at least 8px apart. Design-pixel sizes below are the 1280×800 coordinates. Anything already larger still has to be checked again after letterbox scale, the same way the skeleton does, so the on-screen logical size stays at least 44.

Known tight spot, not changed: result word chips are 170×80 with `pitchY` 86, so the vertical gap is 6px. A later layout pass separates them to at least 8px. Chip width and height already clear 44.

## BootScene (`boot`, 40 lines)

Direct: `load.atlas` actors, `load.image` logo. Also `queueWarm` and `queueChapterCosmetics`, which load more atlases and images. `keydown` capture is turned off so the page can use DOM fields. `document.fonts.load` waits for Noto Sans SC, ZCOOL KuaiLe, and Nunito, capped at 1.5s, then `ensureChapterPlan()` and `scene.start("profiles")`.

No player control. Touch replacement: none. Drop the keyboard-capture call. Fonts and the chapter `fetch` are the later loaders in `wechat/P0.md`.

## ProfilesScene (`profiles`, 313 lines)

Direct: `add.text` 7. Helpers: `warmButton` 4, `warmPanel` 2, `warmBackground`. DOM: `#profile-import` file input, and the full `#pin-form` (submit, forgot, cooldown, challenge). `Digit1`–`Digit6` choose a slot. `KeyN` creates a profile. Keys are ignored while an input is focused. A one-second timer refreshes the PIN cooldown.

Touch: each profile row is a button (the digits only duplicate it). New-profile is a button. Import later uses the mini-program file picker, not an `<input type="file">`. PIN entry is a native input over the canvas, same fields as today. Escape is not bound here.

## TitleScene (`title`, 107 lines)

Direct: `add.text` 2, `add.image` 1 (logo), `add.graphics` 1 (cream plate). Helpers: `warmButton` up to 3, `warmBackground`, `ClassSideSprite.play("idle")`. An `UPDATE` listener samples about 45 frames for a dev probe and then removes itself. `Enter` continues or starts. `KeyN` starts another profile when one exists.

Touch: the existing buttons (`继续冒险` / `开始冒险`, `新的冒险`, `换角色`) replace Enter and N. No DOM form. The FPS probe is dev-only and is not a touch control. Do not treat that probe as a frame-rate acceptance test.

## GradeScene (`grades`, 137 lines)

Direct: `add.text` 6, `add.image` 1, `add.rectangle` 1. Helpers: `warmButton` 4, `warmChip`, `warmPanel`, `warmBackground`. `Digit3`–`Digit6` toggle G3–G6. `Enter` confirms. `Escape` returns, except in `ask-parent`, where Escape returns and Enter opens the parent page. Those ask-parent keys duplicate two buttons.

Touch: the grade chips and the confirm / back / parent buttons replace the keys. No DOM form. Chips are 190 wide; height comes from `warmChip` and must stay at least 44 after scale.

## CreateScene (`create`, 235 lines)

Direct: `add.text` 12, `add.image` 2, `add.rectangle` 4, `add.container` 1, `add.zone` 1, `setInteractive` 3. Helpers: `paper`, `warmButton`, `warmPanel`, `paintRoom`. DOM: `#name-form` / `#hero-name` / `#name-error`. `Digit1`–`Digit6` pick a class. A window `keydown` listener also opens the inventor lock on `Digit5`. Class cards are already 196×220 zones. The lock veil and its button are pointer targets. The hint text still says to press 1–6 and Enter.

Touch: tap the class card (already present). The name stays a native input with the system IME, submitted by the form button, not by an on-canvas keyboard. The lock dialog stays a tap on its button. Drop the digit keys. The card zones clear 44×44; keep at least 8px between cards.

## OverworldScene (`overworld`, 257 lines)

Direct: `add.text` 8, `add.image` 1, `add.rectangle` 2, `add.container` 2, `tweens.add` 2, `Phaser.Geom` hit tests, `setInteractive` 3. Helpers: `warmButton`, `warmPanel`, `warmSlice`, `ClassTopSprite` walk/idle. `Digit1`–`Digit8` open the eight places in `PLACES`. Arrow keys tween the avatar by 80px. `Enter` collects a queued reward when one is open. Buildings are already pointer targets at 136×128.

Touch: tap the building (digits are duplicates). Enter on the reward becomes the reward button that already calls `takeReward`. Arrow nudges become a swipe on the village ground using the same clamped step. Places are not a scrolling list. Building boxes clear 44×44.

## LearnScene (`learn`, 803 lines)

Direct: `add.text` 20, `add.container` 1, `add.graphics` 1. Helpers: `warmButton` 14, `warmPanel` 6, `warmChip`, `warmOption`, `warmBar`, `warmTitlePlank` 3, `warmBackground`. DOM: `#spell-form` open/close, focus, and error text. `document.fonts.check` for Noto Sans SC. `speakWord` / `browserSpeaker`. `Escape` leaves a quiz, listen, or spell step back to the study card, otherwise returns to the village. `Enter` starts the meaning quiz or confirms settlement. `KeyL` listens. `KeyP` spells. Digits pick a choice.

Touch: the study actions, choices, and settlement button replace those keys. Spelling stays the native `#spell-form` equivalent (native input over the canvas, system IME). Pronunciation stays behind `speakWord` and later becomes a file. `warmOption` rows need at least 8px between them.

## StageMapScene (`stages`, 660 lines)

Direct: `add.text` 18, `add.image` 4, `add.rectangle` 3, `add.graphics` 1, `add.zone` 1, `tweens.add` 1, `textures.exists` 8, `textures.get` 1, `Phaser.Geom` 2, `setInteractive` 4. Helpers: `warmButton` 9, `warmPanel` 6, `warmSlice`, `warmChip`, `warmBar`, `warmTitlePlank`. `document.fonts.check`. `speakWord` on a looked-at word. `Escape` returns to the village. `[` and `]` change chapter. Digits select a stage and start the fight. Stage nodes and word cards are already `pointerup` targets. Word-card hits are 160×96.

Touch: tap the stage node and the chapter control. The bracket keys become those chapter controls, not a keyboard. Word-card tap stays, and still speaks through the speaker interface. Escape becomes the back button. Node spacing must be at least 8px where two nodes can both be tapped.

## BattleScene (`battle`, 1268 lines)

Direct: `add.text` 14, `add.image` 2, `add.rectangle` 2, `add.container` 4, `add.zone` 2, `tweens.add` 3, `time.delayedCall` 3, `textures.exists` 3, `setInteractive` 3. Helpers: `warmButton` 9, `warmPanel` 7, `warmSlice` 3, `warmOption`, `warmToast` 2, scene image/atlas loads, class and boss sprites (`anims`). DOM: `#spell-form` / `#spell-input`, including a guard that ignores keys while the form is open. `Escape` closes the skill-swap sheet or leaves. Skill-slot keys call `useSkill` (the click path already exists). Digits answer a choice or, in the choose phase, attack / block / heal. After the fight, any `pointerdown` or Space opens results.

Touch: skill cards, choices, and the three actions are the digit and slot keys. Escape becomes back, and the swap sheet closes from its existing control. Space becomes a visible continue control of at least 44×44; do not keep “tap anywhere” as the only target. Spelling stays a native input. Boss and class motion stay frame sequences in a later phase.

## ExamBattleScene (`exam-battle`, 675 lines)

Direct: `add.text` 16, `add.image` 4, `add.rectangle` 7, `add.container` 1, `add.zone` 1, `time.delayedCall` 2, `time.addEvent` 1 (an 8s hold lock), `textures.exists` 4, `setInteractive` 2. No keyboard listener. DOM: the same `#spell-form`. This scene also calls `localStorage` for the exam snapshot. The intro is a full-screen zone on `pointerup`. Answer rows are 56px tall rectangles with `pointerup`.

Touch: the intro needs a visible continue control of at least 44×44 (the full-screen zone can sit behind it, not instead of it). Answer rows already clear 44 in height; keep at least 8px between them. Spelling stays a native input. The `localStorage` snapshot moves to the later storage adapter with the other saves. No new combat rule.

## BattleResultsScene (`results`, 964 lines)

Direct: `add.text` 37, `add.image` 17, `add.rectangle` 2, `add.graphics` 3, one `nineslice`, `tweens.add` 2, `time.delayedCall` 2, `textures.exists` 5, `textures.get` 5, `setInteractive` 2. Helpers: `warmButton` 4, `warmPanel`, `warmSlice` 4, `ClassSideSprite.play`. Word chips are `pointerup` and call `speakWord`. Space finishes the intro motion. Digits are ignored. On a loss, Enter retries and Escape returns to the map. On a win, Enter or Escape continues. A dim layer is `pointerdown` to skip, with the label `点一下看全部`. Buttons stay hidden until `KEY_LOCK_MS`.

Touch: Space and the dim skip become the existing skip label, sized at least 44×44. Win/loss keys become the buttons already drawn after the lock. Chip taps stay and still speak through `speakWord`. Fix the 6px chip gap in that later layout pass. Do not change star or reward rules.

## CollectionScene (`collection`, 131 lines)

Direct: `add.text` 7, `add.image` 1. Helpers: `paper`, `warmButton` 3, `warmPanel` 2, `paintRoom`. `Escape` returns. `[` / `]` and arrow left/right turn the page. Page buttons already exist when there is more than one page. Cards are not tappable.

Touch: back and the page buttons replace the keys. No per-card hit target, so dense cards do not need a 44px hit box. No DOM form.

## ReviewScene (`review`, 362 lines)

Direct: `add.text` 12. Helpers: `paper`, `warmButton` 8, `warmPanel`, `warmSlice`, `paintRoom`. DOM: `#spell-form` submit, `#spell-give-up`, `#spell-replay`, plus `window.location.search` for the dev clock. `Escape` returns. Space reveals the front of the due card when the spelling form is closed. `Digit1`–`Digit4` are the four ratings (还没记住 / 有点难 / 记得 / 很熟). `KeyT` / `KeyY` / `KeyR` move a dev-only practice clock.

Touch: the four rating buttons and a reveal control replace Space and the digits. Spelling, give-up, and replay stay native controls on the same form. Do not add a touch path for the dev clock.

## SkillsScene (`skills`, 221 lines)

Direct: `add.text` 12, `add.image` 7, `add.rectangle` 3, `add.zone` 1, `textures.exists` 1, `textures.get` 1, `setInteractive` 3. Helpers: `paper`, `warmButton` 5, `warmPanel` 3, `warmSlice`, `warmToast`, `paintRoom`. `Escape` closes the lock dialog, else the class switcher, else returns to the village. Class choices are 170×250 zones. Equip rows are buttons.

Touch: those zones and buttons replace Escape’s three layers (back, close switcher, close lock). No DOM form. Zones clear 44×44.

## WardrobeScene (`wardrobe`, 355 lines)

Direct: `add.text` 14, `add.image` 4, `add.container` 2, `add.graphics` 2, `textures.exists` 1, `textures.get` 1, `Phaser.Geom` 2. Helpers: `paper`, `warmButton` 3, `warmSlice` 2, `ClassSideSprite.play("idle")`. `Escape` returns. The list scrolls with the mouse wheel and with pointer drag. `ClassSideSprite` uses anims.

Touch: Escape becomes the back button. Wheel and drag become a vertical swipe on the list. Row hit targets must be at least 44 tall with at least 8px between rows. No DOM form.

## EndingScene (`ending`, 88 lines)

Direct: `add.text` 8, `textures.exists` 1. Helpers: `paper` or `warmBackground`, `warmPanel`, `warmButton`, `ClassSideSprite.play("victory")`, equipped title. `Escape` and `Enter` both return to the village. The button `回村子` does the same.

Touch: that one button replaces both keys. No DOM form.

## DuelScene (`duel`, 128 lines)

Direct: `add.text` 8. Helpers: `paper`, `warmButton` 2, `warmPanel` 2, `warmOption`, `paintRoom`. `Escape` returns. `Enter` leaves the cover step. Digits pick a choice. Options are laid out every 80px.

Touch: `我准备好了` replaces Enter. Choice rows replace digits. Escape becomes back. Keep at least 8px between option rows. No DOM form. Passing the device between two players stays the same rule; only the cover text’s “电脑” wording is a later `host-copy` concern, not a rule change.

## GuideScene (`guide`, 462 lines)

Direct: `add.text` 17. Helpers: `warmButton` 11, `warmPanel` 2, `warmChip` 2, `warmTab` 2, `warmBackground`. This is the resize exception: it listens to `Phaser.Scale` resize and moves `#pin-form` with `pinFormPlacement`. `Escape` returns to the village. `KeyY` confirms clearing the save only when the parent gate is unlocked, the confirm step is open, and the notes tab is showing. The confirm button is the real control. DOM is the full PIN form. A one-second timer updates the cooldown. Copy comes from `shellCopy(isDesktopShell())`.

Touch: back replaces Escape. The visible confirm replaces `KeyY` (do not keep a key-only confirm). Grade chips, goal choices, and tabs are already taps. The PIN form is a native input stack positioned with the same letterbox and safe area as the canvas, including on rotate. The web/desktop copy split stays until the third branch in `wechat/P0.md` exists.

## Helper gaps the scene-file totals hide

`add.nineslice` appears once in a scene file (`BattleResultsScene`) and on every `warmSlice` / `warmButton` / `warmPanel` path. A later renderer that only implements `text` / `image` / `rectangle` / `container` / `graphics` / `zone` cannot draw the current buttons or panels.

`scene.anims` is not referenced in the 18 scene files. It is created by the class, boss, cosmetic, exam-boss, and projectile helpers those scenes construct. `sprite.play(...)` in Title, Overworld, Battle, Results, Wardrobe, and Ending is that helper. Frame sequences have to be played later, or those actors freeze on one frame.

`load.atlas` / `load.image` in scene files are only the two calls in `BootScene`. Every other atlas is loaded from `src/game/warm/load.ts`, `src/game/chapter-scene-load.ts`, and the art loaders. `GuideScene` is the only scene that subscribes to `Phaser.Scale` resize, and it does that to keep the DOM pin form on the fitted canvas.

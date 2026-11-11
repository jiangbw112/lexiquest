import Phaser from "phaser";
import {
  answerQuestion,
  startBattle,
  takeAction,
  CHAPTER_BOSS_ID,
  type BattleState,
} from "../../domain/battle";
import { buildResultsView, starsFor } from "../../domain/battle-results";
import { applyBattleOutcome, noteBattleAnswer, studyNow } from "../../domain/progress";
import { checkSpelling } from "../../domain/questions";
import { battleControlOpen, skillCardFace, skillCardInput, skillSlotIndexForKey } from "../../domain/skill-card-face";
import { showSpellingHint, spellingInstruction } from "../spelling-form";
import { badgeTone, isDue } from "../../domain/review";
import { orderReviewWords } from "../../domain/skill-cast";
import { battleWordIds, bossReady, stageById, stageCombat, stageStatuses } from "../../domain/stages";
import { BOSS_BATTLE_POS, bossReactionMs, canopyPoses, type BossAnim } from "../art/boss-pack";
import { BossSprite, queueBossAtlases, reportBossLoad } from "../art/boss-sprite";
import { battlePoses, type WarriorAnim } from "../art/warrior-pack";
import { queueChapterCosmetics } from "../art/chapter-cosmetics";
import { drawEquippedTitle } from "../art/title-bar";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { redirectUngraded } from "../grade-route";
import { ATTACK_HINT_TOAST, cjkWrap } from "../layout";
import { recordPlayAnswer } from "../play-timer";
import { probeEnter, probeNote, probeQuestion } from "../probe";
import { getSave, mutate } from "../session";
import { listenKeys } from "../ui";
import { warmButton, warmOption, warmPanel, warmSlice, warmToast } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { placeSkillCard } from "../warm/skill-card";
import { FONT_BODY, INK, MUTED } from "../warm/theme";

interface BattleLaunch {
  stageId?: number;
}

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private reported = false;
  private poses: WarriorAnim[] = ["idle"];
  private bossPoses: BossAnim[] = ["idle"];
  private bossReported = false;
  private clearedChapter = false;
  private launch: BattleLaunch = {};
  private bossFight = false;
  private monsterHit = false;
  private resolving = false;
  private monsterTimer?: Phaser.Time.TimerEvent;
  private openingDue: string[] = [];
  private toastedHints = 0;
  private presenting = false;
  private resultsOpened = false;
  private battleHero?: Phaser.GameObjects.Container;
  private battleTitle: Phaser.GameObjects.GameObject[] = [];
  private battleHud: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super("battle");
  }

  init(data: BattleLaunch = {}): void {
    this.launch = data ?? {};
    this.bossFight = stageById(this.launch.stageId ?? 0)?.type === "boss";
  }

  preload(): void {
    queueWarriorAtlases(this);
    queueChapterCosmetics(this);
    queueWarm(this, ["atlas_ui_core", "atlas_battle", "atlas_skills", "atlas_monsters", "atlas_ui_pages", "atlas_results"], ["bg_forest"]);
    if (this.bossFight) queueBossAtlases(this);
  }

  create(): void {
    const save = getSave();
    const stage = stageById(this.launch.stageId ?? 0);
    if (save && redirectUngraded(this, save)) return;
    if (!save || !stage) {
      this.scene.start("stages");
      return;
    }
    const status = stageStatuses(save)[stage.id - 1];
    if (status === "locked" || (stage.type === "boss" && !bossReady(save) && !save.chapterCleared)) {
      this.scene.start("stages");
      return;
    }
    probeEnter("battle");
    this.reported = false;
    this.bossReported = false;
    this.bossPoses = ["idle"];
    this.monsterHit = false;
    this.resolving = false;
    this.clearedChapter = false;
    this.presenting = false;
    this.resultsOpened = false;
    const form = document.getElementById("spell-form");
    const submit = (event: Event) => {
      event.preventDefault();
      this.submitSpelling();
    };
    form?.addEventListener("submit", submit);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      form?.classList.remove("open");
      this.monsterTimer?.remove(false);
    });
    this.begin(stage.id);
    listenKeys(this, (event) => this.onKey(event));
  }

  private begin(stageId: number): void {
    const save = getSave();
    const stage = stageById(stageId);
    if (!save || !stage) return;
    const now = studyNow(save);
    const dueWordIds = Object.values(save.memory).filter((memory) => isDue(memory, now)).map((memory) => memory.wordId);
    const litWordIds = Object.keys(save.wordCards).filter(
      (id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright",
    );
    const combat = stageCombat(stage, save.player.classId);
    this.openingDue = dueWordIds;
    this.toastedHints = 0;
    const padOrder = orderReviewWords(
      Object.values(save.memory)
        .filter((memory) => save.wordCards[memory.wordId])
        .map((memory) => ({ id: memory.wordId, due: Date.parse(memory.fsrs.due) })),
      Date.now() % 100000,
    );
    this.state = startBattle({
      encounterId: combat.encounterId,
      classId: save.player.classId,
      learnedIds: Object.keys(save.wordCards),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: Date.now() % 100000,
      dueWordIds,
      allowedWordIds: battleWordIds(save),
      enemy: {
        name: combat.enemyName,
        maxHp: combat.enemyHp,
        attack: combat.enemyAttack,
        sprite: combat.sprite,
      },
      phases: combat.phases,
      spellingCap: combat.spellingCap,
      litWordIds,
      padOrder,
    });
    this.poses = ["idle"];
    this.bossPoses = ["idle"];
    this.monsterHit = false;
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    if (this.presenting || this.scene.isPaused()) return;
    if (event.code === "Escape") {
      this.leave();
      return;
    }
    if (!this.state || this.resolving || document.getElementById("spell-form")?.classList.contains("open")) return;
    const slotIndex = skillSlotIndexForKey(event.code);
    if (slotIndex !== null) {
      this.useSkill(slotIndex, "key");
      return;
    }
    if (this.state.phase === "question" && this.state.question && this.state.question.kind !== "spelling") {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const choice = this.state.question.choices[index];
      if (choice) this.choose(choice.id);
      return;
    }
    if (this.state.phase !== "choose") return;
    if (event.code === "Digit1") this.act({ type: "attack" });
    if (event.code === "Digit2") this.act({ type: "block" });
    if (event.code === "Digit3") this.act({ type: "heal" });
  }

  private useSkill(slotIndex: number, via: "click" | "key"): void {
    const slot = this.state.slots[slotIndex];
    if (!slot) return;
    const face = skillCardFace({
      phase: this.state.phase,
      energy: this.state.energy,
      energyCost: slot.energyCost,
      resolving: this.resolving,
    });
    const result = skillCardInput(face, via);
    if (result === "ignore") return;
    this.act({ type: "skill", slotIndex });
    if (result === "low-energy") warmToast(this, "能量不够");
  }

  private choose(choiceId: string): void {
    const question = this.state.question;
    if (question) {
      const correct = question.kind === "spelling"
        ? checkSpelling(question.answer, choiceId)
        : choiceId === question.answerId;
      mutate((save) => noteBattleAnswer(save, {
        wordId: question.wordId,
        correct,
        now: studyNow(save),
        dueAtStart: this.openingDue,
        spelling: question.kind === "spelling",
      }));
      recordPlayAnswer();
    }
    const before = this.state;
    this.state = answerQuestion(this.state, choiceId);
    this.poses = battlePoses({
      action: "answer",
      playerHpBefore: before.playerHp,
      playerHpAfter: this.state.playerHp,
      phase: this.state.phase,
    });
    this.syncBoss(before);
    this.holdResolution(before);
    this.finishIfNeeded();
    this.draw();
  }

  private submitSpelling(): void {
    if (!this.state?.question || this.state.question.kind !== "spelling") return;
    const input = document.getElementById("spell-input");
    const typed = input instanceof HTMLInputElement ? input.value : "";
    const correct = checkSpelling(this.state.question.answer, typed);
    if (input instanceof HTMLInputElement) input.value = "";
    this.choose(correct ? this.state.question.answer : "miss");
  }

  private act(action: { type: "attack" | "block" | "heal" | "skill"; slotIndex?: number }): void {
    const before = this.state;
    const result = takeAction(this.state, action);
    if (!result.ok) {
      this.state = { ...this.state, lastNote: result.reason ?? "现在不能这么做。" };
      this.poses = ["idle"];
      this.bossPoses = ["idle"];
      this.draw();
      return;
    }
    this.state = result.state;
    this.poses = battlePoses({
      action: action.type,
      playerHpBefore: before.playerHp,
      playerHpAfter: this.state.playerHp,
      phase: this.state.phase,
    });
    this.syncBoss(before);
    this.holdResolution(before);
    this.finishIfNeeded();
    this.draw();
  }

  /**
   * Domain resolution is synchronous. The visible enemy window is the hit flash
   * (200ms) or the boss hit/attack clips. Cards stay disabled until that clip ends.
   * A turn that does not move the enemy, and a finished battle, do not add a second window.
   */
  private holdResolution(before: BattleState): void {
    const enemyMoved =
      this.state.phase !== "won" &&
      this.state.phase !== "lost" &&
      (this.state.enemyHits > before.enemyHits ||
        this.state.enemyHp < before.enemyHp ||
        this.state.phaseIndex > before.phaseIndex);
    const ms = enemyMoved ? (this.bossFight ? bossReactionMs(this.bossPoses) : 200) : 0;
    this.monsterHit = !this.bossFight && this.state.enemyHp < before.enemyHp;
    this.resolving = ms > 0;
    this.monsterTimer?.remove(false);
    const ready = () => {
      if (this.state.phase === "choose") probeNote("battle:ready");
    };
    if (ms <= 0) {
      ready();
      return;
    }
    this.monsterTimer = this.time.delayedCall(ms, () => {
      this.monsterHit = false;
      this.resolving = false;
      if (!this.scene.isActive()) return;
      ready();
      this.draw();
    });
  }

  private syncBoss(before: BattleState): void {
    if (this.state.phase === "question") {
      this.bossPoses = ["idle"];
      return;
    }
    this.bossPoses = canopyPoses({
      enemyHpBefore: before.enemyHp,
      enemyHpAfter: this.state.enemyHp,
      phaseIndexBefore: before.phaseIndex,
      phaseIndexAfter: this.state.phaseIndex,
      enemyHitsBefore: before.enemyHits,
      enemyHitsAfter: this.state.enemyHits,
      phase: this.state.phase,
    });
  }

  private finishIfNeeded(): void {
    if (this.reported) return;
    if (this.state.phase !== "won" && this.state.phase !== "lost") return;
    this.reported = true;
    this.presenting = true;
    const before = getSave();
    if (!before) return;
    const won = this.state.phase === "won";
    const answers = this.state.answers ?? [];
    const correct = answers.filter((answer) => answer.correct).length;
    const stars = starsFor(correct, answers.length, won);
    const stageId = this.launch.stageId ?? 0;
    const now = studyNow(before).getTime();
    mutate((save) => applyBattleOutcome(
      save,
      won ? "win" : "loss",
      now,
      this.state.encounterId,
      stars ?? undefined,
      stageId,
    ));
    const after = getSave();
    if (!after) return;
    this.clearedChapter = won && !before.chapterCleared && after.chapterCleared;
    const view = buildResultsView({
      before,
      after,
      answers,
      stageId,
      boss: this.bossFight,
      now,
    });
    const delay = won && this.bossFight ? 750 : 500;
    this.time.delayedCall(delay, () => this.openResults(view));
    this.input.once("pointerdown", () => this.openResults(view));
    this.input.keyboard?.once("keydown-SPACE", () => this.openResults(view));
  }

  private openResults(view: ReturnType<typeof buildResultsView>): void {
    if (this.resultsOpened || !this.scene.isActive()) return;
    this.resultsOpened = true;
    this.concealBattleActors();
    this.scene.pause();
    this.scene.launch("battle-results", view);
  }

  /** The results hero replaces this one. Hide the battle body, title, bars, and log before the overlay opens. */
  private concealBattleActors(): void {
    this.battleHero?.setVisible(false);
    for (const node of [...this.battleTitle, ...this.battleHud]) {
      (node as { setVisible?: (shown: boolean) => void }).setVisible?.(false);
    }
  }

  private leave(): void {
    this.scene.start(this.clearedChapter ? "ending" : "stages", { fromBattleEnd: this.reported });
  }

  private hpBar(x: number, y: number, ratio: number, fill: "hp_fill_teal" | "hp_fill_coral"): void {
    const width = 270;
    warmSlice(this, "atlas_battle", "hp_frame", width, 24).setPosition(x, y);
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped <= 0) return;
    const inner = Math.max(16, (width - 24) * clamped);
    warmSlice(this, "atlas_battle", fill, inner, 16).setPosition(x - width / 2 + 12 + inner / 2, y);
  }

  private drawMonster(): void {
    if (this.state.encounterId === CHAPTER_BOSS_ID && this.state.enemySprite === "canopy") {
      if (!this.bossReported) {
        reportBossLoad(this);
        this.bossReported = true;
      }
      const boss = new BossSprite(this, BOSS_BATTLE_POS.x, BOSS_BATTLE_POS.y);
      boss.playSequence(this.bossPoses);
      return;
    }
    const kind = this.state.enemySprite === "page" ? "page" : this.state.enemySprite === "inkling" ? "inkling" : null;
    if (!kind) return;
    const frame = `monster_${kind}_${this.monsterHit ? "hit" : "idle"}`;
    const monster = this.add.image(980, 520, "atlas_monsters", frame);
    monster.setOrigin(0.5, 0.977);
    monster.setScale(0.45);
  }

  private flash(target: Phaser.GameObjects.Container): void {
    this.tweens.add({ targets: target, alpha: 0.55, duration: 450, yoyo: true, repeat: -1 });
  }

  private draw(): void {
    if (!this.state) return;
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    if (this.state.question?.kind !== "spelling") {
      document.getElementById("spell-form")?.classList.remove("open");
      showSpellingHint(null);
    }
    warmBackground(this, "bg_forest");
    const hero = new WarriorSprite(this, 300, 520, 0.72, save.equippedCosmeticIds, save.equippedOutfitId);
    this.battleHero = hero.root;
    const titleAt = this.children.length;
    drawEquippedTitle(this, 300, 250, save.equippedTitleId);
    this.battleTitle = this.children.list.slice(titleAt);
    hero.playSequence(this.poses);
    this.drawMonster();
    const hudAt = this.children.length;
    warmPanel(this, 350, 92, 400, 104);
    warmPanel(this, 930, 92, 400, 104);
    this.add.text(170, 62, save.player.name, { fontFamily: FONT_BODY, fontSize: "22px", fontStyle: "700", color: INK }).setOrigin(0, 0.5);
    const phaseCount = this.state.phases?.length ?? 1;
    const phaseLabel = phaseCount > 1 ? `  阶段 ${this.state.phaseIndex + 1}/${phaseCount}` : "";
    this.add.text(750, 62, `${this.state.enemyName}${phaseLabel}`, {
      fontFamily: FONT_BODY,
      fontSize: "22px",
      fontStyle: "700",
      color: INK,
    }).setOrigin(0, 0.5);
    if (this.state.shaken && this.state.phases) {
      const shakenCopy = this.state.phaseIndex === 0
        ? "林心守护者动摇了！答对并出手攻击，就能突破！"
        : "林心守护者动摇了！答对并出手攻击，就能赢！";
      this.add.text(750, 148, shakenCopy, {
        fontFamily: FONT_BODY,
        fontSize: "16px",
        color: INK,
        wordWrap: cjkWrap(360),
      }).setOrigin(0, 0);
    }
    this.hpBar(305, 104, this.state.playerHp / this.state.playerMaxHp, "hp_fill_teal");
    this.hpBar(885, 104, this.state.enemyHp / this.state.enemyMaxHp, "hp_fill_coral");
    const pips = Math.min(6, this.state.maxEnergy);
    for (let i = 0; i < pips; i += 1) {
      const on = i < this.state.energy;
      this.add.image(226 + i * 24, 128, "atlas_battle", on ? "energy_pip_on" : "energy_pip_off").setScale(0.5);
    }
    warmPanel(this, 490, 182, 680, 52);
    this.add.text(170, 182, this.state.lastNote, {
      fontFamily: FONT_BODY,
      fontSize: "18px",
      color: INK,
      wordWrap: cjkWrap(640),
    }).setOrigin(0, 0.5);
    probeNote(`battle:${this.state.phase}:phase${this.state.phaseIndex + 1}`);
    if (battleControlOpen(this.state.phase, "action", this.resolving)) warmPanel(this, 640, 686, 1056, 204, "panel_wood");
    else {
      // Swallow hover and clicks on the old action row. Only later answers or the leave button stay open.
      const blocker = this.add.zone(640, 686, 1200, 240);
      blocker.setInteractive();
      if (blocker.input) blocker.input.cursor = "default";
    }
    const cards = this.state.slots.map((slot) => ({
      slot,
      card: placeSkillCard(
        this,
        slot,
        this.state.phase,
        this.state.energy,
        () => this.useSkill(slot.index, "click"),
        () => this.useSkill(slot.index, "click"),
        this.resolving,
      ),
    }));
    if (battleControlOpen(this.state.phase, "answer", this.resolving) && this.state.question) {
      warmPanel(this, 640, 696, 1100, 172);
      if (this.state.question.kind === "spelling") {
        probeQuestion(this.state.question.wordId, []);
        this.add.text(180, 640, this.state.question.prompt, { fontFamily: FONT_BODY, fontSize: "24px", fontStyle: "700", color: INK });
        this.add.text(180, 700, spellingInstruction(this.state.question.answer), {
          fontFamily: FONT_BODY,
          fontSize: "18px",
          color: MUTED,
          wordWrap: cjkWrap(640),
        });
        document.getElementById("spell-form")?.classList.add("open");
        showSpellingHint(this.state.question.answer);
        const input = document.getElementById("spell-input");
        if (input instanceof HTMLInputElement) window.setTimeout(() => input.focus(), 30);
        return;
      }
      probeQuestion(this.state.question.answerId, this.state.question.choices.map((choice) => choice.id));
      this.add.text(180, 640, this.state.question.prompt, { fontFamily: FONT_BODY, fontSize: "24px", fontStyle: "700", color: INK });
      this.state.question.choices.forEach((choice, index) => {
        warmOption(this, 280 + index * 280, 738, index, choice.id, choice.label, () => this.choose(choice.id), 250);
      });
      return;
    }
    const choosing = this.state.phase === "choose";
    if (battleControlOpen(this.state.phase, "action", this.resolving) || (choosing && this.resolving)) {
      if (!battleControlOpen(this.state.phase, "action", this.resolving)) {
        warmPanel(this, 640, 686, 1056, 204, "panel_wood");
      }
      const locked = this.resolving;
      const attack = warmButton(this, 200, 680, "1 攻击", () => this.act({ type: "attack" }), { width: 148, tone: "coral", disabled: locked });
      warmButton(this, 360, 680, "2 格挡", () => this.act({ type: "block" }), { width: 148, tone: "sky", disabled: locked });
      warmButton(this, 520, 680, "3 治疗", () => this.act({ type: "heal" }), { width: 148, tone: "teal", disabled: locked });
      if (this.state.supportStreak >= 2) {
        this.add.text(360, 718, "效果减弱", { fontFamily: FONT_BODY, fontSize: "14px", color: MUTED }).setOrigin(0.5);
        this.add.text(520, 718, "效果减弱", { fontFamily: FONT_BODY, fontSize: "14px", color: MUTED }).setOrigin(0.5);
      }
      if (locked) {
        const blocker = this.add.zone(640, 686, 1200, 240);
        blocker.setInteractive();
        if (blocker.input) blocker.input.cursor = "default";
      } else if (this.state.attackHint) {
        this.flash(attack);
        for (const { slot, card } of cards) {
          const face = skillCardFace({
            phase: this.state.phase,
            energy: this.state.energy,
            energyCost: slot.energyCost,
            resolving: false,
          });
          if (face === "ready" && (slot.kind === "damage" || slot.kind === "strike-guard")) this.flash(card);
        }
        if (this.state.attackHintShown <= 2 && this.toastedHints < this.state.attackHintShown) {
          this.toastedHints = this.state.attackHintShown;
          const toast = warmToast(this, "效果变弱了，试试攻击吧！").setPosition(ATTACK_HINT_TOAST.x, ATTACK_HINT_TOAST.y);
          const bounds = toast.getBounds();
          probeNote(`toast:bounds:${Math.round(bounds.x)},${Math.round(bounds.y)},${Math.round(bounds.width)},${Math.round(bounds.height)}`);
        }
      }
    }
    if (!this.presenting && battleControlOpen(this.state.phase, "leave", this.resolving)) {
      const label = this.clearedChapter ? "看结局" : this.state.phase === "lost" ? "再试一次 Esc" : "回关卡 Esc";
      warmButton(this, 640, 680, label, () => this.leave(), { width: 240 });
    }
    this.battleHud = this.children.list.slice(hudAt);
  }
}

import Phaser from "phaser";
import {
  answerQuestion,
  startBattle,
  takeAction,
  type BattleState,
} from "../../domain/battle";
import { buildResultsView, starsFor } from "../../domain/battle-results";
import { applyBattleOutcome, noteBattleAnswer, studyNow } from "../../domain/progress";
import { checkSpelling } from "../../domain/questions";
import { battleControlOpen, skillCardFace, skillCardInput, skillSlotIndexForKey } from "../../domain/skill-card-face";
import { showSpellingHint, spellingInstruction } from "../spelling-form";
import { badgeTone, isDue } from "../../domain/review";
import { orderReviewWords } from "../../domain/skill-cast";
import { battleWordIds, findPlayChapter, playStatuses, stageCombatFor, unlockedWordIds } from "../../domain/chapter-plan";
import { chapterBackdrop, type ChapterBackdrop } from "../../domain/chapter-scenes";
import { classById } from "../../domain/classes";
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
import { paintSceneImage, queueMissingForestBattle, queueSceneImage } from "../chapter-scene-load";
import { queueWarm, warmBackground } from "../warm/load";
import { placeSkillCard } from "../warm/skill-card";
import { FONT_BODY, INK, MUTED, motionOff } from "../warm/theme";
import {
  spawnFloater,
  activeFloaterCount,
  floaterStackOffset,
  emptyFloaterState,
  pushFloater,
  pruneFloaters,
  FLOATER_LAYER_NAME,
  keptAcrossDraw,
  type FloaterState,
} from "../battle-floater";
import {
  HP_BAR_TWEEN_MS,
  hpAtMotionStart,
  hpForHandoff,
  takeHpStep,
  applyHpStep,
  type HpReadout,
  type HpStep,
} from "../battle-hp";
import { noteForHandoff, planBattleNote, type BattleNotePlan } from "../battle-note";
import {
  actionTriggersLunge,
  attackReach,
  battleMotionBeats,
  performApproach,
  performLunge,
  performReturn,
  stepTargetX,
  PLAYER_BATTLE_X,
  MONSTER_BATTLE_X,
  PROJECTILE_MS,
  RANGED_RETURN_MS,
  RANGED_STEP_MS,
  type MotionBeat,
} from "../battle-lunge";
import { attachBattleShot, type BattleShotHandle } from "../battle-shot";
import { destroyDrawn } from "../destroy-drawn";

interface BattleLaunch {
  stageId?: number;
  chapterId?: string;
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
  private lunging = false;
  private playerFloaters: FloaterState = emptyFloaterState();
  private enemyFloaters: FloaterState = emptyFloaterState();
  private floaterLayer?: Phaser.GameObjects.Container;
  private battleEnemy?: Phaser.GameObjects.Container;
  private shot: BattleShotHandle | null = null;
  private shownFrom = { playerHp: 0, enemyHp: 0 };
  private displayHp: HpReadout = { playerHp: 0, enemyHp: 0 };
  private displayNote = "";
  private notePlan: BattleNotePlan = { feedback: "", action: "", counter: "" };
  private actionRevealed = false;
  private counterRevealed = false;
  private noteText?: Phaser.GameObjects.Text;
  private hpSteps: HpStep[] = [];
  private playerHpFill?: Phaser.GameObjects.NineSlice;
  private enemyHpFill?: Phaser.GameObjects.NineSlice;
  private playerHpTween?: Phaser.Tweens.Tween;
  private enemyHpTween?: Phaser.Tweens.Tween;
  private pendingResults: ReturnType<typeof buildResultsView> | null = null;
  private resultsArmed = false;
  private battleBackdrop: ChapterBackdrop = chapterBackdrop("forest_adventure");
  private forestBattleQueued = false;
  private forestBattleFailed = false;

  constructor() {
    super("battle");
  }

  init(data: BattleLaunch = {}): void {
    this.launch = data ?? {};
    const save = getSave();
    const chapter = save ? findPlayChapter(save, data.chapterId) : null;
    const stage = chapter?.stages.find((item) => item.id === (data.stageId ?? 0));
    this.bossFight = stage?.type === "boss";
    this.battleBackdrop = chapterBackdrop(chapter?.id ?? "forest_adventure");
  }

  preload(): void {
    queueWarriorAtlases(this);
    queueChapterCosmetics(this);
    const atlases = ["atlas_ui_core", "atlas_battle", "atlas_skills", "atlas_monsters", "atlas_ui_pages", "atlas_results"] as const;
    if (this.battleBackdrop.groupId === "forest") queueWarm(this, atlases, ["bg_forest"]);
    else {
      queueWarm(this, atlases, []);
      queueSceneImage(this, this.battleBackdrop.battleKey, this.battleBackdrop.battleUrl);
    }
    if (this.bossFight) queueBossAtlases(this);
  }

  create(): void {
    const save = getSave();
    const chapter = save ? findPlayChapter(save, this.launch.chapterId) : null;
    const stage = chapter?.stages.find((item) => item.id === (this.launch.stageId ?? 0));
    if (save && redirectUngraded(this, save)) return;
    if (!save || !chapter || !stage) {
      this.scene.start("stages");
      return;
    }
    const status = playStatuses(save, chapter)[stage.id - 1];
    if (status === "locked") {
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
    this.pendingResults = null;
    this.resultsArmed = false;
    this.lunging = false;
    this.resetFloaterState();
    this.shot = null;
    if (import.meta.env.DEV) {
      this.shot = attachBattleShot(this, () => this.shotRead(), {
        act: (type) => this.act({ type }),
        answer: (correct) => this.answerForShot(correct),
      });
    }
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
    this.begin(chapter, stage);
    listenKeys(this, (event) => this.onKey(event));
  }

  private begin(chapter: ReturnType<typeof findPlayChapter>, stage: ReturnType<typeof findPlayChapter>["stages"][number]): void {
    const save = getSave();
    if (!save) return;
    const now = studyNow(save);
    const dueWordIds = Object.values(save.memory).filter((memory) => isDue(memory, now)).map((memory) => memory.wordId);
    const litWordIds = Object.keys(save.wordCards).filter(
      (id) => badgeTone(save.wordCards[id], save.memory[id], now) === "bright",
    );
    const combat = stageCombatFor(chapter, stage, save.player.classId);
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
      distractorIds: unlockedWordIds(save),
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
    this.displayHp = { playerHp: this.state.playerHp, enemyHp: this.state.enemyHp };
    this.displayNote = this.state.lastNote;
    this.hpSteps = [];
    this.poses = ["idle"];
    this.bossPoses = ["idle"];
    this.monsterHit = false;
    this.lunging = false;
    this.resetFloaterState();
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    if (this.presenting || this.scene.isPaused()) return;
    if (event.code === "Escape") {
      this.leave();
      return;
    }
    if (!this.state || this.resolving || this.lunging || document.getElementById("spell-form")?.classList.contains("open")) return;
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
    if (this.lunging) return;
    const slot = this.state.slots[slotIndex];
    if (!slot) return;
    const face = skillCardFace({
      phase: this.state.phase,
      energy: this.state.energy,
      energyCost: slot.energyCost,
      resolving: this.resolving || this.lunging,
    });
    const result = skillCardInput(face, via);
    if (result === "ignore") return;
    this.act({ type: "skill", slotIndex });
    if (result === "low-energy") warmToast(this, "能量不够");
  }

  private choose(choiceId: string): void {
    if (this.lunging) return;
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

    const deltas = this.state.turnDeltas ?? [];
    const enemyAmount = deltas.filter((delta) => delta.target === "enemy").reduce((sum, delta) => sum + delta.amount, 0);
    const playerEffect = deltas.filter((delta) => delta.target === "player" && delta.amount > 0).reduce((sum, delta) => sum + delta.amount, 0);
    const playerHit = deltas.filter((delta) => delta.target === "player" && delta.amount < 0).reduce((sum, delta) => sum + delta.amount, 0);
    const pendingSlot = before.pendingSlot !== null ? before.slots[before.pendingSlot] : null;
    const skillKind = pendingSlot?.kind;
    const actionType = before.pendingBasic ?? (pendingSlot ? "skill" : undefined);
    const shouldLungePlayer = Boolean(actionType && actionTriggersLunge(actionType, skillKind) && enemyAmount < 0);
    const shouldLungeEnemy = playerHit < 0 && this.state.phase !== "won";
    const reach = attackReach(this.state.classId, shouldLungePlayer);

    this.poses = battlePoses({
      action: "answer",
      playerHpBefore: before.playerHp,
      playerHpAfter: this.state.playerHp,
      phase: this.state.phase,
    });
    this.syncBoss(before);
    this.shownFrom = { playerHp: before.playerHp, enemyHp: before.enemyHp };
    const beats = battleMotionBeats({
      playerLunge: reach === "melee",
      playerReach: reach,
      enemyLunge: shouldLungeEnemy,
      enemyAmount,
      playerEffect,
      playerHit,
    });
    this.playMotion(beats, before);
  }

  private answerForShot(correct: boolean): void {
    const question = this.state?.question;
    if (!question || this.state.phase !== "question") return;
    if (question.kind === "spelling") {
      this.choose(correct ? question.answer : "miss");
      return;
    }
    const wrong = question.choices.find((choice) => choice.id !== question.answerId)?.id ?? "miss";
    this.choose(correct ? question.answerId : wrong);
  }

  private submitSpelling(): void {
    if (!this.state?.question || this.state.question.kind !== "spelling") return;
    const input = document.getElementById("spell-input");
    const typed = input instanceof HTMLInputElement ? input.value : "";
    const correct = checkSpelling(this.state.question.answer, typed);
    if (input instanceof HTMLInputElement) input.value = "";
    this.choose(correct ? this.state.question.answer : "miss");
  }

  private resetFloaterState(): void {
    this.playerFloaters = emptyFloaterState();
    this.enemyFloaters = emptyFloaterState();
    this.floaterLayer?.removeAll(true);
  }

  private shotRead(): {
    playerHp: number;
    enemyHp: number;
    displayPlayerHp: number;
    displayEnemyHp: number;
    playerHpBefore: number;
    enemyHpBefore: number;
    playerX: number;
    enemyX: number;
    floaters: string[];
    lunging: boolean;
    phase: string;
    deltas: { target: "player" | "enemy"; amount: number }[];
    displayNote: string;
  } {
    return {
      playerHp: this.state?.playerHp ?? 0,
      enemyHp: this.state?.enemyHp ?? 0,
      displayPlayerHp: this.displayHp.playerHp,
      displayEnemyHp: this.displayHp.enemyHp,
      playerHpBefore: this.shownFrom.playerHp,
      enemyHpBefore: this.shownFrom.enemyHp,
      playerX: this.battleHero?.x ?? PLAYER_BATTLE_X,
      enemyX: this.battleEnemy?.x ?? (this.bossFight ? BOSS_BATTLE_POS.x : MONSTER_BATTLE_X),
      floaters: this.floaterLabels(),
      lunging: this.lunging,
      phase: this.state?.phase ?? "",
      deltas: this.state?.turnDeltas ?? [],
      displayNote: this.displayNote,
    };
  }

  private floaterLabels(): string[] {
    const layer = this.floaterLayer;
    if (!layer) return [];
    return layer.list.flatMap((child) => {
      if (!("text" in child)) return [];
      const text = (child as { text?: string }).text;
      return text ? [text] : [];
    });
  }

  private playMotion(beats: readonly MotionBeat[], before: BattleState): void {
    this.lunging = beats.some((beat) => beat.kind === "lunge" || beat.kind === "step" || beat.kind === "projectile" || beat.kind === "return");
    this.displayHp = hpAtMotionStart({ playerHp: before.playerHp, enemyHp: before.enemyHp });
    this.hpSteps = [...(this.state.turnDeltas ?? [])];
    this.notePlan = planBattleNote(this.state.lastNote);
    this.displayNote = this.notePlan.feedback;
    this.actionRevealed = false;
    this.counterRevealed = false;
    this.holdResolution(before);
    if (this.lunging) this.monsterHit = false;
    this.finishIfNeeded();
    this.draw();
    this.playBeats(beats, 0);
  }

  private playBeats(beats: readonly MotionBeat[], index: number): void {
    if (index === 0) this.revealReadyNotes(beats);
    const beat = beats[index];
    if (!beat) {
      this.endMotion();
      return;
    }
    if (beat.kind === "lunge") {
      const hit = beats[index + 1];
      const back = beats[index + 2];
      if (!hit || hit.kind !== "hit" || !back || back.kind !== "return") {
        this.playBeats(beats, index + 1);
        return;
      }
      const container = beat.attacker === "player" ? this.battleHero : this.battleEnemy;
      const targetX = beat.attacker === "player"
        ? (this.battleEnemy?.x ?? (this.bossFight ? BOSS_BATTLE_POS.x : MONSTER_BATTLE_X))
        : (this.battleHero?.x ?? PLAYER_BATTLE_X);
      const onHit = () => {
        this.spawnSigned(hit.target, hit.amount);
        this.shot?.onShown(beat.attacker);
      };
      if (!container) {
        onHit();
        this.playBeats(beats, index + 3);
        return;
      }
      if (beat.attacker === "player") this.shot?.onShown("approach");
      performLunge(this, container, targetX, onHit, () => this.playBeats(beats, index + 3));
      return;
    }
    if (beat.kind === "step") {
      const container = this.battleHero;
      const enemyX = this.battleEnemy?.x ?? (this.bossFight ? BOSS_BATTLE_POS.x : MONSTER_BATTLE_X);
      if (!container) {
        this.playBeats(beats, index + 1);
        return;
      }
      this.shot?.onShown("approach");
      performApproach(this, container, stepTargetX(container.x, enemyX, "ranged"), RANGED_STEP_MS, () => {
        this.playBeats(beats, index + 1);
      });
      return;
    }
    if (beat.kind === "projectile") {
      this.launchProjectile(() => this.playBeats(beats, index + 1));
      return;
    }
    if (beat.kind === "hit") {
      this.spawnSigned(beat.target, beat.amount);
      this.shot?.onShown(beat.attacker);
      this.playBeats(beats, index + 1);
      return;
    }
    if (beat.kind === "return") {
      const container = beat.attacker === "player" ? this.battleHero : this.battleEnemy;
      const homeX = beat.attacker === "player"
        ? PLAYER_BATTLE_X
        : (this.bossFight ? BOSS_BATTLE_POS.x : MONSTER_BATTLE_X);
      if (!container) {
        this.playBeats(beats, index + 1);
        return;
      }
      performReturn(this, container, homeX, RANGED_RETURN_MS, () => this.playBeats(beats, index + 1));
      return;
    }
    if (beat.kind === "floater") {
      this.spawnSigned(beat.target, beat.amount);
      this.shot?.onShown(beat.target === "player" ? "heal" : beat.target);
    }
    this.playBeats(beats, index + 1);
  }

  private endMotion(): void {
    this.lunging = false;
    if (this.state) {
      this.displayHp = hpForHandoff(this.displayHp, {
        playerHp: this.state.playerHp,
        enemyHp: this.state.enemyHp,
      });
      this.displayNote = noteForHandoff(this.displayNote, this.state.lastNote);
    }
    this.hpSteps = [];
    if (!this.scene.isActive()) return;
    this.draw();
    if (this.pendingResults) this.armResults();
  }

  private commitHpStep(target: "player" | "enemy", amount: number): void {
    const taken = takeHpStep(this.hpSteps, target, amount);
    this.hpSteps = taken.rest;
    if (!taken.step) return;
    this.displayHp = applyHpStep(this.displayHp, taken.step);
    if (target === "enemy" && taken.step.amount < 0) {
      this.showMonsterHit();
      this.revealNote("action");
    } else if (target === "player" && taken.step.amount > 0) {
      this.revealNote("action");
    } else if (target === "player" && taken.step.amount < 0) {
      this.revealNote("counter");
    }
    this.tweenHp(target);
  }

  private actionWaits(beats: readonly MotionBeat[]): boolean {
    return beats.some((beat) =>
      (beat.kind === "lunge" && beat.attacker === "player")
      || beat.kind === "projectile"
      || beat.kind === "step"
      || (beat.kind === "floater" && beat.target === "player" && beat.amount > 0)
      || (beat.kind === "hit" && beat.attacker === "player"));
  }

  private counterWaits(beats: readonly MotionBeat[]): boolean {
    return beats.some((beat) =>
      (beat.kind === "lunge" && beat.attacker === "enemy")
      || (beat.kind === "hit" && beat.attacker === "enemy")
      || (beat.kind === "floater" && beat.target === "player" && beat.amount < 0));
  }

  /** A block or a full heal has no hit to wait for, so its sentence shows before the counter. */
  private revealReadyNotes(beats: readonly MotionBeat[]): void {
    if (!this.actionWaits(beats)) this.revealNote("action");
    if (!this.counterWaits(beats) && this.notePlan.counter) this.revealNote("counter");
  }

  private revealNote(part: "action" | "counter"): void {
    if (part === "counter" && !this.actionRevealed) {
      this.displayNote += this.notePlan.action;
      this.actionRevealed = true;
    }
    if (part === "action" && !this.actionRevealed) {
      this.displayNote += this.notePlan.action;
      this.actionRevealed = true;
    }
    if (part === "counter" && !this.counterRevealed) {
      this.displayNote += this.notePlan.counter;
      this.counterRevealed = true;
    }
    this.noteText?.setText(this.displayNote);
  }

  private showMonsterHit(): void {
    if (this.bossFight) return;
    const child = this.battleEnemy?.list[0];
    if (!child || !("setFrame" in child) || typeof child.setFrame !== "function") return;
    const kind = this.state.enemySprite === "page" ? "page" : "inkling";
    child.setFrame(`monster_${kind}_hit`);
  }

  private spawnSigned(target: "player" | "enemy", amount: number): void {
    if (amount === 0) return;
    this.commitHpStep(target, amount);
    const now = Date.now();
    const state = target === "player" ? this.playerFloaters : this.enemyFloaters;
    const active = pruneFloaters(state, now);
    const stackOffset = floaterStackOffset(activeFloaterCount(active, now));
    const x = target === "player" ? PLAYER_BATTLE_X : (this.bossFight ? BOSS_BATTLE_POS.x : MONSTER_BATTLE_X);
    const y = target === "player" ? 250 : 300;
    this.ensureFloaterLayer();
    spawnFloater(this, x, y, amount, stackOffset, this.floaterLayer);
    const next = pushFloater(active, amount, now);
    if (target === "player") this.playerFloaters = next;
    else this.enemyFloaters = next;
    if (this.floaterLayer?.scene) this.children.bringToTop(this.floaterLayer);
  }

  private ensureFloaterLayer(): Phaser.GameObjects.Container {
    if (!this.floaterLayer?.scene) {
      this.floaterLayer = this.add.container(0, 0);
      this.floaterLayer.setName(FLOATER_LAYER_NAME);
      this.floaterLayer.setDepth(4000);
      this.floaterLayer.setScrollFactor(0);
    }
    return this.floaterLayer;
  }

  private clearExceptFloaters(): void {
    const children = [...this.children.list];
    const kept = new Set(keptAcrossDraw(children));
    const live = this.floaterLayer?.scene && kept.has(this.floaterLayer) ? this.floaterLayer : undefined;
    this.floaterLayer = live;
    destroyDrawn(children.filter((child) => child !== live));
    this.ensureFloaterLayer();
  }

  private act(action: { type: "attack" | "block" | "heal" | "skill"; slotIndex?: number }): void {
    if (this.lunging) return;
    const before = this.state;
    const result = takeAction(this.state, action);
    if (!result.ok) {
      this.state = { ...this.state, lastNote: result.reason ?? "现在不能这么做。" };
      this.displayNote = this.state.lastNote;
      this.poses = ["idle"];
      this.bossPoses = ["idle"];
      this.draw();
      return;
    }
    this.state = result.state;
    this.displayNote = this.state.lastNote;
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
      if (this.lunging) return;
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
      bossName: this.state.enemyName,
      now,
    });
    this.pendingResults = view;
    if (!this.lunging) this.armResults();
  }

  private armResults(): void {
    if (this.resultsArmed || !this.pendingResults) return;
    this.resultsArmed = true;
    const view = this.pendingResults;
    const delay = view.won && view.boss ? 750 : 500;
    this.time.delayedCall(delay, () => this.openResults(view));
    this.input.once("pointerdown", () => this.openResults(view));
    this.input.keyboard?.once("keydown-SPACE", () => this.openResults(view));
  }

  private openResults(view: ReturnType<typeof buildResultsView>): void {
    if (this.resultsOpened || !this.scene.isActive()) return;
    if (this.state) {
      this.displayHp = hpForHandoff(this.displayHp, {
        playerHp: this.state.playerHp,
        enemyHp: this.state.enemyHp,
      });
      this.displayNote = noteForHandoff(this.displayNote, this.state.lastNote);
      this.noteText?.setText(this.displayNote);
    }
    this.resultsOpened = true;
    this.concealBattleActors();
    this.scene.pause();
    this.scene.launch("battle-results", view);
  }

  /** The results hero replaces this one. Hide the battle body, title, bars, and log before the overlay opens. */
  private concealBattleActors(): void {
    this.battleHero?.setVisible(false);
    this.floaterLayer?.setVisible(false);
    for (const node of [...this.battleTitle, ...this.battleHud]) {
      (node as { setVisible?: (shown: boolean) => void }).setVisible?.(false);
    }
  }

  private leave(): void {
    this.scene.start(this.clearedChapter ? "ending" : "stages", { fromBattleEnd: this.reported });
  }

  private hpInner(ratio: number): number {
    const clamped = Math.max(0, Math.min(1, ratio));
    if (clamped <= 0) return 0;
    return Math.max(16, (270 - 24) * clamped);
  }

  private hpBar(x: number, y: number, ratio: number, fillFrame: "hp_fill_teal" | "hp_fill_coral", side: "player" | "enemy"): void {
    const width = 270;
    warmSlice(this, "atlas_battle", "hp_frame", width, 24).setPosition(x, y);
    const inner = this.hpInner(ratio);
    const slice = inner <= 0 ? undefined : warmSlice(this, "atlas_battle", fillFrame, inner, 16);
    if (slice) {
      slice.setData("base", inner);
      slice.setPosition(x - width / 2 + 12 + inner / 2, y);
    }
    if (side === "player") this.playerHpFill = slice;
    else this.enemyHpFill = slice;
  }

  private tweenHp(side: "player" | "enemy"): void {
    const fill = side === "player" ? this.playerHpFill : this.enemyHpFill;
    const max = side === "player" ? this.state.playerMaxHp : this.state.enemyMaxHp;
    const hp = side === "player" ? this.displayHp.playerHp : this.displayHp.enemyHp;
    const ratio = max > 0 ? hp / max : 0;
    const barX = side === "player" ? 305 : 885;
    const frame = side === "player" ? "hp_fill_teal" : "hp_fill_coral";
    if (!fill?.scene) {
      this.hpBar(barX, 104, ratio, frame, side);
      return;
    }
    const inner = this.hpInner(ratio);
    const base = Number(fill.getData("base")) || inner || 1;
    const scaleX = inner <= 0 ? 0 : 0.5 * (inner / base);
    const x = barX - 270 / 2 + 12 + inner / 2;
    if (side === "player") this.playerHpTween?.stop();
    else this.enemyHpTween?.stop();
    if (this.shot?.holds() || motionOff()) {
      fill.destroy();
      if (inner <= 0) {
        if (side === "player") this.playerHpFill = undefined;
        else this.enemyHpFill = undefined;
        return;
      }
      const slice = warmSlice(this, "atlas_battle", frame, inner, 16);
      slice.setData("base", inner);
      slice.setPosition(x, 104);
      if (side === "player") this.playerHpFill = slice;
      else this.enemyHpFill = slice;
      return;
    }
    const tween = this.tweens.add({
      targets: fill,
      scaleX,
      x,
      duration: HP_BAR_TWEEN_MS,
      onComplete: () => fill.setVisible(inner > 0),
    });
    if (side === "player") this.playerHpTween = tween;
    else this.enemyHpTween = tween;
  }

  private launchProjectile(onHit: () => void): void {
    const fromX = (this.battleHero?.x ?? PLAYER_BATTLE_X) + 36;
    const toX = (this.battleEnemy?.x ?? (this.bossFight ? BOSS_BATTLE_POS.x : MONSTER_BATTLE_X)) - 48;
    const tint = Number.parseInt(classById(this.state.classId).color.slice(1), 16);
    const bolt = this.state.classId === "ranger"
      ? this.add.rectangle(fromX, 450, 36, 8, tint)
      : this.add.circle(fromX, 450, 11, tint);
    bolt.setStrokeStyle(4, 0xfff4dc);
    bolt.setDepth(3500);
    this.time.delayedCall(PROJECTILE_MS / 2, () => {
      if (bolt.active) this.shot?.onShown("bolt");
    });
    const finish = () => {
      bolt.destroy();
      onHit();
    };
    if (motionOff()) {
      finish();
      return;
    }
    this.tweens.add({
      targets: bolt,
      x: toX,
      duration: PROJECTILE_MS,
      ease: "Quad.easeIn",
      onComplete: finish,
    });
  }

  private drawMonster(): void {
    if (this.state.enemySprite === "canopy") {
      if (!this.bossReported) {
        reportBossLoad(this);
        this.bossReported = true;
      }
      const boss = new BossSprite(this, 0, 0);
      boss.playSequence(this.bossPoses);
      this.battleEnemy = this.add.container(BOSS_BATTLE_POS.x, BOSS_BATTLE_POS.y, [boss.sprite]);
      return;
    }
    const kind = this.state.enemySprite === "page" ? "page" : this.state.enemySprite === "inkling" ? "inkling" : null;
    if (!kind) return;
    const frame = `monster_${kind}_${this.monsterHit ? "hit" : "idle"}`;
    const monster = this.add.image(0, 0, "atlas_monsters", frame);
    monster.setOrigin(0.5, 0.977);
    monster.setScale(0.45);
    this.battleEnemy = this.add.container(MONSTER_BATTLE_X, 520, [monster]);
  }

  /** Grade-chapter boots never preload bg_forest. Wait for it instead of painting the missing texture. */
  private holdForestBattleBackdrop(): void {
    if (this.forestBattleFailed) {
      if (this.textures.exists("bg_village")) warmBackground(this, "bg_village");
      else this.add.rectangle(640, 400, 1280, 800, 0xf6efe2);
      return;
    }
    if (!this.forestBattleQueued) {
      this.forestBattleQueued = true;
      queueMissingForestBattle(this, this.battleBackdrop);
      this.load.once("complete", () => {
        this.forestBattleQueued = false;
        if (!this.textures.exists("bg_forest")) this.forestBattleFailed = true;
        if (this.scene.isActive()) this.draw();
      });
      if (!this.load.isLoading()) this.load.start();
    }
    if (this.textures.exists("bg_village")) warmBackground(this, "bg_village");
    else this.add.rectangle(640, 400, 1280, 800, 0xf6efe2);
  }

  private flash(target: Phaser.GameObjects.Container): void {
    this.tweens.add({ targets: target, alpha: 0.55, duration: 450, yoyo: true, repeat: -1 });
  }

  private draw(): void {
    if (!this.state) return;
    const save = getSave();
    if (!save) return;
    this.clearExceptFloaters();
    if (this.state.question?.kind !== "spelling") {
      document.getElementById("spell-form")?.classList.remove("open");
      showSpellingHint(null);
    }
    if (this.battleBackdrop.groupId === "forest" && !this.textures.exists("bg_forest")) {
      this.holdForestBattleBackdrop();
    } else if (this.battleBackdrop.groupId === "forest") warmBackground(this, "bg_forest");
    else paintSceneImage(this, this.battleBackdrop.battleKey);
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
    this.hpBar(305, 104, this.displayHp.playerHp / this.state.playerMaxHp, "hp_fill_teal", "player");
    this.hpBar(885, 104, this.displayHp.enemyHp / this.state.enemyMaxHp, "hp_fill_coral", "enemy");
    const pips = Math.min(6, this.state.maxEnergy);
    for (let i = 0; i < pips; i += 1) {
      const on = i < this.state.energy;
      this.add.image(226 + i * 24, 128, "atlas_battle", on ? "energy_pip_on" : "energy_pip_off").setScale(0.5);
    }
    warmPanel(this, 490, 182, 680, 52);
    this.noteText = this.add.text(170, 182, this.displayNote, {
      fontFamily: FONT_BODY,
      fontSize: "18px",
      color: INK,
      wordWrap: cjkWrap(640),
    }).setOrigin(0, 0.5);
    probeNote(`battle:${this.state.phase}:phase${this.state.phaseIndex + 1}`);
    const inputLocked = this.resolving || this.lunging;
    if (battleControlOpen(this.state.phase, "action", inputLocked)) warmPanel(this, 640, 686, 1056, 204, "panel_wood");
    else {
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
        inputLocked,
      ),
    }));
    if (battleControlOpen(this.state.phase, "answer", inputLocked) && this.state.question) {
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
        this.finishDraw();
        return;
      }
      probeQuestion(this.state.question.answerId, this.state.question.choices.map((choice) => choice.id));
      this.add.text(180, 640, this.state.question.prompt, { fontFamily: FONT_BODY, fontSize: "24px", fontStyle: "700", color: INK });
      this.state.question.choices.forEach((choice, index) => {
        warmOption(this, 280 + index * 280, 738, index, choice.id, choice.label, () => this.choose(choice.id), 250, 76);
      });
      this.finishDraw();
      return;
    }
    const choosing = this.state.phase === "choose";
    if (battleControlOpen(this.state.phase, "action", inputLocked) || (choosing && inputLocked)) {
      if (!battleControlOpen(this.state.phase, "action", inputLocked)) {
        warmPanel(this, 640, 686, 1056, 204, "panel_wood");
      }
      const attack = warmButton(this, 200, 680, "1 攻击", () => this.act({ type: "attack" }), { width: 148, tone: "coral", disabled: inputLocked });
      warmButton(this, 360, 680, "2 格挡", () => this.act({ type: "block" }), { width: 148, tone: "sky", disabled: inputLocked });
      warmButton(this, 520, 680, "3 治疗", () => this.act({ type: "heal" }), { width: 148, tone: "teal", disabled: inputLocked });
      if (this.state.supportStreak >= 2) {
        this.add.text(360, 718, "效果减弱", { fontFamily: FONT_BODY, fontSize: "14px", color: MUTED }).setOrigin(0.5);
        this.add.text(520, 718, "效果减弱", { fontFamily: FONT_BODY, fontSize: "14px", color: MUTED }).setOrigin(0.5);
      }
      if (inputLocked) {
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
    if (!this.presenting && battleControlOpen(this.state.phase, "leave", inputLocked)) {
      const label = this.clearedChapter ? "看结局" : this.state.phase === "lost" ? "再试一次 Esc" : "回关卡 Esc";
      warmButton(this, 640, 680, label, () => this.leave(), { width: 240 });
    }
    this.battleHud = this.children.list.slice(hudAt);
    this.finishDraw();
  }

  private finishDraw(): void {
    if (this.floaterLayer?.scene) this.children.bringToTop(this.floaterLayer);
  }
}

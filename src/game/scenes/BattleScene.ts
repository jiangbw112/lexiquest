import Phaser from "phaser";
import {
  answerQuestion,
  startBattle,
  takeAction,
  CHAPTER_BOSS_ID,
  type BattleState,
} from "../../domain/battle";
import { notePracticeAnswer } from "../../domain/parent";
import { applyBattleOutcome, studyNow } from "../../domain/progress";
import { checkSpelling } from "../../domain/questions";
import { showSpellingHint, spellingInstruction } from "../spelling-form";
import { badgeTone, isDue } from "../../domain/review";
import { battleWordIds, bossReady, stageById, stageCombat, stageStatuses } from "../../domain/stages";
import { BOSS_BATTLE_POS, canopyPoses, type BossAnim } from "../art/boss-pack";
import { BossSprite, queueBossAtlases, reportBossLoad } from "../art/boss-sprite";
import { battlePoses, type WarriorAnim } from "../art/warrior-pack";
import { queueChapterCosmetics } from "../art/chapter-cosmetics";
import { drawEquippedTitle } from "../art/title-bar";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { redirectUngraded } from "../grade-route";
import { probeEnter, probeNote, probeQuestion } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, listenKeys } from "../ui";

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
    if (status === "locked" || status === "skipped" || (stage.type === "boss" && !bossReady(save) && !save.chapterCleared)) {
      this.scene.start("stages");
      return;
    }
    probeEnter("battle");
    this.reported = false;
    this.bossReported = false;
    this.bossPoses = ["idle"];
    this.clearedChapter = false;
    const form = document.getElementById("spell-form");
    const submit = (event: Event) => {
      event.preventDefault();
      this.submitSpelling();
    };
    form?.addEventListener("submit", submit);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      form?.classList.remove("open");
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
    const combat = stageCombat(stage);
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
    });
    this.poses = ["idle"];
    this.bossPoses = ["idle"];
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      this.leave();
      return;
    }
    if (!this.state || document.getElementById("spell-form")?.classList.contains("open")) return;
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
    if (event.code === "Digit4") this.act({ type: "skill", slotIndex: 0 });
    if (event.code === "Digit5") this.act({ type: "skill", slotIndex: 1 });
    if (event.code === "Digit6") this.act({ type: "skill", slotIndex: 2 });
  }

  private choose(choiceId: string): void {
    const wordId = this.state.question?.wordId;
    if (wordId) mutate((save) => notePracticeAnswer(save, wordId, studyNow(save)));
    const before = this.state;
    this.state = answerQuestion(this.state, choiceId);
    this.poses = battlePoses({
      action: "answer",
      playerHpBefore: before.playerHp,
      playerHpAfter: this.state.playerHp,
      phase: this.state.phase,
    });
    this.syncBoss(before);
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
    this.finishIfNeeded();
    this.draw();
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
    const outcome = this.state.phase === "won" ? "win" : "loss";
    const before = getSave()?.chapterCleared === true;
    mutate((save) => applyBattleOutcome(save, outcome, Date.now(), this.state.encounterId));
    this.clearedChapter = !before && getSave()?.chapterCleared === true;
  }

  private leave(): void {
    this.scene.start(this.clearedChapter ? "ending" : "stages");
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
    this.add.rectangle(640, 400, 1280, 800, 0x143d2c);
    this.add.rectangle(640, 300, 1100, 460, 0xc9e6d4);
    const hero = new WarriorSprite(this, 300, 520, 0.72, save.equippedCosmeticIds);
    drawEquippedTitle(this, 300, 250, save.equippedTitleId);
    hero.playSequence(this.poses);
    if (this.state.encounterId === CHAPTER_BOSS_ID && this.state.enemySprite === "canopy") {
      if (!this.bossReported) {
        reportBossLoad(this);
        this.bossReported = true;
      }
      const boss = new BossSprite(this, BOSS_BATTLE_POS.x, BOSS_BATTLE_POS.y);
      boss.playSequence(this.bossPoses);
    } else {
      const monster = this.add.image(980, 520, "actors", `monster/${this.state.enemySprite}`).setOrigin(0.5, 1).setFlipX(true);
      monster.setScale(0.9);
      if (this.state.enemySprite === "inkling" && this.state.encounterId !== "inkling") {
        this.add.text(980, 250, "外形暂用墨团", { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" }).setOrigin(0.5);
      }
    }
    this.add.text(160, 70, `${save.player.name}  ${this.state.playerHp}/${this.state.playerMaxHp}`, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    const phaseCount = this.state.phases?.length ?? 1;
    const phaseLabel = phaseCount > 1 ? `  阶段 ${this.state.phaseIndex + 1}/${phaseCount}` : "";
    this.add.text(760, 70, `${this.state.enemyName}  ${this.state.enemyHp}/${this.state.enemyMaxHp}${phaseLabel}`, {
      fontFamily: FONT,
      fontSize: "22px",
      color: "#17352a",
    });
    this.add.text(160, 108, `能量 ${this.state.energy}/${this.state.maxEnergy}`, { fontFamily: FONT, fontSize: "18px", color: "#1f7a4d" });
    // Width 640 keeps a wrapped note left of the canopy, whose top sits near y=197 at scale 0.5.
    this.add.text(160, 146, this.state.lastNote, { fontFamily: FONT, fontSize: "20px", color: "#17352a", wordWrap: { width: 640 } });
    probeNote(`battle:${this.state.phase}:phase${this.state.phaseIndex + 1}`);
    if (this.state.phase === "question" && this.state.question) {
      if (this.state.question.kind === "spelling") {
        probeQuestion(this.state.question.wordId, []);
        this.add.rectangle(640, 690, 1100, 160, 0xfff8ee).setStrokeStyle(3, 0x17352a);
        this.add.text(180, 640, this.state.question.prompt, { fontFamily: FONT, fontSize: "24px", color: "#17352a" });
        this.add.text(180, 700, spellingInstruction(this.state.question.answer), {
          fontFamily: FONT,
          fontSize: "18px",
          color: "#3d5c4e",
          wordWrap: { width: 640 },
        });
        document.getElementById("spell-form")?.classList.add("open");
        showSpellingHint(this.state.question.answer);
        const input = document.getElementById("spell-input");
        if (input instanceof HTMLInputElement) window.setTimeout(() => input.focus(), 30);
        return;
      }
      probeQuestion(this.state.question.answerId, this.state.question.choices.map((choice) => choice.id));
      this.add.rectangle(640, 690, 1100, 160, 0xfff8ee).setStrokeStyle(3, 0x17352a);
      this.add.text(180, 640, this.state.question.prompt, { fontFamily: FONT, fontSize: "24px", color: "#17352a" });
      this.state.question.choices.forEach((choice, index) => {
        button(this, 280 + index * 280, 730, `${index + 1} ${choice.label}`, () => this.choose(choice.id), { width: 250, height: 48 });
      });
      return;
    }
    if (this.state.phase === "choose") {
      button(this, 220, 680, "1 攻击", () => this.act({ type: "attack" }), { width: 140 });
      button(this, 380, 680, "2 格挡", () => this.act({ type: "block" }), { width: 140, fill: 0x3d6ea8 });
      button(this, 540, 680, "3 治疗", () => this.act({ type: "heal" }), { width: 140, fill: 0x6d5bd0 });
      this.state.slots.forEach((slot) => {
        button(
          this,
          740 + slot.index * 160,
          680,
          `${slot.index + 4} ${slot.origin === "base" ? "基础" : slot.name}`,
          () => this.act({ type: "skill", slotIndex: slot.index }),
          { width: 150, fill: slot.origin === "base" ? 0x8a5a12 : 0xc4533a },
        );
      });
    }
    if (this.state.phase === "won" || this.state.phase === "lost") {
      const label = this.clearedChapter ? "看结局" : this.state.phase === "lost" ? "再试一次 Esc" : "回关卡 Esc";
      button(this, 640, 680, label, () => this.leave(), { width: 240 });
    }
  }
}

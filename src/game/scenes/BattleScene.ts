import Phaser from "phaser";
import {
  answerQuestion,
  canStartBattle,
  CHAPTER_BOSS_ID,
  encounterById,
  openEncounters,
  startBattle,
  takeAction,
  type BattleState,
} from "../../domain/battle";
import { wordsForGrades } from "../../domain/catalog";
import { selectedSampleWords } from "../../domain/progress";
import { applyBattleOutcome, studyNow } from "../../domain/progress";
import { isDue } from "../../domain/review";
import { battlePoses, type WarriorAnim } from "../art/warrior-pack";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { probeEnter, probeNote, probeQuestion } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, listenKeys, paper } from "../ui";

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private reported = false;
  private picking = false;
  private poses: WarriorAnim[] = ["idle"];
  private clearedChapter = false;

  constructor() {
    super("battle");
  }

  preload(): void {
    queueWarriorAtlases(this);
  }

  create(): void {
    const save = getSave();
    if (!save || !canStartBattle(Object.keys(save.wordCards).length)) {
      this.scene.start("overworld");
      return;
    }
    probeEnter("battle");
    this.reported = false;
    this.picking = save.battlesWon >= 1;
    if (!this.picking) this.begin("inkling");
    else this.drawPick();
    listenKeys(this, (event) => this.onKey(event));
  }

  private begin(encounterId: string): void {
    const save = getSave();
    if (!save) return;
    const now = studyNow(save);
    const dueWordIds = Object.values(save.memory).filter((memory) => isDue(memory, now)).map((memory) => memory.wordId);
    this.state = startBattle({
      encounterId,
      classId: save.player.classId,
      learnedIds: Object.keys(save.wordCards),
      equippedSkillIds: save.equippedSkillIds,
      skillLevels: save.skillLevels,
      seed: Date.now() % 100000,
      dueWordIds,
      allowedWordIds: wordsForGrades(save.selectedGrades).map((word) => word.id),
    });
    this.picking = false;
    this.poses = ["idle"];
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      this.leave();
      return;
    }
    if (this.picking) {
      const index = Number(event.code.replace("Digit", "")) - 1;
      const choice = this.fightChoices()[index];
      if (choice) this.begin(choice.id);
      return;
    }
    if (!this.state) return;
    if (this.state.phase === "question" && this.state.question) {
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
    const before = this.state.playerHp;
    this.state = answerQuestion(this.state, choiceId);
    this.poses = battlePoses({
      action: "answer",
      playerHpBefore: before,
      playerHpAfter: this.state.playerHp,
      phase: this.state.phase,
    });
    this.finishIfNeeded();
    this.draw();
  }

  private act(action: { type: "attack" | "block" | "heal" | "skill"; slotIndex?: number }): void {
    const before = this.state.playerHp;
    const result = takeAction(this.state, action);
    if (!result.ok) {
      this.state = { ...this.state, lastNote: result.reason ?? "现在不能这么做。" };
      this.poses = ["idle"];
      this.draw();
      return;
    }
    this.state = result.state;
    this.poses = battlePoses({
      action: action.type,
      playerHpBefore: before,
      playerHpAfter: this.state.playerHp,
      phase: this.state.phase,
    });
    this.finishIfNeeded();
    this.draw();
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

  private fightChoices() {
    const save = getSave();
    return openEncounters(
      Object.keys(save?.wordCards ?? {}),
      save ? selectedSampleWords(save).map((word) => word.id) : [],
    );
  }

  private leave(): void {
    this.scene.start(this.clearedChapter ? "ending" : "overworld");
  }

  private drawPick(): void {
    this.children.removeAll(true);
    paper(this);
    this.add.text(180, 80, "选择词灵", { fontFamily: FONT, fontSize: "40px", color: "#17352a" });
    this.add.text(180, 150, "墨团和页灵可以再打。词卡集齐后，林冠是这一章的暂定结局。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#3d5c4e",
    });
    const choices = this.fightChoices();
    choices.forEach((encounter, index) => {
      const boss = encounter.id === CHAPTER_BOSS_ID;
      button(this, 320 + index * 320, 320, `${index + 1} ${encounter.name}`, () => this.begin(encounter.id), {
        width: 260,
        fill: boss ? 0x1f7a4d : index === 0 ? 0x1f7a4d : 0x8c6239,
      });
    });
    button(this, 280, 640, "返回 Esc", () => this.leave(), { width: 180, fill: 0x5c6b62 });
    probeNote("battle:pick");
  }

  private draw(): void {
    if (this.picking || !this.state) return;
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    this.add.rectangle(640, 400, 1280, 800, 0x143d2c);
    this.add.rectangle(640, 300, 1100, 460, 0xc9e6d4);
    const encounter = encounterById(this.state.encounterId);
    const hero = new WarriorSprite(this, 300, 520, 0.72);
    hero.playSequence(this.poses);
    const monster = this.add.image(980, 520, "actors", `monster/${encounter.sprite ?? encounter.id}`).setOrigin(0.5, 1).setFlipX(true);
    monster.setScale(encounter.id === CHAPTER_BOSS_ID ? 1.15 : 0.9);
    if (encounter.sprite === "page" && encounter.id !== "page") {
      this.add.text(980, 250, "外形暂用页灵", { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" }).setOrigin(0.5);
    }
    this.add.text(160, 100, `${save.player.name}  ${this.state.playerHp}/${this.state.playerMaxHp}`, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    this.add.text(820, 100, `${encounter.name}  ${this.state.enemyHp}/${this.state.enemyMaxHp}`, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    this.add.text(160, 136, `能量 ${this.state.energy}/${this.state.maxEnergy}`, { fontFamily: FONT, fontSize: "18px", color: "#1f7a4d" });
    this.add.text(160, 176, this.state.lastNote, { fontFamily: FONT, fontSize: "20px", color: "#17352a", wordWrap: { width: 960 } });
    if (this.state.phase === "question" && this.state.question) {
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
      const label = this.clearedChapter ? "看结局" : "回村子 Esc";
      button(this, 640, 680, label, () => this.leave(), { width: 240 });
    }
    probeNote(`battle:${this.state.phase}`);
  }
}

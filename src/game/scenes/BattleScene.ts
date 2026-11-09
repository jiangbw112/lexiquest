import Phaser from "phaser";
import {
  answerQuestion,
  canStartBattle,
  encounterById,
  startBattle,
  takeAction,
  type BattleState,
} from "../../domain/battle";
import { applyBattleOutcome, studyNow } from "../../domain/progress";
import { isDue } from "../../domain/review";
import { battlePoses, type WarriorAnim } from "../art/warrior-pack";
import { queueWarriorAtlases, WarriorSprite } from "../art/warrior-sprite";
import { probeEnter, probeQuestion } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, listenKeys, paper } from "../ui";

export class BattleScene extends Phaser.Scene {
  private state!: BattleState;
  private reported = false;
  private picking = false;
  private poses: WarriorAnim[] = ["idle"];

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
    });
    this.picking = false;
    this.poses = ["idle"];
    this.draw();
  }

  private onKey(event: KeyboardEvent): void {
    if (event.code === "Escape") {
      this.scene.start("overworld");
      return;
    }
    if (this.picking) {
      if (event.code === "Digit1") this.begin("inkling");
      if (event.code === "Digit2") this.begin("page");
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
    if (!result.ok) return;
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
    mutate((save) => applyBattleOutcome(save, outcome, Date.now()));
  }

  private drawPick(): void {
    this.children.removeAll(true);
    paper(this);
    this.add.text(180, 80, "选择词灵", { fontFamily: FONT, fontSize: "40px", color: "#17352a" });
    button(this, 420, 280, "1 墨团", () => this.begin("inkling"), { width: 280 });
    button(this, 820, 280, "2 页灵", () => this.begin("page"), { width: 280, fill: 0x8c6239 });
    button(this, 280, 640, "返回 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
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
    const monster = this.add.image(980, 520, "actors", `monster/${encounter.id}`).setOrigin(0.5, 1).setFlipX(true);
    monster.setScale(0.9);
    this.add.text(160, 100, `${save.player.name}  ${this.state.playerHp}/${this.state.playerMaxHp}`, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    this.add.text(820, 100, `${encounter.name}  ${this.state.enemyHp}/${this.state.enemyMaxHp}`, { fontFamily: FONT, fontSize: "22px", color: "#17352a" });
    this.add.text(160, 136, `能量 ${this.state.energy}/${this.state.maxEnergy}`, { fontFamily: FONT, fontSize: "18px", color: "#1f7a4d" });
    this.add.text(160, 176, this.state.lastNote, { fontFamily: FONT, fontSize: "20px", color: "#17352a", wordWrap: { width: 960 } });
    if (this.state.phase === "question" && this.state.question) {
      probeQuestion(this.state.question.answerId, this.state.question.choices.map((choice) => choice.id));
      this.add.text(180, 620, this.state.question.prompt, { fontFamily: FONT, fontSize: "24px", color: "#17352a" });
      this.state.question.choices.forEach((choice, index) => {
        button(this, 280 + index * 280, 720, `${index + 1} ${choice.label}`, () => this.choose(choice.id), { width: 250, height: 48 });
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
      button(this, 640, 680, "回村子 Esc", () => this.scene.start("overworld"), { width: 240 });
    }
  }
}

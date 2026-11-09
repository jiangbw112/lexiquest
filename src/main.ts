import Phaser from "phaser";
import { installRuntime } from "./game/audio";
import { BattleScene } from "./game/scenes/BattleScene";
import { BootScene } from "./game/scenes/BootScene";
import { CollectionScene } from "./game/scenes/CollectionScene";
import { CreateScene } from "./game/scenes/CreateScene";
import { DuelScene } from "./game/scenes/DuelScene";
import { GuideScene } from "./game/scenes/GuideScene";
import { LearnScene } from "./game/scenes/LearnScene";
import { OverworldScene } from "./game/scenes/OverworldScene";
import { ReviewScene } from "./game/scenes/ReviewScene";
import { SkillsScene } from "./game/scenes/SkillsScene";
import { TitleScene } from "./game/scenes/TitleScene";
import { WardrobeScene } from "./game/scenes/WardrobeScene";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 800,
  backgroundColor: "#143d2c",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  fps: { target: 60 },
  input: {
    keyboard: true,
    mouse: true,
    touch: false,
    gamepad: false,
  },
  audio: { disableWebAudio: false },
  scene: [
    BootScene,
    TitleScene,
    CreateScene,
    OverworldScene,
    LearnScene,
    BattleScene,
    CollectionScene,
    ReviewScene,
    SkillsScene,
    WardrobeScene,
    DuelScene,
    GuideScene,
  ],
});

installRuntime(game);

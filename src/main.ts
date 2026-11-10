import Phaser from "phaser";
import { isDesktopShell, shellCopy } from "./domain/host-copy";
import { installRuntime } from "./game/audio";
import { BattleScene } from "./game/scenes/BattleScene";
import { BootScene } from "./game/scenes/BootScene";
import { CollectionScene } from "./game/scenes/CollectionScene";
import { CreateScene } from "./game/scenes/CreateScene";
import { GradeScene } from "./game/scenes/GradeScene";
import { DuelScene } from "./game/scenes/DuelScene";
import { EndingScene } from "./game/scenes/EndingScene";
import { GuideScene } from "./game/scenes/GuideScene";
import { LearnScene } from "./game/scenes/LearnScene";
import { OverworldScene } from "./game/scenes/OverworldScene";
import { ReviewScene } from "./game/scenes/ReviewScene";
import { SkillsScene } from "./game/scenes/SkillsScene";
import { StageMapScene } from "./game/scenes/StageMapScene";
import { TitleScene } from "./game/scenes/TitleScene";
import { WardrobeScene } from "./game/scenes/WardrobeScene";
import { WEBGL_REQUIRED_MESSAGE, webglAvailable } from "./game/webgl";

const shell = shellCopy(isDesktopShell());
document.documentElement.dataset.clearCacheLabel = shell.clearCacheLabel;
document.documentElement.dataset.saveCacheNotice = shell.saveCacheNotice;

function showWebglRequired(): void {
  const host = document.getElementById("game");
  if (!host) return;
  host.replaceChildren();
  const note = document.createElement("p");
  note.id = "webgl-needed";
  note.textContent = WEBGL_REQUIRED_MESSAGE;
  host.append(note);
}

if (!webglAvailable()) {
  showWebglRequired();
} else {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    render: { failIfMajorPerformanceCaveat: false },
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
      GradeScene,
      CreateScene,
      OverworldScene,
      LearnScene,
      StageMapScene,
      BattleScene,
      CollectionScene,
      ReviewScene,
      SkillsScene,
      WardrobeScene,
      EndingScene,
      DuelScene,
      GuideScene,
    ],
  });

  installRuntime(game);
}

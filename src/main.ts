import { Color, Fog, Vector3 } from "three";
import { Engine } from "./Engine";
import Ground from "./entities/World/Ground";
import FootDust from "./particles/FootDust/FootDust";
import Tree from "./entities/Tree";
import LoaderManager from "./LoaderManager";
import Player from "./entities/Player/Player";
import FollowCamera from "./entities/FollowCamera";
import InputManager from "./InputManager";
import PhysicsManager from "./PhysicsManager";
import PhysicsDebug from "./entities/PhysicsDebug";
import DebugManager from "./DebugManager";
import Sun from "./entities/Sun";
import DayNightCycle from "./entities/DayNightCycle/DayNightCycle";
import AudioManager from "./AudioManager";
import ShaderPlane from "./entities/ShaderPlane/ShaderPlane";
import UIManager from "./UIManager";
import PlayerStatus from "./ui/PlayerStatus/PlayerStatus";
import ToolBar from "./ui/ToolBar/ToolBar";
import { COLORS } from "./colors";

const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
if (!canvas) throw new Error("Canvas #canvas not found");
const uiRoot = document.querySelector<HTMLElement>("#ui");
if (!uiRoot) throw new Error("UI root #ui not found");

await LoaderManager.loadAll((loaded, total) => {
  console.log(`Loading assets: ${loaded}/${total}`);
});

await PhysicsManager.init();
InputManager.init();
AudioManager.init();
UIManager.init(uiRoot);

const engine = new Engine({ canvas });
engine.entities.add(new Tree({ x: 3, y: 0, z: -2 }));
engine.entities.add(new ShaderPlane({ x: -3, y: 1, z: -2 }));
const player = engine.entities.add(new Player(new Vector3(0, 10, 0)));
engine.entities.add(new Ground(player.object));
engine.particles.add(new FootDust(player));
engine.entities.add(
  new FollowCamera(engine.camera, player.object, {
    offset: { x: 0, y: 10, z: 10 },
    lookAtOffset: { x: 0, y: 1, z: 0 },
  }),
);
if (DebugManager.isEnabled) {
  engine.entities.add(new PhysicsDebug());
}

// The follow camera looks towards -Z and sees much more ground ahead of the player than
// behind: shift the shadow frustum forward so it covers what is on screen
const sun = engine.entities.add(
  new Sun(player.object, {
    focusOffset: { x: 0, y: 0, z: -8 },
    shadowSize: 15,
  }),
);
// Hides where the ground plane ends and where vegetation chunks appear; distances are from
// the camera, which sits about 14m from the player
const sky = new Color(COLORS.sky);
const fog = new Fog(COLORS.sky, 50, 60);
engine.scene.background = sky;
engine.scene.fog = fog;
// Also owns the sky/ground fill light, so faces the sun does not reach are not pitch black
engine.entities.add(new DayNightCycle(sun.light, sky, fog));

UIManager.add(new PlayerStatus(player), "topLeft");
UIManager.add(new ToolBar(player), "bottomLeft");

engine.start();
import.meta.hot?.dispose(() => {
  engine.dispose();
  InputManager.dispose();
  PhysicsManager.dispose();
  AudioManager.dispose();
  UIManager.dispose();
  DebugManager.dispose();
});

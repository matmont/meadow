import {
  BoxGeometry,
  EventDispatcher,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { vi } from "vitest";
import { EntityManager } from "../../../src/EntityManager";
import LoaderManager from "../../../src/LoaderManager";
import type { ModelId } from "../../../src/LoaderManager";
import type { PlayerEventMap } from "../../../src/entities/Player/Player";
import type { ToolId } from "../../../src/entities/Player/tools";
import type { InteractorSource } from "../../../src/interaction/InteractionManager";
import InteractionManager from "../../../src/interaction/InteractionManager";

// Size of the stand-in models: trees are 1 x 4 x 1 boxes, stumps 1 x 0.5 x 1, all with
// their origin at the base like the real assets
export const TREE_HEIGHT = 4;
export const STUMP_HEIGHT = 0.5;

const UP = new Vector3(0, 1, 0);

interface HorizontalPoint {
  x: number;
  z: number;
}

interface SharedModel {
  readonly geometry: BoxGeometry;
  readonly material: MeshBasicMaterial;
}

// Stands in for the cached glTF models, which need fetch and WebGL-free decoding. Every
// instance of a model shares one geometry and material, like SkeletonUtils.clone does with
// the cached source, so tests can check that entities never dispose them
export function stubModels(): {
  readonly instantiated: ModelId[];
  readonly shared: Map<ModelId, SharedModel>;
} {
  const instantiated: ModelId[] = [];
  const shared = new Map<ModelId, SharedModel>();
  vi.spyOn(LoaderManager, "instantiate").mockImplementation((id: ModelId) => {
    let model = shared.get(id);
    if (!model) {
      const height = id.startsWith("stump") ? STUMP_HEIGHT : TREE_HEIGHT;
      const geometry = new BoxGeometry(1, height, 1).translate(0, height / 2, 0);
      model = { geometry, material: new MeshBasicMaterial() };
      shared.set(id, model);
    }
    instantiated.push(id);
    const root = new Group();
    root.name = id;
    root.add(new Mesh(model.geometry, model.material));
    return root;
  });
  return { instantiated, shared };
}

// The player as InteractionManager sees it: a position, a facing direction and the toolHit
// event, without the character controller
export class FakeActor implements InteractorSource {
  readonly object = new Object3D();
  readonly events = new EventDispatcher<PlayerEventMap>();
  selectedTool: ToolId = "axe";
  isUsingTool = true;

  faceTowards(): void {}

  // Stands `distance` away from `target` on the side of `from` (a horizontal direction),
  // facing it
  standNear(
    target: Readonly<HorizontalPoint>,
    direction: Readonly<HorizontalPoint>,
    distance = 1.5,
  ): void {
    const length = Math.hypot(direction.x, direction.z);
    const dx = direction.x / length;
    const dz = direction.z / length;
    this.object.position.set(
      target.x + dx * distance,
      0,
      target.z + dz * distance,
    );
    // Forward is +Z: turn it towards the target
    this.object.quaternion.setFromAxisAngle(UP, Math.atan2(-dx, -dz));
    this.object.updateMatrixWorld();
  }

  // What Player does when the tool lands: the manager focuses first, then the hit fires
  hit(tool: ToolId = this.selectedTool): void {
    InteractionManager.update();
    this.events.dispatchEvent({ type: "toolHit", tool });
  }
}

// The part of Engine's frame loop the felling depends on: entities with clamped deltas and
// accumulated elapsed time, then the interaction focus
export class FrameLoop {
  readonly root = new Group();
  readonly entities = new EntityManager(this.root);
  elapsed = 0;

  step(delta: number, frames = 1): void {
    for (let i = 0; i < frames; i++) {
      this.elapsed += delta;
      this.entities.update(delta, this.elapsed);
      InteractionManager.update();
    }
  }

  // Runs frames of `delta` until `seconds` have passed
  advance(seconds: number, delta = 1 / 60): void {
    const frames = Math.round(seconds / delta);
    this.step(delta, frames);
  }
}

// Angle between the object's up axis and the world's, i.e. how far it leans
export function leanAngle(object: Object3D): number {
  return new Vector3(0, 1, 0).applyQuaternion(object.quaternion).angleTo(UP);
}

// Horizontal direction the object's top leans towards
export function leanDirection(object: Object3D): Vector3 {
  return new Vector3(0, 1, 0)
    .applyQuaternion(object.quaternion)
    .setY(0)
    .normalize();
}

// Rotation around Y of an upright object, in [0, 2π)
export function yaw(quaternion: Quaternion): number {
  const angle = 2 * Math.atan2(quaternion.y, quaternion.w);
  return ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
}

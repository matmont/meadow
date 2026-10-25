import RAPIER from "@dimforge/rapier3d-compat";
import {
  AnimationClip,
  AnimationMixer,
  Mesh,
  MeshStandardMaterial,
  PointLight,
} from "three";
import type { Vector3Like } from "three";
import type GUI from "lil-gui";
import { Entity } from "../Entity";
import LoaderManager from "../LoaderManager";
import PhysicsManager from "../PhysicsManager";
import { COLORS } from "../colors";

const BURN_CLIP = "Burn";
const LIGHT_NODE = "FireLight";
const COLLIDER_RADIUS = 0.55;
const COLLIDER_HALF_HEIGHT = 0.25;
const FLICKER_AMOUNT = 0.15;
const FLICKER_SMOOTHING = 12;

export default class Campfire extends Entity {
  readonly #mixer: AnimationMixer;
  readonly #light = new PointLight(COLORS.campfireLight, 0, 10, 1);
  readonly #body: RAPIER.RigidBody;
  lightIntensity = 6;

  constructor(position: Vector3Like, rotation = 0) {
    super(LoaderManager.instantiate("campfire"), {
      castShadow: true,
      receiveShadow: true,
    });
    this.object.position.copy(position);
    this.object.rotation.y = rotation;

    // Flames, embers and sparks are light sources: they neither cast nor receive shadows
    this.object.traverse((child) => {
      if (
        child instanceof Mesh &&
        child.material instanceof MeshStandardMaterial &&
        child.material.emissive.getHex() !== 0
      ) {
        child.castShadow = false;
        child.receiveShadow = false;
      }
    });

    const lightNode = this.object.getObjectByName(LIGHT_NODE);
    if (!lightNode) {
      throw new Error(`Node "${LIGHT_NODE}" not found in model "campfire"`);
    }
    this.#light.intensity = this.lightIntensity;
    lightNode.add(this.#light);

    const clip = AnimationClip.findByName(this.object.animations, BURN_CLIP);
    if (!clip) {
      const available = this.object.animations.map(({ name }) => name);
      throw new Error(
        `Clip "${BURN_CLIP}" not found in model "campfire" (available: ${available.join(", ")})`,
      );
    }
    this.#mixer = new AnimationMixer(this.object);
    this.#mixer.clipAction(clip).play();

    const world = PhysicsManager.world;
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        position.x,
        position.y + COLLIDER_HALF_HEIGHT,
        position.z,
      ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(COLLIDER_HALF_HEIGHT, COLLIDER_RADIUS),
      this.#body,
    );
  }

  override update(delta: number): void {
    this.#mixer.update(delta);

    const target =
      this.lightIntensity * (1 + (Math.random() * 2 - 1) * FLICKER_AMOUNT);
    const alpha = 1 - Math.exp(-FLICKER_SMOOTHING * delta);
    this.#light.intensity += (target - this.#light.intensity) * alpha;
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(this, "lightIntensity", 0, 20, 0.1).name("light intensity");
    folder.add(this.#light, "distance", 1, 30, 0.5).name("light distance");
  }

  // Geometries and materials are shared with the cached model: only the mixer, the light
  // and the physics body belong to this entity
  override dispose(): void {
    this.#mixer.stopAllAction();
    this.#mixer.uncacheRoot(this.object);
    this.#light.dispose();
    PhysicsManager.world.removeRigidBody(this.#body);
  }
}

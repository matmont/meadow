import RAPIER from "@dimforge/rapier3d-compat";
import { Box3, Quaternion, Vector3 } from "three";
import type { Vector3Like } from "three";
import { Entity } from "../Entity";
import LoaderManager from "../LoaderManager";
import type { ModelId } from "../LoaderManager";
import PhysicsManager from "../PhysicsManager";
import Interactable from "../interaction/Interactable";
import InteractionManager from "../interaction/InteractionManager";

// Reach beyond the trunk's collider, so the axe can hit it from where the player stops
const HARVEST_REACH = 1.2;
// The spring is integrated in fixed substeps: the frame delta can reach 0.1s, which is too
// coarse for a stiff spring with explicit integration
const SHAKE_STEP = 1 / 120;
// Below these the tree is considered at rest and update() stops touching the transform
const REST_TILT = 1e-4;
const REST_SPEED = 1e-3;
const UP = new Vector3(0, 1, 0);

// Shared by every tree, so the debug GUI tunes them all from a single folder (see Forest)
export const TREE_SHAKE = {
  frequency: 2.2,
  // Damping ratio: below 1 the tree swings back and forth before settling
  damping: 0.18,
  // Angular speed given by one hit, in rad/s
  impulse: 1.2,
  maxTilt: 0.15,
};

export interface TreeOptions {
  model?: ModelId;
  // Around the vertical axis, in radians
  rotation?: number;
  // On top of the model's asset scale
  scale?: number;
}

export default class Tree extends Entity {
  readonly #body: RAPIER.RigidBody;
  readonly #interactable: Interactable;
  readonly #axis = new Vector3();
  // The rotation around Y the tilt is composed with
  readonly #baseRotation = new Quaternion();

  // Tilt of the top as a horizontal vector (radians): it leans towards (x, z) by its length.
  // The model's origin is at the base of the trunk, so rotating the root pivots on the base
  #tiltX = 0;
  #tiltZ = 0;
  #speedX = 0;
  #speedZ = 0;
  #isShaking = false;

  constructor(
    position: Vector3Like = { x: 0, y: 0, z: 0 },
    { model = "treePine", rotation = 0, scale = 1 }: TreeOptions = {},
  ) {
    super(LoaderManager.instantiate(model), {
      castShadow: true,
      receiveShadow: true,
    });
    this.object.position.copy(position);
    this.object.scale.multiplyScalar(scale);

    // Measured before rotating: the box of a rotated model is axis-aligned and grows with the
    // angle, which would widen the collider
    const size = new Box3().setFromObject(this.object).getSize(new Vector3());
    const radius = Math.min(size.x, size.z);
    this.#baseRotation.setFromAxisAngle(UP, rotation);
    this.object.quaternion.copy(this.#baseRotation);

    // The collider stays upright while the tree shakes: the tilt is only visual
    const world = PhysicsManager.world;
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        position.x,
        position.y + size.y / 2,
        position.z,
      ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(size.y / 2, radius / 2),
      this.#body,
    );

    this.#interactable = new Interactable(this.object, {
      actions: [{ id: "harvest", label: "Harvest", tool: "axe" }],
      radius: radius / 2 + HARVEST_REACH,
      promptHeight: size.y + 0.2,
      onAction: (_action, actorPosition) => this.#harvest(actorPosition),
    });
  }

  override onAdded(): void {
    InteractionManager.register(this.#interactable);
  }

  override update(delta: number): void {
    if (!this.#isShaking) return;

    // Damped spring: a = -ω²x - 2ζωv, semi-implicit Euler
    const omega = 2 * Math.PI * TREE_SHAKE.frequency;
    const stiffness = omega * omega;
    const damping = 2 * TREE_SHAKE.damping * omega;
    let remaining = delta;
    while (remaining > 0) {
      const step = Math.min(remaining, SHAKE_STEP);
      this.#speedX -= (stiffness * this.#tiltX + damping * this.#speedX) * step;
      this.#speedZ -= (stiffness * this.#tiltZ + damping * this.#speedZ) * step;
      this.#tiltX += this.#speedX * step;
      this.#tiltZ += this.#speedZ * step;
      remaining -= step;
    }

    const tilt = Math.hypot(this.#tiltX, this.#tiltZ);
    const speed = Math.hypot(this.#speedX, this.#speedZ);
    if (tilt < REST_TILT && speed < REST_SPEED) {
      this.#tiltX = this.#tiltZ = this.#speedX = this.#speedZ = 0;
      this.#isShaking = false;
      this.object.quaternion.copy(this.#baseRotation);
      return;
    }

    this.#clampTilt(tilt);
    this.#applyTilt();
  }

  override onRemoved(): void {
    InteractionManager.unregister(this.#interactable);
  }

  // Geometrie e materiali sono condivisi tra tutte le copie del modello:
  // li gestisce il LoaderManager, non la singola entità.
  override dispose(): void {
    PhysicsManager.world.removeRigidBody(this.#body);
  }

  // Wood and felling are still to be decided: for now a hit only shakes the tree
  #harvest(actorPosition: Readonly<Vector3Like>): void {
    this.shake(actorPosition);
  }

  // Pushes the top away from `from`; repeated hits add up, limited by maxTilt
  shake(from: Readonly<Vector3Like>): void {
    const dx = this.object.position.x - from.x;
    const dz = this.object.position.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1e-3) return;

    this.#speedX += (dx / distance) * TREE_SHAKE.impulse;
    this.#speedZ += (dz / distance) * TREE_SHAKE.impulse;
    this.#isShaking = true;
  }

  // Projects the tilt back on the limit and drops the outward speed, so it does not push on it
  #clampTilt(tilt: number): void {
    const maxTilt = TREE_SHAKE.maxTilt;
    if (tilt <= maxTilt) return;

    const nx = this.#tiltX / tilt;
    const nz = this.#tiltZ / tilt;
    this.#tiltX = nx * maxTilt;
    this.#tiltZ = nz * maxTilt;
    const outward = this.#speedX * nx + this.#speedZ * nz;
    if (outward > 0) {
      this.#speedX -= outward * nx;
      this.#speedZ -= outward * nz;
    }
  }

  // Leaning the up axis towards (x, z) is a rotation around up × (x, 0, z) = (z, 0, -x),
  // in world space: it is applied after the base rotation around Y
  #applyTilt(): void {
    const angle = Math.hypot(this.#tiltX, this.#tiltZ);
    if (angle < 1e-6) {
      this.object.quaternion.copy(this.#baseRotation);
      return;
    }
    this.#axis.set(this.#tiltZ / angle, 0, -this.#tiltX / angle);
    this.object.quaternion
      .setFromAxisAngle(this.#axis, angle)
      .multiply(this.#baseRotation);
  }
}

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
// Lean of a felled tree when it is removed: a bit short of lying flat, so the canopy does not
// sink far into the ground
export const FALL_ANGLE = Math.PI / 2 - 0.15;

// Shared by every tree, so the debug GUI tunes them all from a single folder (see Forest)
export const TREE_SHAKE = {
  frequency: 2.2,
  // Damping ratio: below 1 the tree swings back and forth before settling
  damping: 0.18,
  // Angular speed given by one hit, in rad/s
  impulse: 1.2,
  maxTilt: 0.15,
};

// Shared by every tree like TREE_SHAKE, tuned from Forest's debug folder
export const TREE_FELLING = {
  // Axe hits that fell a tree; the earlier ones only shake it
  hits: 5,
  // Given once per felled tree; a positive integer, as Inventory requires
  wood: 3,
  // Seconds from the felling hit until the tree lies down and is removed
  fallDuration: 1.4,
};

// Eased fall progress for a linear `progress` in [0, 1] (clamped): quadratic, so the tree
// starts slowly and speeds up as it topples, like under a constant angular acceleration
export function fallEase(progress: number): number {
  const t = Math.min(Math.max(progress, 0), 1);
  return t * t;
}

export interface TreeOptions {
  model?: ModelId;
  // Around the vertical axis, in radians
  rotation?: number;
  // On top of the model's asset scale
  scale?: number;
  // Called once by the hit that fells the tree, before it starts falling
  onFelled?: (tree: Tree) => void;
  // Called once when the fall ends, after the tree has destroyed itself
  onFallen?: (tree: Tree) => void;
}

export default class Tree extends Entity {
  readonly #interactable: Interactable;
  readonly #onFelled: ((tree: Tree) => void) | undefined;
  readonly #onFallen: ((tree: Tree) => void) | undefined;
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
  // Removed when the tree is felled, so the player is not blocked by a falling trunk
  #body: RAPIER.RigidBody | null;
  #hits = 0;
  #isFalling = false;
  #fallTime = 0;
  // Horizontal unit direction of the fall, away from the player
  #fallX = 0;
  #fallZ = 0;
  // Tilt when the fall started, blended out so a tree hit mid-swing does not jump
  #fallStartX = 0;
  #fallStartZ = 0;

  constructor(
    position: Vector3Like = { x: 0, y: 0, z: 0 },
    {
      model = "treePine",
      rotation = 0,
      scale = 1,
      onFelled,
      onFallen,
    }: TreeOptions = {},
  ) {
    super(LoaderManager.instantiate(model), {
      castShadow: true,
      receiveShadow: true,
    });
    this.object.position.copy(position);
    this.object.scale.multiplyScalar(scale);
    this.#onFelled = onFelled;
    this.#onFallen = onFallen;

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
      isEnabled: () => !this.#isFalling,
    });
  }

  // True from the felling hit on: the tree no longer reacts to hits
  get isFelled(): boolean {
    return this.#isFalling;
  }

  override onAdded(): void {
    InteractionManager.register(this.#interactable);
  }

  override update(delta: number): void {
    if (this.#isFalling) {
      this.#updateFall(delta);
      return;
    }
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
    this.#removeBody();
  }

  // Every hit shakes the tree, except the one that reaches TREE_FELLING.hits, which fells it.
  // The tree does not give wood itself: whoever owns it does in onFelled (see Forest)
  #harvest(actorPosition: Readonly<Vector3Like>): void {
    if (this.#isFalling) return;
    this.#hits++;
    if (this.#hits < TREE_FELLING.hits) {
      this.shake(actorPosition);
      return;
    }
    this.#fell(actorPosition);
  }

  // Starts the fall away from `from`, pivoting on the base like the shake
  #fell(from: Readonly<Vector3Like>): void {
    const dx = this.object.position.x - from.x;
    const dz = this.object.position.z - from.z;
    const distance = Math.hypot(dx, dz);
    // Hit from the trunk's origin there is no direction: fall along +X
    this.#fallX = distance < 1e-3 ? 1 : dx / distance;
    this.#fallZ = distance < 1e-3 ? 0 : dz / distance;
    this.#fallStartX = this.#tiltX;
    this.#fallStartZ = this.#tiltZ;
    this.#fallTime = 0;
    this.#isFalling = true;
    this.#isShaking = false;
    this.#removeBody();
    this.#onFelled?.(this);
  }

  #updateFall(delta: number): void {
    this.#fallTime += delta;
    const duration = Math.max(TREE_FELLING.fallDuration, 1e-3);
    const progress = Math.min(this.#fallTime / duration, 1);
    const eased = fallEase(progress);
    this.#tiltX =
      this.#fallStartX * (1 - eased) + this.#fallX * FALL_ANGLE * eased;
    this.#tiltZ =
      this.#fallStartZ * (1 - eased) + this.#fallZ * FALL_ANGLE * eased;
    this.#applyTilt();
    if (progress < 1) return;

    // Removal is deferred by the entity manager, so update() is not called again
    this.destroy();
    this.#onFallen?.(this);
  }

  #removeBody(): void {
    if (!this.#body) return;
    PhysicsManager.world.removeRigidBody(this.#body);
    this.#body = null;
  }

  // Pushes the top away from `from`; repeated hits add up, limited by maxTilt
  shake(from: Readonly<Vector3Like>): void {
    if (this.#isFalling) return;
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

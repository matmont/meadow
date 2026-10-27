import RAPIER from "@dimforge/rapier3d-compat";
import { Box3, Vector3 } from "three";
import type { Vector3Like } from "three";
import { Entity } from "../Entity";
import LoaderManager from "../LoaderManager";
import type { ModelId } from "../LoaderManager";
import PhysicsManager from "../PhysicsManager";

const UP = new Vector3(0, 1, 0);

export interface StumpOptions {
  model?: ModelId;
  // Around the vertical axis, in radians
  rotation?: number;
  // On top of the model's asset scale
  scale?: number;
}

// What is left of a felled tree (see Forest). Static: no interaction for now
export default class Stump extends Entity {
  readonly #body: RAPIER.RigidBody;

  constructor(
    position: Vector3Like = { x: 0, y: 0, z: 0 },
    { model = "stumpOld", rotation = 0, scale = 1 }: StumpOptions = {},
  ) {
    super(LoaderManager.instantiate(model), {
      castShadow: true,
      receiveShadow: true,
    });
    this.object.position.copy(position);
    this.object.scale.multiplyScalar(scale);

    // Measured before rotating, as in Tree, so the box does not grow with the angle
    const size = new Box3().setFromObject(this.object).getSize(new Vector3());
    this.object.quaternion.setFromAxisAngle(UP, rotation);

    const world = PhysicsManager.world;
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        position.x,
        position.y + size.y / 2,
        position.z,
      ),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cylinder(size.y / 2, Math.min(size.x, size.z) / 2),
      this.#body,
    );
  }

  // Geometry and materials are shared by every clone of the model and owned by LoaderManager
  override dispose(): void {
    PhysicsManager.world.removeRigidBody(this.#body);
  }
}

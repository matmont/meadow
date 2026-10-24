import RAPIER from "@dimforge/rapier3d-compat";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import type { Object3D } from "three";
import { Entity } from "../../Entity";
import PhysicsManager from "../../PhysicsManager";
import AudioManager from "../../AudioManager";
import { COLORS } from "../../colors";
import Vegetation from "./Vegetation";

// Must stay well past the fog far distance in main.ts, so the edge is never visible
const PLANE_SIZE = 200;

// An endless meadow: a single flat plane that follows the player, which goes unnoticed
// because the ground has a uniform color, plus vegetation generated in chunks around it
export default class Ground extends Entity {
  readonly #followed: Object3D;
  readonly #plane: Mesh<PlaneGeometry, MeshStandardMaterial>;
  readonly #vegetation = new Vegetation();
  readonly #followedPosition = new Vector3();
  readonly #body: RAPIER.RigidBody;
  #soundtrack: number | null = null;

  constructor(followed: Object3D) {
    const plane = new Mesh(
      new PlaneGeometry(PLANE_SIZE, PLANE_SIZE),
      new MeshStandardMaterial({ color: COLORS.ground }),
    );
    plane.rotation.x = -Math.PI / 2;

    super(new Group().add(plane), { receiveShadow: true });
    this.#followed = followed;
    this.#plane = plane;
    this.object.add(this.#vegetation.object);

    // A half-space is an infinite plane, so the collider never has to move
    const world = PhysicsManager.world;
    this.#body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(
      new RAPIER.ColliderDesc(new RAPIER.HalfSpace({ x: 0, y: 1, z: 0 })),
      this.#body,
    );
  }

  override onAdded(): void {
    this.#soundtrack = AudioManager.play("gemWaltz", {
      loop: true,
      volume: 0.5,
    });
  }

  override update(): void {
    const position = this.#followed.getWorldPosition(this.#followedPosition);
    this.#plane.position.set(position.x, 0, position.z);
    this.#vegetation.update(position);
  }

  override onRemoved(): void {
    if (this.#soundtrack !== null) {
      AudioManager.stop("gemWaltz", this.#soundtrack);
      this.#soundtrack = null;
    }
  }

  override dispose(): void {
    this.#plane.geometry.dispose();
    this.#plane.material.dispose();
    this.#vegetation.dispose();
    PhysicsManager.world.removeRigidBody(this.#body);
  }
}

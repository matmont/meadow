import RAPIER from "@dimforge/rapier3d-compat";
import { Box3, Vector3 } from "three";
import type { Vector3Like } from "three";
import { Entity } from "../Entity";
import LoaderManager from "../LoaderManager";
import PhysicsManager from "../PhysicsManager";
import Interactable from "../interaction/Interactable";
import InteractionManager from "../interaction/InteractionManager";

// Reach beyond the trunk's collider, so the axe can hit it from where the player stops
const HARVEST_REACH = 1.2;

export default class Tree extends Entity {
  readonly #body: RAPIER.RigidBody;
  readonly #interactable: Interactable;

  constructor(position: Vector3Like = { x: 0, y: 0, z: 0 }) {
    super(LoaderManager.instantiate("treePine"), {
      castShadow: true,
      receiveShadow: true,
    });
    this.object.position.copy(position);

    const size = new Box3().setFromObject(this.object).getSize(new Vector3());
    const radius = Math.min(size.x, size.z);

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
      onAction: () => this.#harvest(),
    });
  }

  override onAdded(): void {
    InteractionManager.register(this.#interactable);
  }

  override onRemoved(): void {
    InteractionManager.unregister(this.#interactable);
  }

  // Geometrie e materiali sono condivisi tra tutte le copie del modello:
  // li gestisce il LoaderManager, non la singola entità.
  override dispose(): void {
    PhysicsManager.world.removeRigidBody(this.#body);
  }

  // What a hit does (wood, shaking, felling) is still to be decided
  #harvest(): void {
    console.log("harvest");
  }
}

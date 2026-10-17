import RAPIER from "@dimforge/rapier3d-compat";

const MAX_STEP = 1 / 30;

export default class PhysicsManager {
  static readonly GRAVITY: Readonly<RAPIER.Vector> = Object.freeze({
    x: 0,
    y: -9.81,
    z: 0,
  });

  static #world: RAPIER.World | null = null;

  private constructor() {}

  static async init(): Promise<void> {
    if (PhysicsManager.#world) return;
    await RAPIER.init();
    PhysicsManager.#world = new RAPIER.World(PhysicsManager.GRAVITY);
  }

  static get world(): RAPIER.World {
    if (!PhysicsManager.#world) {
      throw new Error(
        "Physics is not initialized. Await PhysicsManager.init() first.",
      );
    }
    return PhysicsManager.#world;
  }

  static get isInitialized(): boolean {
    return PhysicsManager.#world !== null;
  }

  static step(delta: number): void {
    const world = PhysicsManager.world;
    world.timestep = Math.min(delta, MAX_STEP);
    world.step();
  }

  static dispose(): void {
    PhysicsManager.#world?.free();
    PhysicsManager.#world = null;
  }
}

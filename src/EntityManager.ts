import type { Object3D } from "three";
import type { Entity } from "./Entity";

/** Qualsiasi classe che estende `Entity`, anche astratta. */
type EntityClass<T extends Entity> = abstract new (...args: never[]) => T;

export class EntityManager {
  readonly #root: Object3D;
  readonly #entities = new Map<number, Entity>();

  /** @param root Object to which attach entities (usually the Scene) */
  constructor(root: Object3D) {
    this.#root = root;
  }

  get size(): number {
    return this.#entities.size;
  }

  add<T extends Entity>(entity: T): T {
    if (this.#entities.has(entity.id)) return entity;

    this.#entities.set(entity.id, entity);
    this.#root.add(entity.object);
    entity.onAdded();
    entity.createDebugFolder();
    return entity;
  }

  remove(entity: Entity): boolean {
    if (!this.#entities.delete(entity.id)) return false;

    this.#root.remove(entity.object);
    entity.destroyDebugFolder();
    entity.onRemoved();
    entity.dispose();
    return true;
  }

  get(id: number): Entity | undefined {
    return this.#entities.get(id);
  }

  // TODO: check how this works
  /** Tutte le entità di un certo tipo, già tipizzate: `getAll(Enemy)` → `Enemy[]`. */
  getAll<T extends Entity>(type: EntityClass<T>): T[] {
    const result: T[] = [];
    for (const entity of this.#entities.values()) {
      if (entity instanceof type) result.push(entity);
    }
    return result;
  }

  update(delta: number, elapsed: number): void {
    for (const entity of this.#entities.values()) {
      if (!entity.isDestroyed) entity.update(delta, elapsed);
    }

    // Rimozione differita: un'entità può chiamare destroy() durante il proprio update
    for (const entity of this.#entities.values()) {
      if (entity.isDestroyed) this.remove(entity);
    }
  }

  clear(): void {
    for (const entity of this.#entities.values()) {
      this.remove(entity);
    }
  }

  dispose(): void {
    this.clear();
  }
}

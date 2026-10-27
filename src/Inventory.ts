import type GUI from "lil-gui";
import DebugManager from "./DebugManager";

export type ResourceId = "wood" | "stone" | "mushroom";

// Display order for anything that lists every resource (for example the HUD)
export const RESOURCE_IDS: readonly ResourceId[] = ["wood", "stone", "mushroom"];

// Counts of the resources gathered by the player during this session (not persisted).
// It owns the state: whoever gathers calls `add()`, the HUD reads `count()`. Counts are
// plain numbers, so they can be bound as primitives without per-frame allocations
export default class Inventory {
  readonly #counts: Record<ResourceId, number> = {
    wood: 0,
    stone: 0,
    mushroom: 0,
  };
  readonly #debugFolder: GUI | null;

  constructor() {
    // Lets the HUD counter be tested by hand with `?debug`, for resources no gameplay adds yet
    this.#debugFolder = DebugManager.createFolder("Inventory", (folder) => {
      for (const resource of RESOURCE_IDS) {
        folder
          .add({ add: () => this.add(resource) }, "add")
          .name(`add 1 ${resource}`);
      }
    });
  }

  add(resource: ResourceId, amount = 1): void {
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new RangeError(
        `Inventory amount must be a positive integer, got ${amount}`,
      );
    }
    this.#counts[resource] += amount;
  }

  count(resource: ResourceId): number {
    return this.#counts[resource];
  }

  // Only the debug folder needs disposing; must run before `DebugManager.dispose()`
  dispose(): void {
    this.#debugFolder?.destroy();
  }
}

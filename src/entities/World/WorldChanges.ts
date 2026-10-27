// Stable id of a generated object: layer name (for example "forest"), chunk coordinates
// and the object's index in the chunk's generation order. Also usable for hand-placed
// objects with their own layer (for example `worldKey("camp", 0, 0, 0)`).
// The numbers go after the last ":" and never contain one, so any layer name (even one
// with ":" or ",") gives distinct keys. Allocates a string: call it when a chunk loads or
// an object is removed, never per frame
export function worldKey(
  layer: string,
  chunkX: number,
  chunkZ: number,
  index: number,
): string {
  if (layer.length === 0) {
    throw new RangeError("World key layer must be a non-empty string");
  }
  if (
    !Number.isSafeInteger(chunkX) ||
    !Number.isSafeInteger(chunkZ) ||
    !Number.isSafeInteger(index) ||
    index < 0
  ) {
    throw new RangeError(
      `World key needs integer chunk coordinates and a non-negative integer index, got (${chunkX}, ${chunkZ}, ${index})`,
    );
  }
  return `${layer}:${chunkX},${chunkZ},${index}`;
}

// Changes the player made to generated objects, which would otherwise come back in their
// generated state when their chunk is reloaded. For now it records removals only (for
// example a felled tree), with the game time (the engine's `elapsed`, in seconds) when
// they happened. Regrowth policy belongs to the caller: it compares `elapsed - removedAt()`
// with its own delay and calls `restore()`. Session-only, not persisted
export default class WorldChanges {
  readonly #removedAt = new Map<string, number>();

  // Removing again overwrites the time
  markRemoved(key: string, time: number): void {
    if (!Number.isFinite(time) || time < 0) {
      throw new RangeError(
        `World change time must be a finite non-negative number, got ${time}`,
      );
    }
    this.#removedAt.set(key, time);
  }

  // Undefined while the object is in its generated state
  removedAt(key: string): number | undefined {
    return this.#removedAt.get(key);
  }

  // Back to the generated state (for example when a tree regrows)
  restore(key: string): void {
    this.#removedAt.delete(key);
  }
}

import type { Vector3Like } from "three";

export const CHUNK_SIZE = 32;
// Chunks loaded on each side of the player's chunk: (2 * radius + 1)² in total. With 32m
// chunks the loaded area reaches at least 64m from the player, past the fog in main.ts
export const CHUNK_RADIUS = 2;
export const CHUNK_COUNT = (CHUNK_RADIUS * 2 + 1) ** 2;
const WORLD_SEED = 0x3a17c9;

// Each generator passes its own salt, so two generators never share a random sequence
export function chunkSeed(chunkX: number, chunkZ: number, salt = 0): number {
  return (
    WORLD_SEED ^
    salt ^
    Math.imul(chunkX, 0x27d4eb2d) ^
    Math.imul(chunkZ, 0x165667b1)
  );
}

export interface ChunkHandlers<T> {
  load(chunkX: number, chunkZ: number): T;
  unload(chunk: T): void;
}

interface LoadedChunk<T> {
  readonly x: number;
  readonly z: number;
  readonly value: T;
}

// Keeps the chunks within CHUNK_RADIUS of a position loaded. The set is only recomputed when
// the position enters another chunk
export class ChunkGrid<T> {
  readonly #handlers: ChunkHandlers<T>;
  readonly #chunks = new Map<string, LoadedChunk<T>>();
  #centerX = NaN;
  #centerZ = NaN;

  constructor(handlers: ChunkHandlers<T>) {
    this.#handlers = handlers;
  }

  *values(): IterableIterator<T> {
    for (const chunk of this.#chunks.values()) yield chunk.value;
  }

  // Returns true when chunks were loaded or unloaded
  update(position: Vector3Like): boolean {
    const centerX = Math.floor(position.x / CHUNK_SIZE);
    const centerZ = Math.floor(position.z / CHUNK_SIZE);
    if (centerX === this.#centerX && centerZ === this.#centerZ) return false;
    this.#centerX = centerX;
    this.#centerZ = centerZ;

    for (const [key, chunk] of this.#chunks) {
      if (
        Math.abs(chunk.x - centerX) > CHUNK_RADIUS ||
        Math.abs(chunk.z - centerZ) > CHUNK_RADIUS
      ) {
        this.#chunks.delete(key);
        this.#handlers.unload(chunk.value);
      }
    }

    for (let x = centerX - CHUNK_RADIUS; x <= centerX + CHUNK_RADIUS; x++) {
      for (let z = centerZ - CHUNK_RADIUS; z <= centerZ + CHUNK_RADIUS; z++) {
        const key = `${x},${z}`;
        if (this.#chunks.has(key)) continue;
        this.#chunks.set(key, { x, z, value: this.#handlers.load(x, z) });
      }
    }
    return true;
  }

  clear(): void {
    for (const chunk of this.#chunks.values()) this.#handlers.unload(chunk.value);
    this.#chunks.clear();
    this.#centerX = NaN;
    this.#centerZ = NaN;
  }
}

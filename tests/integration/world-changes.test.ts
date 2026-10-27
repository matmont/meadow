import { describe, expect, it } from "vitest";
import WorldChanges, { worldKey } from "../../src/entities/World/WorldChanges";
import {
  CHUNK_RADIUS,
  CHUNK_SIZE,
  ChunkGrid,
  chunkSeed,
} from "../../src/entities/World/chunks";
import { createSeededRandom } from "../../src/entities/World/utils";

const LAYER = "forest";
const SALT = 0x51ab;
const OBJECTS_PER_CHUNK = 4;
// Far enough that the starting chunk leaves the loaded square around the player
const FAR_AWAY = (CHUNK_RADIUS + 2) * CHUNK_SIZE;

interface GeneratedObject {
  readonly key: string;
  readonly index: number;
  readonly x: number;
  readonly z: number;
}

interface Chunk {
  readonly x: number;
  readonly z: number;
  readonly objects: readonly GeneratedObject[];
}

// Simulates the intended use: a layer generates its objects deterministically per chunk,
// always drawing every candidate so indices stay stable, and skips the ones the registry
// marks as removed. The regrowth policy lives here, in the caller: an object whose removal
// is at least `regrowDelay` old is restored and generated again
function createLayer(changes: WorldChanges): {
  grid: ChunkGrid<Chunk>;
  clock: { elapsed: number; regrowDelay: number };
  loads: { x: number; z: number }[];
} {
  const clock = { elapsed: 0, regrowDelay: Number.POSITIVE_INFINITY };
  const loads: { x: number; z: number }[] = [];
  const grid = new ChunkGrid<Chunk>({
    load(chunkX, chunkZ) {
      loads.push({ x: chunkX, z: chunkZ });
      const random = createSeededRandom(chunkSeed(chunkX, chunkZ, SALT));
      const objects: GeneratedObject[] = [];
      for (let index = 0; index < OBJECTS_PER_CHUNK; index++) {
        const x = (chunkX + random()) * CHUNK_SIZE;
        const z = (chunkZ + random()) * CHUNK_SIZE;
        const key = worldKey(LAYER, chunkX, chunkZ, index);
        const removedAt = changes.removedAt(key);
        if (removedAt !== undefined) {
          if (clock.elapsed - removedAt < clock.regrowDelay) continue;
          changes.restore(key);
        }
        objects.push({ key, index, x, z });
      }
      return { x: chunkX, z: chunkZ, objects };
    },
    unload() {},
  });
  return { grid, clock, loads };
}

function at(x: number, z: number): { x: number; y: number; z: number } {
  return { x, y: 0, z };
}

function findChunk(grid: ChunkGrid<Chunk>, x: number, z: number): Chunk {
  const chunk = [...grid.values()].find((c) => c.x === x && c.z === z);
  if (!chunk) throw new Error(`Chunk ${x},${z} is not loaded`);
  return chunk;
}

function indices(chunk: Chunk): number[] {
  return chunk.objects.map((object) => object.index);
}

// Moves the player away until chunk (0, 0) unloads, then back, and returns its new content
function reload(grid: ChunkGrid<Chunk>): Chunk {
  grid.update(at(FAR_AWAY, FAR_AWAY));
  expect([...grid.values()].some((c) => c.x === 0 && c.z === 0)).toBe(false);
  grid.update(at(1, 1));
  return findChunk(grid, 0, 0);
}

describe("WorldChanges with ChunkGrid", () => {
  it("generates every object while nothing is removed", () => {
    const { grid } = createLayer(new WorldChanges());
    grid.update(at(1, 1));
    expect(indices(findChunk(grid, 0, 0))).toEqual([0, 1, 2, 3]);
  });

  it("keeps a removed object out after its chunk is unloaded and reloaded", () => {
    const changes = new WorldChanges();
    const { grid, clock, loads } = createLayer(changes);
    grid.update(at(1, 1));
    const before = findChunk(grid, 0, 0);

    clock.elapsed = 12;
    changes.markRemoved(before.objects[1].key, clock.elapsed);
    const after = reload(grid);

    // The chunk was really generated again, not kept in memory
    expect(after).not.toBe(before);
    expect(loads.filter((c) => c.x === 0 && c.z === 0)).toHaveLength(2);
    expect(indices(after)).toEqual([0, 2, 3]);
    // The other objects keep their generated positions
    expect(after.objects).toEqual(
      before.objects.filter((object) => object.index !== 1),
    );
  });

  it("only affects the removed object's chunk", () => {
    const changes = new WorldChanges();
    const { grid } = createLayer(changes);
    grid.update(at(1, 1));
    changes.markRemoved(worldKey(LAYER, 0, 0, 0), 0);
    reload(grid);

    expect(indices(findChunk(grid, 0, 0))).toEqual([1, 2, 3]);
    expect(indices(findChunk(grid, -1, -1))).toEqual([0, 1, 2, 3]);
    expect(indices(findChunk(grid, 1, 0))).toEqual([0, 1, 2, 3]);
  });

  it("brings a restored object back on the next load", () => {
    const changes = new WorldChanges();
    const { grid } = createLayer(changes);
    grid.update(at(1, 1));
    const original = findChunk(grid, 0, 0);
    const key = original.objects[2].key;

    changes.markRemoved(key, 5);
    expect(indices(reload(grid))).toEqual([0, 1, 3]);

    changes.restore(key);
    const restored = reload(grid);
    expect(restored.objects).toEqual(original.objects);
  });

  it("works with chunks at negative coordinates", () => {
    const changes = new WorldChanges();
    const { grid } = createLayer(changes);
    const home = at(-3 * CHUNK_SIZE + 1, -2 * CHUNK_SIZE + 1);
    grid.update(home);
    changes.markRemoved(worldKey(LAYER, -3, -2, 3), 0);

    grid.update(at(FAR_AWAY, FAR_AWAY));
    grid.update(home);
    expect(indices(findChunk(grid, -3, -2))).toEqual([0, 1, 2]);
    // Mirrored coordinates are a different chunk
    expect(indices(findChunk(grid, -2, -3))).toEqual([0, 1, 2, 3]);
  });

  it("lets the caller regrow an object once its own delay has passed", () => {
    const changes = new WorldChanges();
    const { grid, clock } = createLayer(changes);
    clock.regrowDelay = 60;
    grid.update(at(1, 1));
    const key = worldKey(LAYER, 0, 0, 1);

    clock.elapsed = 100;
    changes.markRemoved(key, clock.elapsed);

    clock.elapsed = 159.5;
    expect(indices(reload(grid))).toEqual([0, 2, 3]);
    expect(changes.removedAt(key)).toBe(100);

    clock.elapsed = 160;
    expect(indices(reload(grid))).toEqual([0, 1, 2, 3]);
    expect(changes.removedAt(key)).toBeUndefined();
  });

  it("applies a changed delay to removals that already happened", () => {
    const changes = new WorldChanges();
    const { grid, clock } = createLayer(changes);
    clock.regrowDelay = 300;
    grid.update(at(1, 1));
    const key = worldKey(LAYER, 0, 0, 0);

    clock.elapsed = 10;
    changes.markRemoved(key, clock.elapsed);

    clock.elapsed = 40;
    expect(indices(reload(grid))).toEqual([1, 2, 3]);

    clock.regrowDelay = 30;
    expect(indices(reload(grid))).toEqual([0, 1, 2, 3]);
  });

  it("restarts the regrowth wait when an object is removed again", () => {
    const changes = new WorldChanges();
    const { grid, clock } = createLayer(changes);
    clock.regrowDelay = 50;
    grid.update(at(1, 1));
    const key = worldKey(LAYER, 0, 0, 2);

    changes.markRemoved(key, 0);
    clock.elapsed = 40;
    changes.markRemoved(key, clock.elapsed);

    clock.elapsed = 60;
    expect(indices(reload(grid))).toEqual([0, 1, 3]);
    clock.elapsed = 90;
    expect(indices(reload(grid))).toEqual([0, 1, 2, 3]);
  });

  it("starts from the generated world with a new registry, as after a page reload", () => {
    const changes = new WorldChanges();
    const first = createLayer(changes);
    first.grid.update(at(1, 1));
    changes.markRemoved(worldKey(LAYER, 0, 0, 0), 0);
    expect(indices(reload(first.grid))).toEqual([1, 2, 3]);

    const second = createLayer(new WorldChanges());
    second.grid.update(at(1, 1));
    expect(indices(findChunk(second.grid, 0, 0))).toEqual([0, 1, 2, 3]);
  });
});

import { describe, expect, it } from "vitest";
import {
  CHUNK_COUNT,
  CHUNK_RADIUS,
  CHUNK_SIZE,
  ChunkGrid,
  chunkSeed,
} from "../chunks";

interface TestChunk {
  readonly x: number;
  readonly z: number;
}

// Records every load and unload, so tests can check exactly which chunks changed
function createGrid(): {
  grid: ChunkGrid<TestChunk>;
  loaded: TestChunk[];
  unloaded: TestChunk[];
} {
  const loaded: TestChunk[] = [];
  const unloaded: TestChunk[] = [];
  const grid = new ChunkGrid<TestChunk>({
    load(x, z) {
      const chunk = { x, z };
      loaded.push(chunk);
      return chunk;
    },
    unload(chunk) {
      unloaded.push(chunk);
    },
  });
  return { grid, loaded, unloaded };
}

function keys(chunks: Iterable<TestChunk>): string[] {
  return [...chunks].map(({ x, z }) => `${x},${z}`).sort();
}

function expectedKeys(centerX: number, centerZ: number): string[] {
  const result: string[] = [];
  for (let x = centerX - CHUNK_RADIUS; x <= centerX + CHUNK_RADIUS; x++) {
    for (let z = centerZ - CHUNK_RADIUS; z <= centerZ + CHUNK_RADIUS; z++) {
      result.push(`${x},${z}`);
    }
  }
  return result.sort();
}

describe("chunkSeed", () => {
  it("is deterministic", () => {
    expect(chunkSeed(3, -5)).toBe(chunkSeed(3, -5));
    expect(chunkSeed(3, -5, 0x1234)).toBe(chunkSeed(3, -5, 0x1234));
  });

  it("defaults the salt to 0", () => {
    expect(chunkSeed(3, -5)).toBe(chunkSeed(3, -5, 0));
  });

  it("gives different seeds to neighboring chunks", () => {
    const seed = chunkSeed(0, 0);
    for (const [x, z] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      expect(chunkSeed(x, z)).not.toBe(seed);
    }
  });

  // Known issue: chunkSeed(x, z) === chunkSeed(-x, -z) for many chunks (for example
  // (1, 1) and (-1, -1), both loaded around the spawn point), so those chunks get the same
  // layout. Remove `.fails` once the hash is fixed
  it.fails("gives different seeds to every chunk around the origin", () => {
    const seeds = new Set<number>();
    for (let x = -4; x <= 4; x++) {
      for (let z = -4; z <= 4; z++) seeds.add(chunkSeed(x, z));
    }
    expect(seeds.size).toBe(81);
  });

  it("does not swap the axes", () => {
    expect(chunkSeed(1, 2)).not.toBe(chunkSeed(2, 1));
  });

  it("separates generators with different salts", () => {
    expect(chunkSeed(0, 0, 1)).not.toBe(chunkSeed(0, 0, 2));
    expect(chunkSeed(4, 7, 0xabc)).not.toBe(chunkSeed(4, 7));
  });
});

describe("ChunkGrid", () => {
  it("loads every chunk within the radius on the first update", () => {
    const { grid, loaded, unloaded } = createGrid();

    expect(grid.update({ x: 0, y: 0, z: 0 })).toBe(true);

    expect(loaded).toHaveLength(CHUNK_COUNT);
    expect(unloaded).toHaveLength(0);
    expect(keys(grid.values())).toEqual(expectedKeys(0, 0));
  });

  it("does nothing while the position stays in the same chunk", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: 1, y: 0, z: 1 });

    expect(grid.update({ x: CHUNK_SIZE - 0.01, y: 5, z: 10 })).toBe(false);

    expect(loaded).toHaveLength(CHUNK_COUNT);
    expect(unloaded).toHaveLength(0);
  });

  it("floors negative coordinates into the chunk below", () => {
    const { grid } = createGrid();

    grid.update({ x: -0.01, y: 0, z: -CHUNK_SIZE - 0.01 });

    expect(keys(grid.values())).toEqual(expectedKeys(-1, -2));
  });

  it("loads only the new row and unloads only the old one when moving one chunk", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    loaded.length = 0;

    expect(grid.update({ x: CHUNK_SIZE, y: 0, z: 0 })).toBe(true);

    const side = CHUNK_RADIUS * 2 + 1;
    expect(loaded).toHaveLength(side);
    expect(loaded.every((chunk) => chunk.x === CHUNK_RADIUS + 1)).toBe(true);
    expect(unloaded).toHaveLength(side);
    expect(unloaded.every((chunk) => chunk.x === -CHUNK_RADIUS)).toBe(true);
    expect(keys(grid.values())).toEqual(expectedKeys(1, 0));
  });

  it("replaces every chunk after a jump farther than the loaded area", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    const first = [...grid.values()];
    loaded.length = 0;

    grid.update({ x: CHUNK_SIZE * 100, y: 0, z: 0 });

    expect(loaded).toHaveLength(CHUNK_COUNT);
    expect(keys(unloaded)).toEqual(keys(first));
    expect(keys(grid.values())).toEqual(expectedKeys(100, 0));
  });

  it("keeps the loaded values when returning to a chunk still in range", () => {
    const { grid } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    const origin = [...grid.values()].find((c) => c.x === 0 && c.z === 0);

    grid.update({ x: CHUNK_SIZE, y: 0, z: 0 });
    grid.update({ x: 0, y: 0, z: 0 });

    expect([...grid.values()]).toContain(origin);
  });

  it("unloads everything on clear() and reloads on the next update", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });

    grid.clear();

    expect(unloaded).toHaveLength(CHUNK_COUNT);
    expect([...grid.values()]).toHaveLength(0);

    // The center is reset too, so the same position loads the chunks again
    loaded.length = 0;
    expect(grid.update({ x: 0, y: 0, z: 0 })).toBe(true);
    expect(loaded).toHaveLength(CHUNK_COUNT);
  });
});

describe("chunkSeed range", () => {
  it("returns a 32-bit integer usable as a PRNG seed", () => {
    for (const [x, z] of [
      [0, 0],
      [1, -1],
      [-1000, 1000],
      [123456, -654321],
    ] as const) {
      const seed = chunkSeed(x, z, 0x7fffffff);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(-(2 ** 31));
      expect(seed).toBeLessThan(2 ** 31);
    }
  });

  it("gives the same chunk a different seed for every salt", () => {
    const seeds = new Set<number>();
    for (let salt = 0; salt < 64; salt++) seeds.add(chunkSeed(2, -3, salt));
    expect(seeds.size).toBe(64);
  });
});

describe("ChunkGrid edge cases", () => {
  const side = CHUNK_RADIUS * 2 + 1;

  it("has no values before the first update", () => {
    const { grid, loaded } = createGrid();

    expect([...grid.values()]).toHaveLength(0);
    expect(loaded).toHaveLength(0);
  });

  it("puts a position exactly on a negative chunk border in that chunk", () => {
    const { grid } = createGrid();

    grid.update({ x: -CHUNK_SIZE, y: 0, z: -2 * CHUNK_SIZE });

    expect(keys(grid.values())).toEqual(expectedKeys(-1, -2));
  });

  it("treats -0 like 0", () => {
    const { grid } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });

    expect(grid.update({ x: -0, y: 0, z: -0 })).toBe(false);
  });

  it("does nothing while moving inside a negative chunk", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: -0.01, y: 0, z: -0.01 });

    expect(grid.update({ x: -CHUNK_SIZE + 0.01, y: 0, z: -CHUNK_SIZE })).toBe(
      false,
    );

    expect(loaded).toHaveLength(CHUNK_COUNT);
    expect(unloaded).toHaveLength(0);
    expect(keys(grid.values())).toEqual(expectedKeys(-1, -1));
  });

  it("ignores the height of the position", () => {
    const { grid } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });

    expect(grid.update({ x: 0, y: -1000, z: 0 })).toBe(false);
    expect(grid.update({ x: 0, y: 1000, z: 0 })).toBe(false);
  });

  it("loads only integer chunk coordinates for fractional positions", () => {
    const { grid, loaded } = createGrid();

    grid.update({ x: 47.3, y: 0, z: -80.9 });

    expect(
      loaded.every(
        (chunk) => Number.isInteger(chunk.x) && Number.isInteger(chunk.z),
      ),
    ).toBe(true);
    expect(keys(grid.values())).toEqual(expectedKeys(1, -3));
  });

  it("swaps only an L-shaped edge when moving one chunk diagonally", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    loaded.length = 0;

    expect(grid.update({ x: -1, y: 0, z: -1 })).toBe(true);

    const edge = -CHUNK_RADIUS - 1;
    expect(loaded).toHaveLength(side * 2 - 1);
    expect(loaded.every((c) => c.x === edge || c.z === edge)).toBe(true);
    expect(unloaded).toHaveLength(side * 2 - 1);
    expect(
      unloaded.every((c) => c.x === CHUNK_RADIUS || c.z === CHUNK_RADIUS),
    ).toBe(true);
    expect(keys(grid.values())).toEqual(expectedKeys(-1, -1));
  });

  it("swaps several rows when moving several chunks in one update", () => {
    const { grid, loaded, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    loaded.length = 0;
    const steps = 2;

    expect(grid.update({ x: 0, y: 0, z: steps * CHUNK_SIZE })).toBe(true);

    expect(loaded).toHaveLength(side * steps);
    expect(loaded.every((c) => c.z > CHUNK_RADIUS)).toBe(true);
    expect(unloaded).toHaveLength(side * steps);
    expect(unloaded.every((c) => c.z < steps - CHUNK_RADIUS)).toBe(true);
    expect(keys(grid.values())).toEqual(expectedKeys(0, steps));
  });

  it("passes unload the exact value that load returned for that chunk", () => {
    const { grid, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    const leaving = [...grid.values()].filter((c) => c.x === -CHUNK_RADIUS);

    grid.update({ x: CHUNK_SIZE, y: 0, z: 0 });

    expect(unloaded).toHaveLength(leaving.length);
    for (const chunk of leaving) expect(unloaded).toContain(chunk);
  });

  it("keeps the same value objects for every chunk that stays in range", () => {
    const { grid } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    const staying = [...grid.values()].filter((c) => c.x > -CHUNK_RADIUS);

    grid.update({ x: CHUNK_SIZE, y: 0, z: 0 });

    const after = [...grid.values()];
    for (const chunk of staying) expect(after).toContain(chunk);
  });

  it("never holds a chunk twice while moving back and forth", () => {
    const { grid, loaded, unloaded } = createGrid();

    for (const step of [0, 1, 3, 2, -2, -1, 0, 5, 4]) {
      grid.update({ x: step * CHUNK_SIZE, y: 0, z: -step * CHUNK_SIZE });
      expect(loaded.length - unloaded.length).toBe(CHUNK_COUNT);
      expect(new Set(keys(grid.values())).size).toBe(CHUNK_COUNT);
    }
    expect(keys(grid.values())).toEqual(expectedKeys(4, -4));
  });

  it("does not call unload when clear() runs before the first update", () => {
    const { grid, unloaded } = createGrid();

    grid.clear();

    expect(unloaded).toHaveLength(0);
  });

  it("unloads each chunk only once when clear() runs twice", () => {
    const { grid, unloaded } = createGrid();
    grid.update({ x: 0, y: 0, z: 0 });
    const values = [...grid.values()];

    grid.clear();
    grid.clear();

    expect(unloaded).toHaveLength(CHUNK_COUNT);
    for (const chunk of values) expect(unloaded).toContain(chunk);
  });
});

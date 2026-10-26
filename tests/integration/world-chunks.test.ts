import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, ChunkGrid, chunkSeed } from "../../src/entities/World/chunks";
import {
  createSeededRandom,
  scatterModels,
} from "../../src/entities/World/utils";
import type { Placement, ScatterOptions } from "../../src/entities/World/utils";

const OPTIONS: ScatterOptions = {
  models: ["grass", "flowerPurple", "flowerYellow"],
  count: 12,
  exclusionRadius: 3,
  minScale: 0.5,
  maxScale: 1.5,
};

interface Chunk {
  readonly x: number;
  readonly z: number;
  readonly placements: readonly Placement[];
}

// Generates chunks the way the world entities do: a seeded random source per chunk feeds
// scatterModels, so a chunk's content depends only on its coordinates
function createWorld(): { grid: ChunkGrid<Chunk>; unloaded: Chunk[] } {
  const unloaded: Chunk[] = [];
  const grid = new ChunkGrid<Chunk>({
    load(x, z) {
      const random = createSeededRandom(chunkSeed(x, z));
      const area = { x: x * CHUNK_SIZE, z: z * CHUNK_SIZE, size: CHUNK_SIZE };
      return { x, z, placements: scatterModels(area, OPTIONS, random) };
    },
    unload(chunk) {
      unloaded.push(chunk);
    },
  });
  return { grid, unloaded };
}

function findChunk(grid: ChunkGrid<Chunk>, x: number, z: number): Chunk {
  const chunk = [...grid.values()].find((c) => c.x === x && c.z === z);
  if (!chunk) throw new Error(`Chunk ${x},${z} is not loaded`);
  return chunk;
}

function snapshot(chunk: Chunk): { model: string; elements: number[] }[] {
  return chunk.placements.map(({ model, matrix }) => ({
    model,
    elements: [...matrix.elements],
  }));
}

describe("chunked world generation", () => {
  it("regenerates the same placements when a chunk is loaded again", () => {
    const { grid, unloaded } = createWorld();
    grid.update({ x: 0, y: 0, z: 0 });
    const before = snapshot(findChunk(grid, 2, -1));

    grid.update({ x: CHUNK_SIZE * 10, y: 0, z: 0 });
    expect(unloaded.some((c) => c.x === 2 && c.z === -1)).toBe(true);
    grid.update({ x: 0, y: 0, z: 0 });

    const after = findChunk(grid, 2, -1);
    expect(snapshot(after)).toEqual(before);
  });

  it("keeps every placement inside its own chunk and out of the spawn area", () => {
    const { grid } = createWorld();
    grid.update({ x: 0, y: 0, z: 0 });
    const position = new Vector3();

    for (const chunk of grid.values()) {
      expect(chunk.placements).toHaveLength(OPTIONS.count);
      for (const { matrix } of chunk.placements) {
        position.setFromMatrixPosition(matrix);
        expect(Math.floor(position.x / CHUNK_SIZE)).toBe(chunk.x);
        expect(Math.floor(position.z / CHUNK_SIZE)).toBe(chunk.z);
        expect(Math.hypot(position.x, position.z)).toBeGreaterThanOrEqual(
          OPTIONS.exclusionRadius,
        );
      }
    }
  });

  it("gives neighboring chunks different layouts", () => {
    const { grid } = createWorld();
    grid.update({ x: 0, y: 0, z: 0 });

    const origin = snapshot(findChunk(grid, 0, 0));
    const offset = snapshot(findChunk(grid, 1, 0));
    // Compare positions relative to each chunk's corner, so only the layout matters
    const relative = (chunk: ReturnType<typeof snapshot>, dx: number) =>
      chunk.map(({ elements }) => [elements[12]! - dx, elements[14]!]);

    expect(relative(offset, CHUNK_SIZE)).not.toEqual(relative(origin, 0));
  });
});

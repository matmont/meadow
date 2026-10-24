import { Group, InstancedMesh, Matrix4, Mesh } from "three";
import type { Vector3Like } from "three";
import LoaderManager from "../../LoaderManager";
import type { ModelId } from "../../LoaderManager";
import { createSeededRandom, scatterModels } from "./utils";
import type { Placement, ScatterOptions } from "./utils";

const CHUNK_SIZE = 32;
// Chunks loaded on each side of the player's chunk: (2 * radius + 1)² in total. With 32m
// chunks the loaded area reaches at least 64m from the player, past the fog in main.ts
const CHUNK_RADIUS = 2;
const CHUNK_COUNT = (CHUNK_RADIUS * 2 + 1) ** 2;
const WORLD_SEED = 0x3a17c9;

const FLOWER_MODELS = [
  "flowerPurple",
  "flowerPurpleB",
  "flowerPurpleC",
  "flowerYellow",
  "flowerYellowB",
  "flowerYellowC",
  "flowerRed",
  "flowerRedB",
  "flowerRedC",
] as const satisfies readonly ModelId[];

// Scattered in every chunk, in this order
const LAYERS: readonly ScatterOptions[] = [
  {
    models: ["grass"],
    count: 8,
    exclusionRadius: 3,
    minScale: 0.6,
    maxScale: 1.15,
  },
  {
    models: FLOWER_MODELS,
    count: 4,
    exclusionRadius: 3,
    minScale: 0.65,
    maxScale: 1.2,
  },
];

interface Chunk {
  readonly x: number;
  readonly z: number;
  readonly placements: readonly Placement[];
}

// One instanced draw call for each mesh of a model. `offset` is the mesh transform inside
// the model, applied on top of each placement
interface Batch {
  readonly mesh: InstancedMesh;
  readonly offset: Matrix4;
}

// Grass and flowers generated in square chunks around a position. A chunk's content depends
// only on its coordinates, so coming back to a place shows the same plants. Chunks only hold
// placements: every plant of the same model is drawn by the same InstancedMesh
export default class Vegetation {
  readonly object = new Group();
  readonly #batches = new Map<ModelId, Batch[]>();
  readonly #chunks = new Map<string, Chunk>();
  readonly #instanceMatrix = new Matrix4();
  #centerX = NaN;
  #centerZ = NaN;

  constructor() {
    this.object.name = "vegetation";

    for (const layer of LAYERS) {
      for (const model of layer.models) {
        // A model can never have more copies than its layer places in every loaded chunk
        const batches = createBatches(model, layer.count * CHUNK_COUNT);
        this.#batches.set(model, batches);
        for (const { mesh } of batches) this.object.add(mesh);
      }
    }
  }

  update(position: Vector3Like): void {
    const centerX = Math.floor(position.x / CHUNK_SIZE);
    const centerZ = Math.floor(position.z / CHUNK_SIZE);
    if (centerX === this.#centerX && centerZ === this.#centerZ) return;
    this.#centerX = centerX;
    this.#centerZ = centerZ;

    for (const [key, chunk] of this.#chunks) {
      if (
        Math.abs(chunk.x - centerX) > CHUNK_RADIUS ||
        Math.abs(chunk.z - centerZ) > CHUNK_RADIUS
      ) {
        this.#chunks.delete(key);
      }
    }

    for (let x = centerX - CHUNK_RADIUS; x <= centerX + CHUNK_RADIUS; x++) {
      for (let z = centerZ - CHUNK_RADIUS; z <= centerZ + CHUNK_RADIUS; z++) {
        const key = `${x},${z}`;
        if (this.#chunks.has(key)) continue;
        this.#chunks.set(key, { x, z, placements: createPlacements(x, z) });
      }
    }

    this.#writeInstances();
  }

  dispose(): void {
    // Frees only the instance buffers: geometries and materials belong to the cached models
    for (const batches of this.#batches.values()) {
      for (const { mesh } of batches) mesh.dispose();
    }
  }

  // Rewrites every instance from the loaded chunks. It only runs when the player changes
  // chunk, and a few hundred matrices are cheaper than tracking free slots per chunk
  #writeInstances(): void {
    for (const batches of this.#batches.values()) {
      for (const { mesh } of batches) mesh.count = 0;
    }

    for (const chunk of this.#chunks.values()) {
      for (const { model, matrix } of chunk.placements) {
        for (const { mesh, offset } of this.#batches.get(model)!) {
          this.#instanceMatrix.multiplyMatrices(matrix, offset);
          mesh.setMatrixAt(mesh.count++, this.#instanceMatrix);
        }
      }
    }

    for (const batches of this.#batches.values()) {
      for (const { mesh } of batches) {
        mesh.instanceMatrix.needsUpdate = true;
        // Frustum culling uses a sphere around all instances, which moved
        mesh.computeBoundingSphere();
      }
    }
  }
}

function createBatches(model: ModelId, capacity: number): Batch[] {
  // The template is never added to the scene: it only provides the meshes of the model,
  // their shared geometry and material, and their transform including the model scale
  const template = LoaderManager.instantiate(model);
  template.updateMatrixWorld(true);

  const batches: Batch[] = [];
  template.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const mesh = new InstancedMesh(child.geometry, child.material, capacity);
    mesh.name = `${model}-${child.name}`;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    batches.push({ mesh, offset: child.matrixWorld.clone() });
  });
  return batches;
}

function createPlacements(chunkX: number, chunkZ: number): Placement[] {
  const random = createSeededRandom(chunkSeed(chunkX, chunkZ));
  const area = {
    x: chunkX * CHUNK_SIZE,
    z: chunkZ * CHUNK_SIZE,
    size: CHUNK_SIZE,
  };
  return LAYERS.flatMap((layer) => scatterModels(area, layer, random));
}

function chunkSeed(chunkX: number, chunkZ: number): number {
  return (
    WORLD_SEED ^ Math.imul(chunkX, 0x27d4eb2d) ^ Math.imul(chunkZ, 0x165667b1)
  );
}

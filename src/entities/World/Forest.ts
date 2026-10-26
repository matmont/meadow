import type { Object3D } from "three";
import { Vector3 } from "three";
import type GUI from "lil-gui";
import { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type { ModelId } from "../../LoaderManager";
import Tree, { TREE_SHAKE } from "../Tree";
import { CHUNK_SIZE, ChunkGrid, chunkSeed } from "./chunks";
import { createSeededRandom } from "./utils";

const FOREST_SALT = 0x7f4a7c15;

const TREE_MODELS = [
  "treePine",
  "treePineB",
  "treePineC",
  "treePineE",
  "treePineTall",
  "treeDefault",
  "treeOak",
] as const satisfies readonly ModelId[];

const TREES_PER_CHUNK = 3;
// Minimum distance between two trunks. Trees are kept half of it away from the chunk edges,
// so the spacing also holds across neighbouring chunks
const MIN_SPACING = 6;
// Keeps the camp at the world origin clear: the spawn point, the campfire and the tree
// placed by hand in main.ts
const EXCLUSION_RADIUS = 10;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.25;
// A candidate too close to another tree is drawn again, up to this many times
const MAX_ATTEMPTS = 8;

// Trees generated in chunks around the followed object, like grass and flowers in
// Vegetation. Unlike plants, each tree is a full Tree entity with its collider and
// interaction, so the forest adds and destroys them through the entity manager
export default class Forest extends Entity {
  readonly #followed: Object3D;
  readonly #entities: EntityManager;
  readonly #followedPosition = new Vector3();
  readonly #chunks: ChunkGrid<readonly Tree[]>;

  constructor(followed: Object3D, entities: EntityManager) {
    super();
    this.object.name = "forest";
    this.#followed = followed;
    this.#entities = entities;
    this.#chunks = new ChunkGrid({
      load: (chunkX, chunkZ) => this.#loadChunk(chunkX, chunkZ),
      // Removal is deferred by the entity manager, after the update pass
      unload: (trees) => {
        for (const tree of trees) tree.destroy();
      },
    });
  }

  override update(): void {
    this.#chunks.update(this.#followed.getWorldPosition(this.#followedPosition));
  }

  override onRemoved(): void {
    this.#chunks.clear();
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(TREE_SHAKE, "frequency", 0.5, 6, 0.1).name("shake frequency");
    folder.add(TREE_SHAKE, "damping", 0.02, 1, 0.01).name("shake damping");
    folder.add(TREE_SHAKE, "impulse", 0, 4, 0.05).name("hit impulse");
    folder.add(TREE_SHAKE, "maxTilt", 0, 0.5, 0.01).name("max tilt");
    // Hits every tree from the camera side, so they lean away from the viewer
    const actions = {
      shakeAll: (): void => {
        for (const tree of this.#entities.getAll(Tree)) {
          const { x, y, z } = tree.object.position;
          tree.shake({ x, y, z: z + 1 });
        }
      },
    };
    folder.add(actions, "shakeAll").name("shake all trees");
  }

  #loadChunk(chunkX: number, chunkZ: number): Tree[] {
    const random = createSeededRandom(chunkSeed(chunkX, chunkZ, FOREST_SALT));
    const margin = MIN_SPACING / 2;
    const span = CHUNK_SIZE - MIN_SPACING;
    const minX = chunkX * CHUNK_SIZE + margin;
    const minZ = chunkZ * CHUNK_SIZE + margin;

    const trees: Tree[] = [];
    for (let index = 0; index < TREES_PER_CHUNK; index++) {
      // Every random value is drawn even when the candidate is rejected, so the sequence,
      // and with it the chunk's content, does not depend on which candidates fail
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const x = minX + random() * span;
        const z = minZ + random() * span;
        const model = TREE_MODELS[Math.floor(random() * TREE_MODELS.length)]!;
        const rotation = random() * Math.PI * 2;
        const scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * random();
        if (!isFree(x, z, trees)) continue;

        const tree = new Tree({ x, y: 0, z }, { model, rotation, scale });
        trees.push(this.#entities.add(tree));
        break;
      }
    }
    return trees;
  }
}

function isFree(x: number, z: number, trees: readonly Tree[]): boolean {
  if (x * x + z * z < EXCLUSION_RADIUS ** 2) return false;
  for (const { object } of trees) {
    if (Math.hypot(object.position.x - x, object.position.z - z) < MIN_SPACING) {
      return false;
    }
  }
  return true;
}

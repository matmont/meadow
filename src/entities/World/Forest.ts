import type { Object3D } from "three";
import { Vector3 } from "three";
import type GUI from "lil-gui";
import { Entity } from "../../Entity";
import type { EntityManager } from "../../EntityManager";
import type Inventory from "../../Inventory";
import type { ModelId } from "../../LoaderManager";
import type WorldChanges from "./WorldChanges";
import { worldKey } from "./WorldChanges";
import Stump from "../Stump";
import Tree, {
  TREE_FELLING,
  TREE_REGROWTH,
  TREE_SHAKE,
  treeColliderRadius,
} from "../Tree";
import { CHUNK_SIZE, ChunkGrid, chunkSeed } from "./chunks";
import { createSeededRandom } from "./utils";

const FOREST_SALT = 0x7f4a7c15;
const FOREST_LAYER = "forest";
const CAMP_LAYER = "camp";

const TREE_MODELS = [
  "treePine",
  "treePineB",
  "treePineC",
  "treePineE",
  "treePineTall",
  "treeDefault",
  "treeOak",
] as const satisfies readonly ModelId[];
type TreeModel = (typeof TREE_MODELS)[number];

// The stump left by each tree model. `scale` fits the stump to the trunk's width, on top of
// the tree's own scale: the stump models are about as wide as the oak's trunk
const STUMPS: Record<TreeModel, { model: ModelId; scale: number }> = {
  treePine: { model: "stumpOld", scale: 0.6 },
  treePineB: { model: "stumpOld", scale: 0.7 },
  treePineC: { model: "stumpOld", scale: 0.7 },
  treePineE: { model: "stumpOld", scale: 0.7 },
  treePineTall: { model: "stumpOld", scale: 0.5 },
  treeDefault: { model: "stumpRound", scale: 0.9 },
  treeOak: { model: "stumpRound", scale: 1.2 },
};

const TREES_PER_CHUNK = 3;
// Minimum distance between two trunks. Trees are kept half of it away from the chunk edges,
// so the spacing also holds across neighbouring chunks
const MIN_SPACING = 6;
// Keeps the camp at the world origin clear of random trees: the spawn point, the campfire
// and the camp trees below
const EXCLUSION_RADIUS = 10;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.25;
// A candidate too close to another tree is drawn again, up to this many times
const MAX_ATTEMPTS = 8;
// Clearance kept between the followed object and the collider of a regrowing tree: the
// player's capsule radius plus some slack, so the new collider never traps it
const REGROWTH_MARGIN = 0.5;

// Placed by hand near the camp, outside the chunks; keyed in their own layer
const CAMP_TREES: readonly Omit<ForestEntrySpec, "key">[] = [
  { x: 3, z: -2, model: "treePine", rotation: 0, scale: 1 },
];

// Minimal views of the session state the forest writes to
export type ForestInventory = Pick<Inventory, "add">;
export type ForestWorldChanges = Pick<
  WorldChanges,
  "markRemoved" | "removedAt" | "restore"
>;

// Whether a tree removed at `removedAt` (game time, seconds) grows back at `elapsed`.
// The delay is read at every check, so changing it applies to existing stumps
export function isRegrowthDue(
  removedAt: number,
  elapsed: number,
  delay: number,
): boolean {
  return elapsed - removedAt >= delay;
}

interface ForestEntrySpec {
  // worldKey() of the tree, stable across chunk reloads
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly model: TreeModel;
  readonly rotation: number;
  readonly scale: number;
}

// A generated tree slot: it holds either the tree or, once felled, its stump. Swapping
// between the two only touches the entry, so a regrowth pass can turn a stump back into
// the tree with the same spec
interface ForestEntry extends ForestEntrySpec {
  tree: Tree | null;
  stump: Stump | null;
}

// Trees generated in chunks around the followed object, like grass and flowers in
// Vegetation. Unlike plants, each tree is a full Tree entity with its collider and
// interaction, so the forest adds and destroys them through the entity manager. It also
// owns the camp trees, so every tree can be felled the same way
export default class Forest extends Entity {
  readonly #followed: Object3D;
  readonly #entities: EntityManager;
  readonly #inventory: ForestInventory;
  readonly #worldChanges: ForestWorldChanges;
  readonly #followedPosition = new Vector3();
  readonly #chunks: ChunkGrid<readonly ForestEntry[]>;
  readonly #camp: readonly ForestEntry[];
  // Loaded entries holding a stump, the only ones the regrowth pass looks at
  readonly #stumps: ForestEntry[] = [];
  // Unscaled collider radius of each tree model, measured once on the first regrowth
  readonly #radii = new Map<TreeModel, number>();
  // Game time of the last update: a tree is felled from the player's tool hit, which does
  // not receive it
  #elapsed = 0;

  constructor(
    followed: Object3D,
    entities: EntityManager,
    inventory: ForestInventory,
    worldChanges: ForestWorldChanges,
  ) {
    super();
    this.object.name = "forest";
    this.#followed = followed;
    this.#entities = entities;
    this.#inventory = inventory;
    this.#worldChanges = worldChanges;
    this.#chunks = new ChunkGrid({
      load: (chunkX, chunkZ) => this.#loadChunk(chunkX, chunkZ),
      // Removal is deferred by the entity manager, after the update pass
      unload: (entries) => {
        for (const entry of entries) this.#clear(entry);
      },
    });
    this.#camp = CAMP_TREES.map((spec, index) => ({
      ...spec,
      key: worldKey(CAMP_LAYER, 0, 0, index),
      tree: null,
      stump: null,
    }));
  }

  override onAdded(): void {
    for (const entry of this.#camp) this.#spawn(entry);
  }

  override update(_delta: number, elapsed: number): void {
    this.#elapsed = elapsed;
    this.#chunks.update(this.#followed.getWorldPosition(this.#followedPosition));
    this.#regrowDue(false);
  }

  override onRemoved(): void {
    this.#chunks.clear();
    for (const entry of this.#camp) this.#clear(entry);
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(TREE_SHAKE, "frequency", 0.5, 6, 0.1).name("shake frequency");
    folder.add(TREE_SHAKE, "damping", 0.02, 1, 0.01).name("shake damping");
    folder.add(TREE_SHAKE, "impulse", 0, 4, 0.05).name("hit impulse");
    folder.add(TREE_SHAKE, "maxTilt", 0, 0.5, 0.01).name("max tilt");
    folder.add(TREE_FELLING, "hits", 1, 20, 1).name("hits to fell");
    folder.add(TREE_FELLING, "wood", 1, 10, 1).name("wood per tree");
    folder
      .add(TREE_FELLING, "fallDuration", 0.2, 5, 0.1)
      .name("fall duration");
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
    folder.add(TREE_REGROWTH, "delay", 0, 900, 1).name("regrowth delay");
    folder
      .add(TREE_REGROWTH, "growDuration", 0.1, 5, 0.1)
      .name("grow duration");
    // Stumps the followed object stands on still wait for it to move away
    const regrowth = {
      regrowAll: (): void => this.#regrowDue(true),
    };
    folder.add(regrowth, "regrowAll").name("regrow all stumps now");
  }

  #loadChunk(chunkX: number, chunkZ: number): ForestEntry[] {
    const random = createSeededRandom(chunkSeed(chunkX, chunkZ, FOREST_SALT));
    const margin = MIN_SPACING / 2;
    const span = CHUNK_SIZE - MIN_SPACING;
    const minX = chunkX * CHUNK_SIZE + margin;
    const minZ = chunkZ * CHUNK_SIZE + margin;

    const entries: ForestEntry[] = [];
    for (let slot = 0; slot < TREES_PER_CHUNK; slot++) {
      // Every random value is drawn even when the candidate is rejected, so the sequence,
      // and with it the chunk's content, does not depend on which candidates fail
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const x = minX + random() * span;
        const z = minZ + random() * span;
        const model = TREE_MODELS[Math.floor(random() * TREE_MODELS.length)]!;
        const rotation = random() * Math.PI * 2;
        const scale = MIN_SCALE + (MAX_SCALE - MIN_SCALE) * random();
        if (!isFree(x, z, entries)) continue;

        // The index counts accepted trees in generation order, which only depends on the
        // chunk's coordinates: the key stays the same at every reload
        const key = worldKey(FOREST_LAYER, chunkX, chunkZ, entries.length);
        const entry: ForestEntry = {
          key,
          x,
          z,
          model,
          rotation,
          scale,
          tree: null,
          stump: null,
        };
        entries.push(entry);
        this.#spawn(entry);
        break;
      }
    }
    return entries;
  }

  // A tree felled before (even in a chunk unloaded since) comes back as its stump, unless
  // the delay has passed meanwhile: then it is already grown back, with no animation
  #spawn(entry: ForestEntry): void {
    const removedAt = this.#worldChanges.removedAt(entry.key);
    if (removedAt === undefined) {
      this.#plantTree(entry);
    } else if (isRegrowthDue(removedAt, this.#elapsed, TREE_REGROWTH.delay)) {
      this.#worldChanges.restore(entry.key);
      this.#plantTree(entry);
    } else {
      this.#plantStump(entry);
    }
  }

  // Turns the loaded stumps whose delay has passed (or all of them, when `force` is set) back
  // into growing trees. Runs every frame: it only reads numbers and never allocates
  #regrowDue(force: boolean): void {
    // Backwards, because a regrown entry is swapped out of the list
    for (let i = this.#stumps.length - 1; i >= 0; i--) {
      const entry = this.#stumps[i]!;
      const removedAt = this.#worldChanges.removedAt(entry.key);
      if (
        !force &&
        removedAt !== undefined &&
        !isRegrowthDue(removedAt, this.#elapsed, TREE_REGROWTH.delay)
      ) {
        continue;
      }
      if (this.#isBlocked(entry)) continue;

      entry.stump!.destroy();
      entry.stump = null;
      this.#removeStump(i);
      this.#worldChanges.restore(entry.key);
      this.#plantTree(entry, true);
    }
  }

  // True while the followed object stands where the regrown tree's collider would be: the
  // regrowth waits until it moves away
  #isBlocked(entry: ForestEntry): boolean {
    let radius = this.#radii.get(entry.model);
    if (radius === undefined) {
      radius = treeColliderRadius(entry.model);
      this.#radii.set(entry.model, radius);
    }
    const reach = radius * entry.scale + REGROWTH_MARGIN;
    const dx = this.#followedPosition.x - entry.x;
    const dz = this.#followedPosition.z - entry.z;
    return dx * dx + dz * dz < reach * reach;
  }

  #plantTree(entry: ForestEntry, grow = false): void {
    const { x, z, model, rotation, scale } = entry;
    entry.tree = this.#entities.add(
      new Tree(
        { x, y: 0, z },
        {
          model,
          rotation,
          scale,
          onFelled: () => this.#onFelled(entry),
          onFallen: () => this.#onFallen(entry),
          grow,
        },
      ),
    );
  }

  #plantStump(entry: ForestEntry): void {
    const { x, z, model, rotation, scale } = entry;
    const stump = STUMPS[model];
    entry.stump = this.#entities.add(
      new Stump(
        { x, y: 0, z },
        { model: stump.model, rotation, scale: scale * stump.scale },
      ),
    );
    this.#stumps.push(entry);
  }

  // Swap-remove: the order of the list does not matter
  #removeStump(index: number): void {
    if (index < 0) return;
    const last = this.#stumps.pop()!;
    if (index < this.#stumps.length) this.#stumps[index] = last;
  }

  // Recorded and paid at the felling hit, not when the fall ends: if the chunk unloads while
  // the tree is falling, it still comes back as a stump and the wood is not lost
  #onFelled(entry: ForestEntry): void {
    this.#worldChanges.markRemoved(entry.key, this.#elapsed);
    this.#inventory.add("wood", TREE_FELLING.wood);
  }

  // The tree has destroyed itself: its stump takes the slot
  #onFallen(entry: ForestEntry): void {
    entry.tree = null;
    this.#plantStump(entry);
  }

  #clear(entry: ForestEntry): void {
    entry.tree?.destroy();
    if (entry.stump) {
      entry.stump.destroy();
      this.#removeStump(this.#stumps.indexOf(entry));
    }
    entry.tree = null;
    entry.stump = null;
  }
}

function isFree(x: number, z: number, entries: readonly ForestEntry[]): boolean {
  if (x * x + z * z < EXCLUSION_RADIUS ** 2) return false;
  for (const entry of entries) {
    if (Math.hypot(entry.x - x, entry.z - z) < MIN_SPACING) return false;
  }
  return true;
}

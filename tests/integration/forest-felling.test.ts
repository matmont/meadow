// @vitest-environment happy-dom
import { Object3D } from "three";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Inventory from "../../src/Inventory";
import PhysicsManager from "../../src/PhysicsManager";
import WorldChanges, { worldKey } from "../../src/entities/World/WorldChanges";
import Stump from "../../src/entities/Stump";
import Tree, { TREE_FELLING } from "../../src/entities/Tree";
import Forest from "../../src/entities/World/Forest";
import { CHUNK_SIZE } from "../../src/entities/World/chunks";
import InteractionManager from "../../src/interaction/InteractionManager";
import layoutJson from "./fixtures/forest-layout.json?raw";
import { FakeActor, FrameLoop, stubModels, yaw } from "./helpers/felling";

interface Placement {
  readonly x: number;
  readonly z: number;
  readonly model: string;
  readonly rotation: number;
  readonly scale: number;
}

interface KeyedPlacement extends Placement {
  readonly key: string;
}

// The 75 trees generated around the origin by Forest before felling existed (captured from
// the base branch, in load order: chunks from (-2, -2) to (2, 2), z first, then each
// chunk's trees in generation order). Felling must not change any random draw
const PRE_FELLING_LAYOUT: readonly Placement[] = JSON.parse(layoutJson);

// The key of each generated tree: its chunk and its index among the chunk's accepted trees
const LAYOUT: readonly KeyedPlacement[] = PRE_FELLING_LAYOUT.map(
  (placement, i) => {
    const chunkX = Math.floor(placement.x / CHUNK_SIZE);
    const chunkZ = Math.floor(placement.z / CHUNK_SIZE);
    const index = PRE_FELLING_LAYOUT.slice(0, i).filter(
      (other) =>
        Math.floor(other.x / CHUNK_SIZE) === chunkX &&
        Math.floor(other.z / CHUNK_SIZE) === chunkZ,
    ).length;
    return { ...placement, key: worldKey("forest", chunkX, chunkZ, index) };
  },
);

// The camp tree main.ts used to add by hand, now owned by Forest
const CAMP = { x: 3, z: -2, model: "treePine", rotation: 0, scale: 1 };
const CAMP_KEY = worldKey("camp", 0, 0, 0);

// Far enough that every chunk loaded around the origin is unloaded
const FAR_AWAY = CHUNK_SIZE * 20;

const DEFAULT_FELLING = { ...TREE_FELLING };

function describeTree(tree: Tree): Placement {
  return {
    x: tree.object.position.x,
    z: tree.object.position.z,
    model: tree.object.name,
    rotation: yaw(tree.object.quaternion),
    scale: tree.object.scale.x,
  };
}

function isAt(entity: Tree | Stump, placement: Placement): boolean {
  return (
    entity.object.position.x === placement.x &&
    entity.object.position.z === placement.z
  );
}

function expectSameLayout(
  actual: readonly Placement[],
  expected: readonly Placement[],
): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((placement, i) => {
    const reference = expected[i]!;
    expect(placement.x).toBe(reference.x);
    expect(placement.z).toBe(reference.z);
    expect(placement.model).toBe(reference.model);
    expect(placement.rotation).toBeCloseTo(reference.rotation, 6);
    expect(placement.scale).toBeCloseTo(reference.scale, 9);
  });
}

describe("Forest felling", () => {
  let loop: FrameLoop;
  let actor: FakeActor;
  let followed: Object3D;
  let inventory: Inventory;
  let worldChanges: WorldChanges;
  let forest: Forest;

  beforeAll(async () => {
    await PhysicsManager.init();
  });

  afterAll(() => {
    PhysicsManager.dispose();
  });

  beforeEach(() => {
    stubModels();
    loop = new FrameLoop();
    actor = new FakeActor();
    followed = new Object3D();
    inventory = new Inventory();
    worldChanges = new WorldChanges();
    InteractionManager.init(actor);
  });

  afterEach(() => {
    loop.entities.clear();
    InteractionManager.dispose();
    Object.assign(TREE_FELLING, DEFAULT_FELLING);
    vi.restoreAllMocks();
    expect(PhysicsManager.world.bodies.len()).toBe(0);
  });

  function addForest(): void {
    forest = loop.entities.add(
      new Forest(followed, loop.entities, inventory, worldChanges),
    );
    loop.step(1 / 60);
  }

  function trees(): Tree[] {
    return loop.entities.getAll(Tree);
  }

  function stumps(): Stump[] {
    return loop.entities.getAll(Stump);
  }

  function generatedTrees(): Placement[] {
    return trees()
      .filter((tree) => !isAt(tree, CAMP))
      .map(describeTree);
  }

  function treeAt(placement: Placement): Tree | undefined {
    return trees().find((tree) => isAt(tree, placement));
  }

  function stumpAt(placement: Placement): Stump | undefined {
    return stumps().find((stump) => isAt(stump, placement));
  }

  // Hits the tree with the axe from the -Z side, one frame apart, like the player would
  function hitTree(placement: Placement, hits: number): void {
    actor.standNear(placement, { x: 0, z: -1 });
    for (let i = 0; i < hits; i++) {
      actor.hit("axe");
      loop.step(1 / 60);
    }
  }

  function moveFollowed(x: number, z: number): void {
    followed.position.set(x, 0, z);
    loop.step(1 / 60);
  }

  // The generated tree closest to the camp, so it is in a chunk loaded around the origin
  const target = LAYOUT.reduce((best, placement) =>
    Math.hypot(placement.x, placement.z) < Math.hypot(best.x, best.z)
      ? placement
      : best,
  );

  it("generates the same trees, in the same order, as before felling existed", () => {
    addForest();

    expectSameLayout(generatedTrees(), PRE_FELLING_LAYOUT);
    expect(stumps()).toHaveLength(0);
  });

  it("owns the camp tree, placed where main.ts used to put it", () => {
    addForest();

    const camp = treeAt(CAMP);
    expect(camp).toBeDefined();
    expect(describeTree(camp!)).toEqual(CAMP);
  });

  it("gives every tree a collider", () => {
    addForest();

    expect(PhysicsManager.world.bodies.len()).toBe(LAYOUT.length + 1);
  });

  it("spawns a stump instead of a tree whose key was removed", () => {
    const removed = LAYOUT[10]!;
    worldChanges.markRemoved(removed.key, 0);

    addForest();

    expect(treeAt(removed)).toBeUndefined();
    const stump = stumpAt(removed);
    expect(stump).toBeDefined();
    expect(stump!.object.position.y).toBe(0);
    expect(yaw(stump!.object.quaternion)).toBeCloseTo(removed.rotation, 6);
    expect(stump!.object.scale.x).toBeGreaterThan(0);
    expect(stump!.object.name).toBe(
      removed.model.startsWith("treePine") ? "stumpOld" : "stumpRound",
    );
    expect(stumps()).toHaveLength(1);
    expectSameLayout(
      generatedTrees(),
      PRE_FELLING_LAYOUT.filter((_, i) => i !== 10),
    );
    // The stump keeps a collider in the tree's place
    expect(PhysicsManager.world.bodies.len()).toBe(LAYOUT.length + 1);
  });

  it("keeps the layout unchanged when a removed key is not generated", () => {
    worldChanges.markRemoved(worldKey("forest", 0, 0, 99), 0);

    addForest();

    expectSameLayout(generatedTrees(), PRE_FELLING_LAYOUT);
    expect(stumps()).toHaveLength(0);
  });

  it("records the felling, pays the wood once and leaves a stump after the fall", () => {
    addForest();
    loop.advance(2);
    const bodies = PhysicsManager.world.bodies.len();

    hitTree(target, TREE_FELLING.hits - 1);
    expect(inventory.count("wood")).toBe(0);
    expect(worldChanges.removedAt(target.key)).toBeUndefined();

    const elapsedAtHit = loop.elapsed;
    actor.hit("axe");

    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);
    // The time of the forest's last update, since the hit comes from the player
    expect(worldChanges.removedAt(target.key)).toBe(elapsedAtHit);
    // The falling tree no longer blocks the player
    expect(PhysicsManager.world.bodies.len()).toBe(bodies - 1);
    expect(treeAt(target)?.isFelled).toBe(true);
    expect(stumpAt(target)).toBeUndefined();

    // More hits while it falls change nothing
    for (let i = 0; i < 5; i++) {
      actor.hit("axe");
      loop.step(1 / 60);
    }
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);
    expect(worldChanges.removedAt(target.key)).toBe(elapsedAtHit);

    loop.advance(TREE_FELLING.fallDuration);

    expect(treeAt(target)).toBeUndefined();
    const stump = stumpAt(target);
    expect(stump).toBeDefined();
    expect(yaw(stump!.object.quaternion)).toBeCloseTo(target.rotation, 6);
    expect(stumps()).toHaveLength(1);
    expect(PhysicsManager.world.bodies.len()).toBe(bodies);
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);

    // The stump is not interactable: more hits give nothing
    hitTree(target, TREE_FELLING.hits);
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);
  });

  it("pays the tuned amount of wood", () => {
    TREE_FELLING.hits = 1;
    TREE_FELLING.wood = 7;
    addForest();

    hitTree(target, 1);

    expect(inventory.count("wood")).toBe(7);
  });

  it("only touches the felled tree", () => {
    TREE_FELLING.hits = 1;
    addForest();

    hitTree(target, 1);
    loop.advance(TREE_FELLING.fallDuration + 0.1);

    const index = LAYOUT.indexOf(target);
    expectSameLayout(
      generatedTrees(),
      PRE_FELLING_LAYOUT.filter((_, i) => i !== index),
    );
    expect(treeAt(CAMP)).toBeDefined();
  });

  it("brings a felled tree back as a stump when its chunk is reloaded", () => {
    TREE_FELLING.hits = 1;
    addForest();
    hitTree(target, 1);
    loop.advance(TREE_FELLING.fallDuration + 0.1);

    moveFollowed(FAR_AWAY, 0);
    // Only the trees around the new position and the camp tree are left
    expect(stumpAt(target)).toBeUndefined();
    expect(stumps()).toHaveLength(0);
    expect(treeAt(CAMP)).toBeDefined();

    moveFollowed(0, 0);

    expect(treeAt(target)).toBeUndefined();
    expect(stumpAt(target)).toBeDefined();
    expect(stumps()).toHaveLength(1);
    const index = LAYOUT.indexOf(target);
    expectSameLayout(
      generatedTrees().filter((tree) => Math.abs(tree.x) < FAR_AWAY / 2),
      PRE_FELLING_LAYOUT.filter((_, i) => i !== index),
    );
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);
  });

  it("handles a chunk unloaded while its tree is falling", () => {
    TREE_FELLING.hits = 1;
    addForest();
    hitTree(target, 1);
    loop.advance(TREE_FELLING.fallDuration / 3);

    moveFollowed(FAR_AWAY, 0);
    loop.advance(TREE_FELLING.fallDuration * 2);

    // No orphan tree or stump is left where the chunk was
    expect(treeAt(target)).toBeUndefined();
    expect(stumpAt(target)).toBeUndefined();
    expect(stumps()).toHaveLength(0);
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);

    moveFollowed(0, 0);

    expect(treeAt(target)).toBeUndefined();
    expect(stumpAt(target)).toBeDefined();
    expect(stumps()).toHaveLength(1);
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);
  });

  it("forgets partial hits when the chunk is reloaded", () => {
    addForest();
    hitTree(target, TREE_FELLING.hits - 1);

    moveFollowed(FAR_AWAY, 0);
    moveFollowed(0, 0);
    hitTree(target, 1);

    expect(treeAt(target)?.isFelled).toBe(false);
    expect(inventory.count("wood")).toBe(0);
  });

  it("lets the camp tree be felled with its own key", () => {
    TREE_FELLING.hits = 1;
    addForest();
    loop.advance(1);
    const elapsedAtHit = loop.elapsed;

    hitTree(CAMP, 1);

    expect(worldChanges.removedAt(CAMP_KEY)).toBe(elapsedAtHit);
    expect(inventory.count("wood")).toBe(TREE_FELLING.wood);

    loop.advance(TREE_FELLING.fallDuration + 0.1);
    expect(treeAt(CAMP)).toBeUndefined();
    const stump = stumpAt(CAMP);
    expect(stump).toBeDefined();
    expect(stump!.object.name).toBe("stumpOld");

    // The camp is outside the chunks: moving away keeps its stump
    moveFollowed(FAR_AWAY, 0);
    expect(stumpAt(CAMP)).toBe(stump);
  });

  it("spawns the camp stump when the camp tree was felled before", () => {
    worldChanges.markRemoved(CAMP_KEY, 5);

    addForest();

    expect(treeAt(CAMP)).toBeUndefined();
    expect(stumpAt(CAMP)).toBeDefined();
  });

  it("destroys every tree and stump it owns when removed", () => {
    TREE_FELLING.hits = 1;
    worldChanges.markRemoved(LAYOUT[3]!.key, 0);
    addForest();
    hitTree(target, 1);
    loop.advance(0.2);

    forest.destroy();
    loop.step(1 / 60);
    loop.advance(TREE_FELLING.fallDuration * 2);

    // The tree that was falling did not leave an orphan stump behind
    expect(loop.entities.size).toBe(0);
    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(PhysicsManager.world.colliders.len()).toBe(0);
  });

  it("leaves no Rapier body when the entity manager is cleared", () => {
    TREE_FELLING.hits = 1;
    addForest();
    hitTree(target, 1);
    loop.advance(TREE_FELLING.fallDuration + 0.1);
    hitTree(CAMP, 1);
    loop.advance(0.2);

    loop.entities.clear();

    expect(loop.entities.size).toBe(0);
    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(PhysicsManager.world.colliders.len()).toBe(0);
  });
});

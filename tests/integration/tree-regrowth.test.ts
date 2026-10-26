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
import WorldChanges, { worldKey } from "../../src/WorldChanges";
import Stump from "../../src/entities/Stump";
import Tree, {
  TREE_FELLING,
  TREE_REGROWTH,
  treeColliderRadius,
} from "../../src/entities/Tree";
import Forest from "../../src/entities/World/Forest";
import { CHUNK_SIZE } from "../../src/entities/World/chunks";
import InteractionManager from "../../src/interaction/InteractionManager";
import layoutJson from "./fixtures/forest-layout.json?raw";
import { FakeActor, FrameLoop, stubModels } from "./helpers/felling";

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

// The trees Forest generates around the origin (see forest-felling.test.ts), with the key
// of each one: its chunk and its index among the chunk's accepted trees
const LAYOUT: readonly KeyedPlacement[] = (
  JSON.parse(layoutJson) as Placement[]
).map((placement, i, all) => {
  const chunkX = Math.floor(placement.x / CHUNK_SIZE);
  const chunkZ = Math.floor(placement.z / CHUNK_SIZE);
  const index = all
    .slice(0, i)
    .filter(
      (other) =>
        Math.floor(other.x / CHUNK_SIZE) === chunkX &&
        Math.floor(other.z / CHUNK_SIZE) === chunkZ,
    ).length;
  return { ...placement, key: worldKey("forest", chunkX, chunkZ, index) };
});

// The camp tree: outside the chunks, so it never unloads
const CAMP: KeyedPlacement = {
  x: 3,
  z: -2,
  model: "treePine",
  rotation: 0,
  scale: 1,
  key: worldKey("camp", 0, 0, 0),
};

// Far enough that every chunk loaded around the origin is unloaded
const FAR_AWAY = CHUNK_SIZE * 20;
// Radius of the player's capsule (Player.ts): a regrown collider closer than this to the
// followed object would overlap the player
const PLAYER_RADIUS = 0.3;
// Short enough to run in a test, long enough to be well apart from the fall
const DELAY = 10;

const DEFAULT_FELLING = { ...TREE_FELLING };
const DEFAULT_REGROWTH = { ...TREE_REGROWTH };

describe("Tree regrowth", () => {
  let loop: FrameLoop;
  let actor: FakeActor;
  let followed: Object3D;
  let inventory: Inventory;
  let worldChanges: WorldChanges;
  let forest: Forest;
  let instantiated: readonly string[];

  beforeAll(async () => {
    await PhysicsManager.init();
  });

  afterAll(() => {
    PhysicsManager.dispose();
  });

  beforeEach(() => {
    ({ instantiated } = stubModels());
    loop = new FrameLoop();
    actor = new FakeActor();
    followed = new Object3D();
    inventory = new Inventory();
    worldChanges = new WorldChanges();
    InteractionManager.init(actor);
    TREE_FELLING.hits = 1;
    TREE_REGROWTH.delay = DELAY;
  });

  afterEach(() => {
    loop.entities.clear();
    InteractionManager.dispose();
    Object.assign(TREE_FELLING, DEFAULT_FELLING);
    Object.assign(TREE_REGROWTH, DEFAULT_REGROWTH);
    vi.restoreAllMocks();
    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(PhysicsManager.world.colliders.len()).toBe(0);
  });

  function addForest(): void {
    forest = loop.entities.add(
      new Forest(followed, loop.entities, inventory, worldChanges),
    );
    loop.step(1 / 60);
  }

  function isAt(entity: Tree | Stump, placement: Placement): boolean {
    return (
      entity.object.position.x === placement.x &&
      entity.object.position.z === placement.z
    );
  }

  function treesAt(placement: Placement): Tree[] {
    return loop.entities.getAll(Tree).filter((tree) => isAt(tree, placement));
  }

  function stumpsAt(placement: Placement): Stump[] {
    return loop.entities.getAll(Stump).filter((stump) => isAt(stump, placement));
  }

  function treeAt(placement: Placement): Tree | undefined {
    return treesAt(placement)[0];
  }

  function stumpAt(placement: Placement): Stump | undefined {
    return stumpsAt(placement)[0];
  }

  // Radius of the Rapier collider standing at the placement, if any
  function colliderRadiusAt(placement: Placement): number | undefined {
    let radius: number | undefined;
    PhysicsManager.world.colliders.forEach((collider) => {
      const { x, z } = collider.translation();
      if (
        Math.abs(x - placement.x) < 1e-4 &&
        Math.abs(z - placement.z) < 1e-4
      ) {
        radius = collider.radius();
      }
    });
    return radius;
  }

  // Fells the tree with one axe hit from the -Z side and waits until its stump is there.
  // Returns the game time of the felling
  function fell(placement: Placement): number {
    actor.standNear(placement, { x: 0, z: -1 });
    actor.hit("axe");
    const felledAt = loop.elapsed;
    loop.advance(TREE_FELLING.fallDuration + 0.1);
    expect(stumpAt(placement)).toBeDefined();
    return felledAt;
  }

  function moveFollowed(x: number, z: number): void {
    followed.position.set(x, 0, z);
    loop.step(1 / 60);
  }

  // Runs frames until the game time reaches `time`
  function advanceTo(time: number): void {
    loop.advance(time - loop.elapsed);
  }

  // The generated tree closest to the camp, so it is in a chunk loaded around the origin
  const target = LAYOUT.reduce((best, placement) =>
    Math.hypot(placement.x, placement.z) < Math.hypot(best.x, best.z)
      ? placement
      : best,
  );

  describe("while the chunk is loaded", () => {
    it("keeps the stump until the delay has passed", () => {
      addForest();
      const felledAt = fell(CAMP);

      advanceTo(felledAt + DELAY - 0.1);

      expect(stumpAt(CAMP)).toBeDefined();
      expect(treeAt(CAMP)).toBeUndefined();
      expect(worldChanges.removedAt(CAMP.key)).toBe(felledAt);
    });

    it("turns the stump back into a growing tree once the delay has passed", () => {
      addForest();
      const felledAt = fell(CAMP);
      advanceTo(felledAt + DELAY - 0.1);
      const bodies = PhysicsManager.world.bodies.len();

      loop.advance(0.2);

      expect(stumpsAt(CAMP)).toHaveLength(0);
      const trees = treesAt(CAMP);
      expect(trees).toHaveLength(1);
      expect(trees[0]!.isGrowing).toBe(true);
      expect(trees[0]!.isFelled).toBe(false);
      expect(trees[0]!.object.scale.x).toBeLessThan(CAMP.scale);
      expect(trees[0]!.object.scale.x).toBeGreaterThan(0);
      expect(worldChanges.removedAt(CAMP.key)).toBeUndefined();
      // The stump's body was swapped for the tree's
      expect(PhysicsManager.world.bodies.len()).toBe(bodies);
    });

    it("swaps the stump for the tree in a single frame", () => {
      addForest();
      const felledAt = fell(CAMP);
      // Stop right before the frame in which the regrowth is due
      while (loop.elapsed + 1 / 60 < felledAt + DELAY) loop.step(1 / 60);
      expect(stumpAt(CAMP)).toBeDefined();

      loop.step(1 / 60);

      // The stump's deferred removal and the tree's addition land in the same frame
      expect(stumpsAt(CAMP)).toHaveLength(0);
      expect(treesAt(CAMP)).toHaveLength(1);
    });

    it("grows the tree to its full scale over the grow duration", () => {
      TREE_REGROWTH.growDuration = 2;
      addForest();
      const felledAt = fell(CAMP);
      advanceTo(felledAt + DELAY + 0.05);
      const tree = treeAt(CAMP)!;
      expect(tree.isGrowing).toBe(true);

      loop.advance(1);
      const halfway = tree.object.scale.x;
      expect(tree.isGrowing).toBe(true);
      expect(halfway).toBeGreaterThan(0.5);
      expect(halfway).toBeLessThan(CAMP.scale);

      loop.advance(1.1);
      expect(tree.isGrowing).toBe(false);
      expect(tree.object.scale.x).toBeCloseTo(CAMP.scale, 9);
    });

    it("gives the growing tree its full-size collider from the start", () => {
      addForest();
      const fullRadius = colliderRadiusAt(CAMP)!;
      const felledAt = fell(CAMP);
      advanceTo(felledAt + DELAY + 0.05);
      expect(treeAt(CAMP)!.isGrowing).toBe(true);

      expect(colliderRadiusAt(CAMP)).toBeCloseTo(fullRadius, 6);
    });

    it("cannot be harvested while it grows", () => {
      addForest();
      const felledAt = fell(CAMP);
      advanceTo(felledAt + DELAY + 0.05);
      const tree = treeAt(CAMP)!;
      expect(tree.isGrowing).toBe(true);
      const wood = inventory.count("wood");

      actor.standNear(CAMP, { x: 0, z: -1 });
      actor.hit("axe");
      loop.step(1 / 60);

      expect(tree.isFelled).toBe(false);
      expect(inventory.count("wood")).toBe(wood);
      expect(worldChanges.removedAt(CAMP.key)).toBeUndefined();
    });

    it("lets a regrown tree be felled again for more wood, and regrow again", () => {
      addForest();
      const firstFelling = fell(CAMP);
      advanceTo(firstFelling + DELAY + 0.05);
      loop.advance(TREE_REGROWTH.growDuration + 0.1);
      expect(treeAt(CAMP)!.isGrowing).toBe(false);

      const secondFelling = fell(CAMP);

      expect(secondFelling).toBeGreaterThan(firstFelling);
      expect(inventory.count("wood")).toBe(TREE_FELLING.wood * 2);
      expect(worldChanges.removedAt(CAMP.key)).toBe(secondFelling);
      expect(treesAt(CAMP)).toHaveLength(0);
      expect(stumpsAt(CAMP)).toHaveLength(1);

      // The delay counts from the second felling
      advanceTo(secondFelling + DELAY - 0.1);
      expect(stumpAt(CAMP)).toBeDefined();
      loop.advance(0.2);
      expect(treeAt(CAMP)?.isGrowing).toBe(true);
    });
  });

  describe("frame-rate independence", () => {
    // Grows a tree on its own for `seconds` at a fixed frame delta, and returns its scale
    function scaleAfter(seconds: number, delta: number): number {
      const frames = new FrameLoop();
      const tree = frames.entities.add(
        new Tree({ x: 0, y: 0, z: 0 }, { model: "treeOak", grow: true }),
      );
      frames.advance(seconds, delta);
      const scale = tree.object.scale.x;
      frames.entities.clear();
      return scale;
    }

    it("grows by game time, not by frame count", () => {
      TREE_REGROWTH.growDuration = 1.5;
      const at30 = scaleAfter(0.5, 1 / 30);
      const at120 = scaleAfter(0.5, 1 / 120);
      const at10 = scaleAfter(0.5, 1 / 10);

      expect(at30).toBeGreaterThan(0);
      expect(at30).toBeLessThan(1);
      expect(at120).toBeCloseTo(at30, 6);
      expect(at10).toBeCloseTo(at30, 6);
    });

    it("starts small and ends at full size whatever the frame rate", () => {
      TREE_REGROWTH.growDuration = 1.5;

      expect(scaleAfter(1 / 120, 1 / 120)).toBeLessThan(0.1);
      expect(scaleAfter(1.6, 1 / 30)).toBe(1);
      expect(scaleAfter(1.6, 1 / 144)).toBe(1);
    });

    it("keeps a tree planted without `grow` at full size", () => {
      const frames = new FrameLoop();
      const tree = frames.entities.add(
        new Tree({ x: 0, y: 0, z: 0 }, { model: "treeOak", scale: 1.2 }),
      );

      expect(tree.isGrowing).toBe(false);
      expect(tree.object.scale.x).toBeCloseTo(1.2, 9);
      frames.entities.clear();
    });
  });

  describe("the followed object", () => {
    it("postpones the regrowth while it stands on the stump", () => {
      addForest();
      const felledAt = fell(CAMP);
      moveFollowed(CAMP.x, CAMP.z);

      advanceTo(felledAt + DELAY * 3);

      expect(treeAt(CAMP)).toBeUndefined();
      expect(stumpAt(CAMP)).toBeDefined();
      expect(worldChanges.removedAt(CAMP.key)).toBe(felledAt);

      moveFollowed(CAMP.x + 3, CAMP.z);

      expect(stumpAt(CAMP)).toBeUndefined();
      expect(treeAt(CAMP)?.isGrowing).toBe(true);
      expect(worldChanges.removedAt(CAMP.key)).toBeUndefined();
    });

    it("postpones it while the player's capsule would overlap the new collider", () => {
      addForest();
      const radius = treeColliderRadius("treePine", CAMP.scale);
      const felledAt = fell(CAMP);
      // Touching the collider's edge from the side
      moveFollowed(CAMP.x - (radius + PLAYER_RADIUS - 0.01), CAMP.z);

      advanceTo(felledAt + DELAY + 1);

      expect(treeAt(CAMP)).toBeUndefined();
      expect(stumpAt(CAMP)).toBeDefined();
    });

    it("never regrows a collider over the player as it walks away", () => {
      addForest();
      const felledAt = fell(CAMP);
      moveFollowed(CAMP.x, CAMP.z);
      advanceTo(felledAt + DELAY + 1);

      // Walks away along +X in small steps, one frame each, until the tree comes back
      let distance = 0;
      while (!treeAt(CAMP) && distance < 5) {
        distance += 0.02;
        moveFollowed(CAMP.x + distance, CAMP.z);
      }

      const colliderRadius = colliderRadiusAt(CAMP);
      expect(treeAt(CAMP)).toBeDefined();
      expect(colliderRadius).toBeDefined();
      expect(distance).toBeGreaterThanOrEqual(colliderRadius! + PLAYER_RADIUS);
      // The margin is small: the tree does not wait for the player to be far away
      expect(distance).toBeLessThan(colliderRadius! + 2);
    });

    it("does not re-measure the tree model every frame while it waits", () => {
      addForest();
      const felledAt = fell(CAMP);
      moveFollowed(CAMP.x, CAMP.z);
      advanceTo(felledAt + DELAY + 0.1);
      const count = instantiated.length;

      loop.advance(1);

      expect(instantiated.length).toBe(count);
    });
  });

  describe("changing the delay at runtime", () => {
    it("regrows existing stumps at once when it gets shorter", () => {
      TREE_REGROWTH.delay = 300;
      addForest();
      const felledAt = fell(CAMP);
      advanceTo(felledAt + 5);
      expect(stumpAt(CAMP)).toBeDefined();

      TREE_REGROWTH.delay = 2;
      loop.step(1 / 60);

      expect(stumpAt(CAMP)).toBeUndefined();
      expect(treeAt(CAMP)?.isGrowing).toBe(true);
    });

    it("keeps existing stumps longer when it gets longer", () => {
      addForest();
      const felledAt = fell(CAMP);
      advanceTo(felledAt + DELAY - 2);

      TREE_REGROWTH.delay = DELAY * 2;
      advanceTo(felledAt + DELAY + 2);

      expect(stumpAt(CAMP)).toBeDefined();
      expect(treeAt(CAMP)).toBeUndefined();

      advanceTo(felledAt + DELAY * 2 + 0.1);

      expect(stumpAt(CAMP)).toBeUndefined();
      expect(treeAt(CAMP)).toBeDefined();
    });
  });

  describe("chunk reloads", () => {
    it("spawns the grown tree directly when the delay passed while unloaded", () => {
      addForest();
      const felledAt = fell(target);

      moveFollowed(FAR_AWAY, 0);
      advanceTo(felledAt + DELAY + 1);
      expect(worldChanges.removedAt(target.key)).toBe(felledAt);
      moveFollowed(0, 0);

      expect(stumpsAt(target)).toHaveLength(0);
      const trees = treesAt(target);
      expect(trees).toHaveLength(1);
      expect(trees[0]!.isGrowing).toBe(false);
      expect(trees[0]!.object.scale.x).toBeCloseTo(target.scale, 9);
      expect(worldChanges.removedAt(target.key)).toBeUndefined();
    });

    it("keeps the stump when reloaded before the delay, then regrows it in place", () => {
      addForest();
      const felledAt = fell(target);

      moveFollowed(FAR_AWAY, 0);
      advanceTo(felledAt + DELAY / 2);
      moveFollowed(0, 0);

      expect(treeAt(target)).toBeUndefined();
      expect(stumpsAt(target)).toHaveLength(1);
      expect(worldChanges.removedAt(target.key)).toBe(felledAt);

      advanceTo(felledAt + DELAY + 0.1);

      expect(stumpAt(target)).toBeUndefined();
      expect(treeAt(target)?.isGrowing).toBe(true);
    });

    it("spawns a full tree when a growing one is unloaded and reloaded", () => {
      addForest();
      const felledAt = fell(target);
      advanceTo(felledAt + DELAY + 0.05);
      expect(treeAt(target)?.isGrowing).toBe(true);

      moveFollowed(FAR_AWAY, 0);
      moveFollowed(0, 0);

      const trees = treesAt(target);
      expect(trees).toHaveLength(1);
      expect(trees[0]!.isGrowing).toBe(false);
      expect(stumpsAt(target)).toHaveLength(0);
    });
  });

  describe("bookkeeping", () => {
    it("keeps exactly one tree or stump per slot across many fell, regrow and unload cycles", () => {
      addForest();
      const slots = [CAMP, target, LAYOUT[10]!];
      const totalBodies = PhysicsManager.world.bodies.len();

      for (let cycle = 0; cycle < 6; cycle++) {
        for (const slot of slots) fell(slot);
        // Every other cycle, the generated stumps unload and come back before regrowing
        if (cycle % 2 === 0) {
          moveFollowed(FAR_AWAY, 0);
          moveFollowed(0, 0);
        }
        loop.advance(DELAY + 0.5);
        loop.advance(TREE_REGROWTH.growDuration + 0.1);

        for (const slot of slots) {
          expect(treesAt(slot)).toHaveLength(1);
          expect(stumpsAt(slot)).toHaveLength(0);
          expect(treeAt(slot)!.isGrowing).toBe(false);
          expect(worldChanges.removedAt(slot.key)).toBeUndefined();
        }
        expect(loop.entities.getAll(Stump)).toHaveLength(0);
        expect(PhysicsManager.world.bodies.len()).toBe(totalBodies);
      }
      expect(inventory.count("wood")).toBe(6 * slots.length * TREE_FELLING.wood);
    });

    it("leaves no Rapier body when the forest is destroyed while trees grow", () => {
      addForest();
      fell(CAMP);
      const felledAt = fell(target);
      worldChanges.markRemoved(LAYOUT[10]!.key, loop.elapsed);
      moveFollowed(FAR_AWAY, 0);
      moveFollowed(0, 0);
      advanceTo(felledAt + DELAY + 0.05);
      expect(treeAt(target)?.isGrowing).toBe(true);
      expect(stumpAt(LAYOUT[10]!)).toBeDefined();

      forest.destroy();
      loop.step(1 / 60);
      loop.advance(TREE_REGROWTH.growDuration + DELAY);

      expect(loop.entities.size).toBe(0);
      expect(PhysicsManager.world.bodies.len()).toBe(0);
      expect(PhysicsManager.world.colliders.len()).toBe(0);
    });
  });
});

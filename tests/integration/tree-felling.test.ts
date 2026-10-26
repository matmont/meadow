// @vitest-environment happy-dom
import { Mesh } from "three";
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
import PhysicsManager from "../../src/PhysicsManager";
import Stump from "../../src/entities/Stump";
import Tree, { FALL_ANGLE, TREE_FELLING, fallEase } from "../../src/entities/Tree";
import InteractionManager from "../../src/interaction/InteractionManager";
import {
  FakeActor,
  FrameLoop,
  STUMP_HEIGHT,
  leanAngle,
  leanDirection,
  stubModels,
  yaw,
} from "./helpers/felling";

const DEFAULT_FELLING = { ...TREE_FELLING };

// Tree and Stump with real Rapier, a real EntityManager and the real InteractionManager;
// only the glTF models are replaced by small shared boxes
describe("Tree felling", () => {
  let models: ReturnType<typeof stubModels>;
  let loop: FrameLoop;
  let actor: FakeActor;

  beforeAll(async () => {
    await PhysicsManager.init();
  });

  afterAll(() => {
    PhysicsManager.dispose();
  });

  beforeEach(() => {
    models = stubModels();
    loop = new FrameLoop();
    actor = new FakeActor();
    InteractionManager.init(actor);
  });

  afterEach(() => {
    loop.entities.clear();
    InteractionManager.dispose();
    Object.assign(TREE_FELLING, DEFAULT_FELLING);
    vi.restoreAllMocks();
    // Every entity removes its Rapier objects, so nothing is left for PhysicsManager.dispose()
    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(PhysicsManager.world.colliders.len()).toBe(0);
  });

  function addTree(): {
    tree: Tree;
    onFelled: ReturnType<typeof vi.fn<(tree: Tree) => void>>;
    onFallen: ReturnType<typeof vi.fn<(tree: Tree) => void>>;
  } {
    const onFelled = vi.fn<(tree: Tree) => void>();
    const onFallen = vi.fn<(tree: Tree) => void>();
    const tree = loop.entities.add(
      new Tree({ x: 0, y: 0, z: 0 }, { onFelled, onFallen }),
    );
    // The player stands on the -X side, so the tree must fall towards +X
    actor.standNear(tree.object.position, { x: -1, z: 0 });
    return { tree, onFelled, onFallen };
  }

  it("only shakes on the hits before the last one", () => {
    const { tree, onFelled } = addTree();

    for (let hit = 1; hit < TREE_FELLING.hits; hit++) {
      actor.hit();
      loop.step(1 / 60, 5);
      expect(tree.isFelled).toBe(false);
      expect(leanAngle(tree.object)).toBeGreaterThan(0);
    }

    expect(onFelled).not.toHaveBeenCalled();
    expect(PhysicsManager.world.bodies.len()).toBe(1);
    expect(InteractionManager.focusedLabel).toBe("Harvest");
  });

  it("fells the tree on the hit that reaches TREE_FELLING.hits", () => {
    const { tree, onFelled } = addTree();

    for (let hit = 1; hit < TREE_FELLING.hits; hit++) actor.hit();
    expect(onFelled).not.toHaveBeenCalled();
    actor.hit();

    expect(tree.isFelled).toBe(true);
    expect(onFelled).toHaveBeenCalledTimes(1);
    expect(onFelled).toHaveBeenCalledWith(tree);
  });

  it("follows a tuned hit count", () => {
    TREE_FELLING.hits = 2;
    const { tree, onFelled } = addTree();

    actor.hit();
    expect(tree.isFelled).toBe(false);
    actor.hit();

    expect(tree.isFelled).toBe(true);
    expect(onFelled).toHaveBeenCalledTimes(1);
  });

  it("only reacts to the axe", () => {
    TREE_FELLING.hits = 1;
    const { tree, onFelled } = addTree();
    actor.selectedTool = "pickaxe";

    actor.hit("pickaxe");

    expect(tree.isFelled).toBe(false);
    expect(onFelled).not.toHaveBeenCalled();
  });

  it("removes the collider at the felling hit, so the falling trunk does not block", () => {
    TREE_FELLING.hits = 1;
    addTree();
    expect(PhysicsManager.world.bodies.len()).toBe(1);
    expect(PhysicsManager.world.colliders.len()).toBe(1);

    actor.hit();

    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(PhysicsManager.world.colliders.len()).toBe(0);
  });

  it("is not interactable while falling and ignores further hits", () => {
    TREE_FELLING.hits = 1;
    const { tree, onFelled } = addTree();
    actor.hit();
    loop.step(1 / 60);

    expect(InteractionManager.focusedLabel).toBeNull();
    for (let i = 0; i < 5; i++) {
      actor.hit();
      loop.step(1 / 60);
    }

    expect(tree.isFelled).toBe(true);
    expect(onFelled).toHaveBeenCalledTimes(1);
  });

  it("falls away from the player, pivoting on its base with the eased progress", () => {
    TREE_FELLING.hits = 1;
    const { tree } = addTree();
    actor.hit();

    const duration = TREE_FELLING.fallDuration;
    loop.advance(duration / 2);

    expect(tree.object.position.toArray()).toEqual([0, 0, 0]);
    expect(leanDirection(tree.object).x).toBeCloseTo(1, 5);
    expect(leanDirection(tree.object).z).toBeCloseTo(0, 5);
    expect(leanAngle(tree.object)).toBeCloseTo(FALL_ANGLE * fallEase(0.5), 3);
  });

  it("falls the same way whatever the frame rate", () => {
    TREE_FELLING.hits = 1;
    const leanAfter = (delta: number): number => {
      const { tree } = addTree();
      actor.hit();
      loop.advance(0.6, delta);
      const angle = leanAngle(tree.object);
      loop.entities.clear();
      return angle;
    };

    const slow = leanAfter(1 / 20);
    const fast = leanAfter(1 / 120);

    expect(fast).toBeCloseTo(slow, 3);
    expect(fast).toBeCloseTo(
      FALL_ANGLE * fallEase(0.6 / TREE_FELLING.fallDuration),
      3,
    );
  });

  it("does not jump when felled mid-swing", () => {
    TREE_FELLING.hits = 2;
    const { tree } = addTree();
    actor.hit();
    loop.step(1 / 60, 6);
    const before = leanAngle(tree.object);
    expect(before).toBeGreaterThan(0.01);

    actor.hit();
    loop.step(1 / 240);

    expect(Math.abs(leanAngle(tree.object) - before)).toBeLessThan(0.02);
  });

  it("destroys itself through the entity manager when the fall ends", () => {
    TREE_FELLING.hits = 1;
    const { tree, onFallen } = addTree();
    actor.hit();
    const duration = TREE_FELLING.fallDuration;

    loop.advance(duration - 0.05);
    expect(loop.entities.get(tree.id)).toBe(tree);
    expect(onFallen).not.toHaveBeenCalled();

    loop.advance(0.1);
    expect(tree.isDestroyed).toBe(true);
    expect(loop.entities.get(tree.id)).toBeUndefined();
    expect(tree.object.parent).toBeNull();
    expect(onFallen).toHaveBeenCalledTimes(1);
    expect(onFallen).toHaveBeenCalledWith(tree);

    loop.advance(1);
    expect(onFallen).toHaveBeenCalledTimes(1);
  });

  it("follows a tuned fall duration", () => {
    TREE_FELLING.hits = 1;
    TREE_FELLING.fallDuration = 0.5;
    const { tree, onFallen } = addTree();
    actor.hit();

    loop.advance(0.6);

    expect(loop.entities.get(tree.id)).toBeUndefined();
    expect(onFallen).toHaveBeenCalledTimes(1);
  });

  it("can be removed mid-fall without calling onFallen", () => {
    TREE_FELLING.hits = 1;
    const { tree, onFallen } = addTree();
    actor.hit();
    loop.advance(0.3);

    tree.destroy();
    loop.step(1 / 60);
    loop.advance(TREE_FELLING.fallDuration);

    expect(loop.entities.get(tree.id)).toBeUndefined();
    expect(onFallen).not.toHaveBeenCalled();
  });

  it("removes its body on dispose and keeps the shared model resources", () => {
    addTree();
    const shared = models.shared.get("treePine")!;
    const disposeGeometry = vi.spyOn(shared.geometry, "dispose");
    const disposeMaterial = vi.spyOn(shared.material, "dispose");

    loop.entities.clear();

    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
  });
});

describe("Stump", () => {
  let models: ReturnType<typeof stubModels>;
  let loop: FrameLoop;
  let actor: FakeActor;

  beforeAll(async () => {
    await PhysicsManager.init();
  });

  afterAll(() => {
    PhysicsManager.dispose();
  });

  beforeEach(() => {
    models = stubModels();
    loop = new FrameLoop();
    actor = new FakeActor();
    InteractionManager.init(actor);
  });

  afterEach(() => {
    loop.entities.clear();
    InteractionManager.dispose();
    vi.restoreAllMocks();
    expect(PhysicsManager.world.bodies.len()).toBe(0);
  });

  it("clones its model through LoaderManager with the given transform", () => {
    const stump = loop.entities.add(
      new Stump(
        { x: 4, y: 0, z: -7 },
        { model: "stumpRound", rotation: 1.25, scale: 2 },
      ),
    );

    expect(models.instantiated).toEqual(["stumpRound"]);
    expect(stump.object.name).toBe("stumpRound");
    expect(stump.object.position.toArray()).toEqual([4, 0, -7]);
    expect(yaw(stump.object.quaternion)).toBeCloseTo(1.25);
    expect(stump.object.scale.toArray()).toEqual([2, 2, 2]);
    expect(stump.object.parent).toBe(loop.root);
  });

  it("uses stumpOld by default", () => {
    loop.entities.add(new Stump());

    expect(models.instantiated).toEqual(["stumpOld"]);
  });

  it("has a fixed collider standing on its position", () => {
    loop.entities.add(new Stump({ x: 4, y: 0, z: -7 }, { scale: 2 }));
    const world = PhysicsManager.world;

    expect(world.bodies.len()).toBe(1);
    expect(world.colliders.len()).toBe(1);
    world.bodies.forEach((body) => {
      expect(body.isFixed()).toBe(true);
      const { x, y, z } = body.translation();
      expect(x).toBeCloseTo(4);
      expect(z).toBeCloseTo(-7);
      // Centered on the scaled model's height
      expect(y).toBeCloseTo(STUMP_HEIGHT);
    });
  });

  it("is not interactable", () => {
    const stump = loop.entities.add(new Stump({ x: 0, y: 0, z: 0 }));
    actor.standNear(stump.object.position, { x: -1, z: 0 }, 1);

    InteractionManager.update();

    expect(InteractionManager.focusedLabel).toBeNull();
  });

  it("removes its body on dispose and keeps the shared model resources", () => {
    const stump = loop.entities.add(new Stump());
    const shared = models.shared.get("stumpOld")!;
    const disposeGeometry = vi.spyOn(shared.geometry, "dispose");
    const disposeMaterial = vi.spyOn(shared.material, "dispose");

    stump.destroy();
    loop.step(1 / 60);

    expect(loop.entities.get(stump.id)).toBeUndefined();
    expect(PhysicsManager.world.bodies.len()).toBe(0);
    expect(disposeGeometry).not.toHaveBeenCalled();
    expect(disposeMaterial).not.toHaveBeenCalled();
    stump.object.traverse((child) => {
      if (child instanceof Mesh) expect(child.geometry).toBe(shared.geometry);
    });
  });
});

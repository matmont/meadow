// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?debug"}
import { NumberController } from "lil-gui";
import type { Controller } from "lil-gui";
import type GUI from "lil-gui";
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
import DebugManager from "../../src/DebugManager";
import Inventory from "../../src/Inventory";
import PhysicsManager from "../../src/PhysicsManager";
import WorldChanges, { worldKey } from "../../src/WorldChanges";
import Stump from "../../src/entities/Stump";
import Tree, { TREE_REGROWTH } from "../../src/entities/Tree";
import Forest from "../../src/entities/World/Forest";
import { FrameLoop, stubModels } from "./helpers/felling";

// The camp tree, outside the chunks
const CAMP = { x: 3, z: -2 };
const CAMP_KEY = worldKey("camp", 0, 0, 0);

const DEFAULT_REGROWTH = { ...TREE_REGROWTH };

// With `?debug` in the URL, Forest's debug folder tunes the regrowth and can force it
describe("Forest debug folder: regrowth", () => {
  let loop: FrameLoop;
  let followed: Object3D;
  let worldChanges: WorldChanges;

  beforeAll(async () => {
    await PhysicsManager.init();
  });

  afterAll(() => {
    PhysicsManager.dispose();
    DebugManager.gui.destroy();
  });

  beforeEach(() => {
    stubModels();
    loop = new FrameLoop();
    followed = new Object3D();
    worldChanges = new WorldChanges();
  });

  afterEach(() => {
    loop.entities.clear();
    Object.assign(TREE_REGROWTH, DEFAULT_REGROWTH);
    vi.restoreAllMocks();
    expect(PhysicsManager.world.bodies.len()).toBe(0);
  });

  function addForest(): void {
    loop.entities.add(
      new Forest(followed, loop.entities, new Inventory(), worldChanges),
    );
    loop.step(1 / 60);
  }

  function forestFolder(): GUI {
    const folder = DebugManager.gui
      .foldersRecursive()
      .find((candidate) => candidate._title.startsWith("Forest "));
    if (!folder) throw new Error("Forest has no debug folder");
    return folder;
  }

  function regrowthController(property: string): Controller | undefined {
    return forestFolder().controllers.find(
      (candidate) =>
        candidate.object === TREE_REGROWTH && candidate.property === property,
    );
  }

  function regrowAllButton(): Controller {
    const button = forestFolder().controllers.find(
      (candidate) => candidate.property === "regrowAll",
    );
    if (!button) throw new Error("Forest has no regrow-all button");
    return button;
  }

  function isAtCamp(entity: Tree | Stump): boolean {
    return (
      entity.object.position.x === CAMP.x && entity.object.position.z === CAMP.z
    );
  }

  function campTree(): Tree | undefined {
    return loop.entities.getAll(Tree).find(isAtCamp);
  }

  function campStump(): Stump | undefined {
    return loop.entities.getAll(Stump).find(isAtCamp);
  }

  it("tunes the delay and the grow duration", () => {
    addForest();

    expect(regrowthController("delay")).toBeInstanceOf(NumberController);
    expect(regrowthController("growDuration")).toBeInstanceOf(NumberController);
  });

  it("allows a zero delay and a delay longer than the default", () => {
    addForest();
    const delay = regrowthController("delay") as NumberController;

    expect(delay._min).toBe(0);
    expect(delay._max).toBeGreaterThan(TREE_REGROWTH.delay);
  });

  it("tunes the grow duration with a positive minimum", () => {
    addForest();
    const duration = regrowthController("growDuration") as NumberController;

    expect(duration._min).toBeGreaterThan(0);
    expect(duration._max).toBeGreaterThan(TREE_REGROWTH.growDuration);
  });

  it("applies a new delay to the existing stumps", () => {
    worldChanges.markRemoved(CAMP_KEY, 0);
    addForest();
    loop.advance(5);
    expect(campStump()).toBeDefined();

    regrowthController("delay")!.setValue(2);
    loop.step(1 / 60);

    expect(TREE_REGROWTH.delay).toBe(2);
    expect(campStump()).toBeUndefined();
    expect(campTree()?.isGrowing).toBe(true);
  });

  it("regrows every stump at once with the button", () => {
    worldChanges.markRemoved(CAMP_KEY, 0);
    addForest();
    expect(campStump()).toBeDefined();

    regrowAllButton().getValue()();
    loop.step(1 / 60);

    expect(campStump()).toBeUndefined();
    expect(campTree()?.isGrowing).toBe(true);
    expect(worldChanges.removedAt(CAMP_KEY)).toBeUndefined();
    expect(loop.entities.getAll(Stump)).toHaveLength(0);
  });

  it("leaves the stump the followed object stands on", () => {
    worldChanges.markRemoved(CAMP_KEY, 0);
    followed.position.set(CAMP.x, 0, CAMP.z);
    addForest();

    regrowAllButton().getValue()();
    loop.step(1 / 60);

    expect(campTree()).toBeUndefined();
    expect(campStump()).toBeDefined();
    expect(worldChanges.removedAt(CAMP_KEY)).toBe(0);
  });
});

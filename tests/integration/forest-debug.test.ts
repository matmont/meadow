// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?debug"}
import { NumberController } from "lil-gui";
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
import WorldChanges from "../../src/entities/World/WorldChanges";
import { TREE_FELLING, TREE_SHAKE } from "../../src/entities/Tree";
import Forest from "../../src/entities/World/Forest";
import { FrameLoop, stubModels } from "./helpers/felling";

// With `?debug` in the URL, Forest's debug folder tunes the parameters shared by every tree
describe("Forest debug folder", () => {
  let loop: FrameLoop;

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
    loop.entities.add(
      new Forest(new Object3D(), loop.entities, new Inventory(), new WorldChanges()),
    );
  });

  afterEach(() => {
    loop.entities.clear();
    vi.restoreAllMocks();
  });

  function forestFolder(): GUI {
    const folder = DebugManager.gui
      .foldersRecursive()
      .find((candidate) => candidate._title.startsWith("Forest "));
    if (!folder) throw new Error("Forest has no debug folder");
    return folder;
  }

  it("is enabled by the URL", () => {
    expect(DebugManager.isEnabled).toBe(true);
  });

  it("exposes every felling parameter", () => {
    const properties = forestFolder()
      .controllers.filter((controller) => controller.object === TREE_FELLING)
      .map((controller) => controller.property)
      .sort();

    expect(properties).toEqual(["fallDuration", "hits", "wood"]);
  });

  it("keeps the shake parameters", () => {
    const properties = forestFolder()
      .controllers.filter((controller) => controller.object === TREE_SHAKE)
      .map((controller) => controller.property);

    expect(properties).toEqual(["frequency", "damping", "impulse", "maxTilt"]);
  });

  // Inventory only accepts positive integers, and a tree needs at least one hit
  it.each(["hits", "wood"] as const)("tunes %s in whole steps from 1", (property) => {
    const controller = forestFolder().controllers.find(
      (candidate) =>
        candidate.object === TREE_FELLING && candidate.property === property,
    );

    expect(controller).toBeInstanceOf(NumberController);
    const number = controller as NumberController;
    expect(number._min).toBe(1);
    expect(number._step).toBe(1);
  });

  it("tunes the fall duration with a positive minimum", () => {
    const controller = forestFolder().controllers.find(
      (candidate) =>
        candidate.object === TREE_FELLING &&
        candidate.property === "fallDuration",
    ) as NumberController;

    expect(controller._min).toBeGreaterThan(0);
    expect(controller._max).toBeGreaterThan(TREE_FELLING.fallDuration);
  });

  it("changes the shared object, so every tree follows", () => {
    const controller = forestFolder().controllers.find(
      (candidate) =>
        candidate.object === TREE_FELLING && candidate.property === "hits",
    )!;
    const previous = TREE_FELLING.hits;

    controller.setValue(8);

    expect(TREE_FELLING.hits).toBe(8);
    TREE_FELLING.hits = previous;
  });

  it("is destroyed with the forest", () => {
    loop.entities.clear();

    expect(
      DebugManager.gui
        .foldersRecursive()
        .some((candidate) => candidate._title.startsWith("Forest ")),
    ).toBe(false);
  });
});

// @vitest-environment happy-dom
// Tree imports Entity, whose DebugManager reads `location` when the module loads
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoaderManager from "../../LoaderManager";
import {
  FALL_ANGLE,
  TREE_FELLING,
  TREE_REGROWTH,
  fallEase,
  growEase,
  treeColliderRadius,
} from "../Tree";

describe("fallEase", () => {
  it("starts at 0 and ends at 1", () => {
    expect(fallEase(0)).toBe(0);
    expect(fallEase(1)).toBe(1);
  });

  it("is quadratic, so the fall starts slowly and speeds up", () => {
    expect(fallEase(0.5)).toBeCloseTo(0.25);
    expect(fallEase(0.25)).toBeCloseTo(0.0625);
    // The second half covers more angle than the first one
    expect(fallEase(1) - fallEase(0.5)).toBeGreaterThan(fallEase(0.5));
  });

  it("increases monotonically over the fall", () => {
    let previous = fallEase(0);
    for (let i = 1; i <= 100; i++) {
      const value = fallEase(i / 100);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("clamps progress outside [0, 1]", () => {
    expect(fallEase(-0.5)).toBe(0);
    expect(fallEase(-Infinity)).toBe(0);
    expect(fallEase(1.5)).toBe(1);
    expect(fallEase(Infinity)).toBe(1);
  });
});

describe("TREE_FELLING", () => {
  it("fells a tree after 5 hits by default", () => {
    expect(TREE_FELLING.hits).toBe(5);
  });

  it("gives 3 wood per tree by default, a positive integer as Inventory requires", () => {
    expect(TREE_FELLING.wood).toBe(3);
    expect(Number.isInteger(TREE_FELLING.wood)).toBe(true);
  });

  it("has a positive fall duration", () => {
    expect(TREE_FELLING.fallDuration).toBeGreaterThan(0);
  });
});

describe("FALL_ANGLE", () => {
  it("leans the felled tree almost flat, without going past horizontal", () => {
    expect(FALL_ANGLE).toBeGreaterThan(Math.PI / 3);
    expect(FALL_ANGLE).toBeLessThanOrEqual(Math.PI / 2);
  });
});

describe("TREE_REGROWTH", () => {
  it("regrows a tree 300 s of game time after it was felled by default", () => {
    expect(TREE_REGROWTH.delay).toBe(300);
  });

  it("has a positive grow duration, shorter than the delay", () => {
    expect(TREE_REGROWTH.growDuration).toBeGreaterThan(0);
    expect(TREE_REGROWTH.growDuration).toBeLessThan(TREE_REGROWTH.delay);
  });
});

describe("growEase", () => {
  it("starts at 0 and ends at 1", () => {
    expect(growEase(0)).toBe(0);
    expect(growEase(1)).toBe(1);
  });

  it("eases out, so the tree shoots up first and settles gently", () => {
    expect(growEase(0.5)).toBeCloseTo(0.875);
    expect(growEase(0.25)).toBeGreaterThan(0.25);
    // The first half covers more growth than the second one
    expect(growEase(0.5)).toBeGreaterThan(growEase(1) - growEase(0.5));
  });

  it("increases monotonically over the growth", () => {
    let previous = growEase(0);
    for (let i = 1; i <= 100; i++) {
      const value = growEase(i / 100);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it("clamps progress outside [0, 1]", () => {
    expect(growEase(-0.5)).toBe(0);
    expect(growEase(-Infinity)).toBe(0);
    expect(growEase(1.5)).toBe(1);
    expect(growEase(Infinity)).toBe(1);
  });
});

describe("treeColliderRadius", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // A 2 x 4 x 1 box model, with an asset scale on its root like the real glTF files
  function stubModel(assetScale = 1): void {
    vi.spyOn(LoaderManager, "instantiate").mockImplementation(() => {
      const root = new Group();
      root.scale.setScalar(assetScale);
      root.add(new Mesh(new BoxGeometry(2, 4, 1), new MeshBasicMaterial()));
      return root;
    });
  }

  it("is half the narrower horizontal side of the model", () => {
    stubModel();

    expect(treeColliderRadius("treeOak")).toBeCloseTo(0.5);
  });

  it("grows with the scale", () => {
    stubModel();

    expect(treeColliderRadius("treeOak", 2)).toBeCloseTo(1);
    expect(treeColliderRadius("treeOak", 0.5)).toBeCloseTo(0.25);
  });

  it("includes the asset scale of the model", () => {
    stubModel(3);

    expect(treeColliderRadius("treeOak")).toBeCloseTo(1.5);
    expect(treeColliderRadius("treeOak", 2)).toBeCloseTo(3);
  });

  it("measures the model it is given", () => {
    stubModel();

    treeColliderRadius("treePineTall");

    expect(LoaderManager.instantiate).toHaveBeenCalledWith("treePineTall");
  });
});

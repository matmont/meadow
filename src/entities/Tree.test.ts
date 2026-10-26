// @vitest-environment happy-dom
// Tree imports Entity, whose DebugManager reads `location` when the module loads
import { describe, expect, it } from "vitest";
import { FALL_ANGLE, TREE_FELLING, fallEase } from "./Tree";

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

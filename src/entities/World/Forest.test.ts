// @vitest-environment happy-dom
// Forest imports Entity, whose DebugManager reads `location` when the module loads
import { describe, expect, it } from "vitest";
import { isRegrowthDue } from "./Forest";

describe("isRegrowthDue", () => {
  it("is not due before the delay has passed", () => {
    expect(isRegrowthDue(10, 10, 300)).toBe(false);
    expect(isRegrowthDue(10, 309, 300)).toBe(false);
    expect(isRegrowthDue(10, 309.999, 300)).toBe(false);
  });

  it("is due exactly when the delay has passed", () => {
    expect(isRegrowthDue(10, 310, 300)).toBe(true);
    expect(isRegrowthDue(0, 300, 300)).toBe(true);
    expect(isRegrowthDue(0.5, 1.5, 1)).toBe(true);
  });

  it("stays due after the delay", () => {
    expect(isRegrowthDue(10, 310.001, 300)).toBe(true);
    expect(isRegrowthDue(10, 10_000, 300)).toBe(true);
  });

  it("is due at once with a zero delay", () => {
    expect(isRegrowthDue(42, 42, 0)).toBe(true);
  });

  it("follows the delay it is given, so a new delay applies to old removals", () => {
    // Removed at 100, checked at 200: 100 s have passed
    expect(isRegrowthDue(100, 200, 300)).toBe(false);
    expect(isRegrowthDue(100, 200, 100)).toBe(true);
    expect(isRegrowthDue(100, 200, 50)).toBe(true);
    expect(isRegrowthDue(100, 200, 100.5)).toBe(false);
  });
});

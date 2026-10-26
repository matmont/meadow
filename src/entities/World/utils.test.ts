import { describe, expect, it } from "vitest";
import { createSeededRandom } from "./utils";

function take(random: () => number, count: number): number[] {
  return Array.from({ length: count }, () => random());
}

describe("createSeededRandom", () => {
  it("returns the same sequence for the same seed", () => {
    expect(take(createSeededRandom(42), 20)).toEqual(
      take(createSeededRandom(42), 20),
    );
  });

  it("returns different sequences for different seeds", () => {
    expect(take(createSeededRandom(1), 20)).not.toEqual(
      take(createSeededRandom(2), 20),
    );
  });

  it("returns values in [0, 1)", () => {
    for (const value of take(createSeededRandom(0x3a17c9), 1000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("does not repeat the same value on consecutive calls", () => {
    const values = take(createSeededRandom(7), 100);
    expect(new Set(values).size).toBe(values.length);
  });
});

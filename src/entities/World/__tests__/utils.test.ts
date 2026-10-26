import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../utils";

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

  // The world layout is generated from these values, so changing the generator moves every
  // tree and plant. Update the expected values only when that is intended
  it("keeps producing the same values for a known seed", () => {
    const values = take(createSeededRandom(42), 3);
    expect(values[0]).toBeCloseTo(0.6011037519201636, 12);
    expect(values[1]).toBeCloseTo(0.44829055899754167, 12);
    expect(values[2]).toBeCloseTo(0.8524657934904099, 12);
  });

  it("keeps generators with the same seed independent", () => {
    const first = createSeededRandom(99);
    const second = createSeededRandom(99);
    const interleaved: number[] = [];
    for (let i = 0; i < 10; i++) {
      interleaved.push(first());
      second();
    }

    expect(interleaved).toEqual(take(createSeededRandom(99), 10));
  });

  it("returns values in [0, 1) for edge-case seeds", () => {
    for (const seed of [0, -1, 1, 2 ** 31 - 1, -(2 ** 31), 2 ** 32 - 1]) {
      for (const value of take(createSeededRandom(seed), 200)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it("spreads values evenly across [0, 1)", () => {
    const buckets = new Array<number>(10).fill(0);
    const count = 10000;
    for (const value of take(createSeededRandom(0x3a17c9), count)) {
      buckets[Math.floor(value * buckets.length)]!++;
    }

    // Each bucket expects 1000 values; 15% leaves room for normal variation
    for (const bucket of buckets) {
      expect(bucket).toBeGreaterThan(850);
      expect(bucket).toBeLessThan(1150);
    }
  });
});

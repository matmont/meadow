import { describe, expect, it } from "vitest";
import WorldChanges, { worldKey } from "./WorldChanges";

describe("worldKey", () => {
  it("returns the same key for the same object", () => {
    expect(worldKey("forest", 2, -3, 1)).toBe(worldKey("forest", 2, -3, 1));
  });

  it("keeps multi-digit coordinates apart", () => {
    expect(worldKey("a", 1, 23, 4)).not.toBe(worldKey("a", 12, 3, 4));
    expect(worldKey("a", 1, 2, 34)).not.toBe(worldKey("a", 1, 23, 4));
  });

  it("keeps negative coordinates apart", () => {
    const keys = new Set([
      worldKey("forest", 1, 1, 0),
      worldKey("forest", -1, 1, 0),
      worldKey("forest", 1, -1, 0),
      worldKey("forest", -1, -1, 0),
    ]);
    expect(keys.size).toBe(4);
  });

  it("keeps layers apart, even when a layer contains separators", () => {
    expect(worldKey("forest", 0, 0, 0)).not.toBe(worldKey("camp", 0, 0, 0));
    expect(worldKey("a:1,2,3", 4, 5, 6)).not.toBe(worldKey("a", 1, 2, 3));
    expect(worldKey("a:1", 2, 3, 4)).not.toBe(worldKey("a", 1, 2, 3));
  });

  it("treats -0 as 0", () => {
    expect(worldKey("forest", -0, -0, 0)).toBe(worldKey("forest", 0, 0, 0));
  });

  it.each([
    [1.5, 0, 0],
    [0, Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0, 0],
    [0, 0, -1],
    [0, 0, 0.5],
    [2 ** 60, 0, 0],
  ])("rejects chunk (%s, %s) with index %s", (chunkX, chunkZ, index) => {
    expect(() => worldKey("forest", chunkX, chunkZ, index)).toThrow(RangeError);
  });

  it("rejects an empty layer", () => {
    expect(() => worldKey("", 0, 0, 0)).toThrow(RangeError);
  });
});

describe("WorldChanges", () => {
  const key = worldKey("forest", 3, -2, 1);

  it("starts with every object in its generated state", () => {
    expect(new WorldChanges().removedAt(key)).toBeUndefined();
  });

  it("records the removal time", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 12.5);
    expect(changes.removedAt(key)).toBe(12.5);
    expect(changes.removedAt(worldKey("forest", 3, -2, 2))).toBeUndefined();
  });

  it("accepts a removal at time zero", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 0);
    expect(changes.removedAt(key)).toBe(0);
  });

  it("overwrites the time when removed again", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 10);
    changes.markRemoved(key, 40);
    expect(changes.removedAt(key)).toBe(40);
  });

  it("restores an object to its generated state", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 10);
    changes.restore(key);
    expect(changes.removedAt(key)).toBeUndefined();
    changes.restore(key);
    expect(changes.removedAt(key)).toBeUndefined();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the invalid time %s without changing the state",
    (time) => {
      const changes = new WorldChanges();
      changes.markRemoved(key, 5);
      expect(() => changes.markRemoved(key, time)).toThrow(RangeError);
      expect(changes.removedAt(key)).toBe(5);
    },
  );

  it("keeps separate instances independent", () => {
    const first = new WorldChanges();
    first.markRemoved(key, 1);
    expect(new WorldChanges().removedAt(key)).toBeUndefined();
  });
});

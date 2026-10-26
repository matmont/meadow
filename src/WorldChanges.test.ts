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

describe("worldKey uniqueness sweep", () => {
  const LAYERS = [
    "forest",
    "camp",
    "a",
    "a:1",
    "a,1",
    "a:1,2,3",
    ":",
    ",",
    "-",
    "forest:0,0",
  ];
  const COORDS = [
    Number.MIN_SAFE_INTEGER,
    -123,
    -12,
    -1,
    -0,
    0,
    1,
    3,
    12,
    23,
    123,
    Number.MAX_SAFE_INTEGER,
  ];
  const INDICES = [0, 1, 3, 4, 12, 23, 34, Number.MAX_SAFE_INTEGER];

  it("maps every distinct (layer, chunkX, chunkZ, index) to a distinct key", () => {
    // -0 and 0 are the same chunk, so the tuple is normalized before comparing
    const owners = new Map<string, string>();
    for (const layer of LAYERS) {
      for (const chunkX of COORDS) {
        for (const chunkZ of COORDS) {
          for (const index of INDICES) {
            const tuple = JSON.stringify([layer, chunkX + 0, chunkZ + 0, index]);
            const key = worldKey(layer, chunkX, chunkZ, index);
            const owner = owners.get(key);
            if (owner !== undefined && owner !== tuple) {
              throw new Error(`${tuple} and ${owner} share the key ${key}`);
            }
            owners.set(key, tuple);
          }
        }
      }
    }
    // COORDS holds both -0 and 0, which are one chunk coordinate
    const distinctTuples =
      LAYERS.length * (COORDS.length - 1) ** 2 * INDICES.length;
    expect(owners.size).toBe(distinctTuples);
  });

  it("does not depend on the sign of zero in the index", () => {
    expect(worldKey("forest", 1, 2, -0)).toBe(worldKey("forest", 1, 2, 0));
  });
});

describe("worldKey validation", () => {
  const INVALID_NUMBERS = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    0.5,
    -2.25,
    Number.EPSILON,
    2 ** 53,
    -(2 ** 53),
  ];

  it.each(INVALID_NUMBERS)("rejects %s as chunkX", (value) => {
    expect(() => worldKey("forest", value, 0, 0)).toThrow(RangeError);
  });

  it.each(INVALID_NUMBERS)("rejects %s as chunkZ", (value) => {
    expect(() => worldKey("forest", 0, value, 0)).toThrow(RangeError);
  });

  it.each([...INVALID_NUMBERS, -1, Number.MIN_SAFE_INTEGER])(
    "rejects %s as index",
    (value) => {
      expect(() => worldKey("forest", 0, 0, value)).toThrow(RangeError);
    },
  );

  it("accepts the safe-integer bounds and index zero", () => {
    expect(() =>
      worldKey(
        "forest",
        Number.MIN_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER,
      ),
    ).not.toThrow();
    expect(() => worldKey("forest", -5, -7, 0)).not.toThrow();
  });

  it("accepts a one-character layer", () => {
    expect(() => worldKey("x", 0, 0, 0)).not.toThrow();
  });
});

describe("WorldChanges edge cases", () => {
  const key = worldKey("forest", -4, 7, 2);
  const other = worldKey("forest", -4, 7, 3);

  it("overwrites with an earlier time as well", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 40);
    changes.markRemoved(key, 10);
    expect(changes.removedAt(key)).toBe(10);
  });

  it("accepts large finite times", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, Number.MAX_VALUE);
    expect(changes.removedAt(key)).toBe(Number.MAX_VALUE);
  });

  it.each([
    -Number.MIN_VALUE,
    -0.001,
    Number.NEGATIVE_INFINITY,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])(
    "leaves an unknown key in its generated state when time %s is rejected",
    (time) => {
      const changes = new WorldChanges();
      expect(() => changes.markRemoved(key, time)).toThrow(RangeError);
      expect(changes.removedAt(key)).toBeUndefined();
    },
  );

  it("does not touch other keys when a removal is rejected", () => {
    const changes = new WorldChanges();
    changes.markRemoved(other, 3);
    expect(() => changes.markRemoved(key, Number.NaN)).toThrow(RangeError);
    expect(changes.removedAt(other)).toBe(3);
    expect(changes.removedAt(key)).toBeUndefined();
  });

  it("restores an unknown key without throwing", () => {
    const changes = new WorldChanges();
    expect(() => changes.restore(key)).not.toThrow();
    expect(changes.removedAt(key)).toBeUndefined();
  });

  it("restores only the given key", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 1);
    changes.markRemoved(other, 2);
    changes.restore(key);
    expect(changes.removedAt(key)).toBeUndefined();
    expect(changes.removedAt(other)).toBe(2);
  });

  it("can remove an object again after restoring it", () => {
    const changes = new WorldChanges();
    changes.markRemoved(key, 1);
    changes.restore(key);
    changes.markRemoved(key, 9);
    expect(changes.removedAt(key)).toBe(9);
  });

  it("keeps instances isolated for removals and restores in both directions", () => {
    const first = new WorldChanges();
    const second = new WorldChanges();
    first.markRemoved(key, 1);
    second.markRemoved(other, 2);
    expect(second.removedAt(key)).toBeUndefined();
    expect(first.removedAt(other)).toBeUndefined();

    second.markRemoved(key, 5);
    first.restore(key);
    expect(first.removedAt(key)).toBeUndefined();
    expect(second.removedAt(key)).toBe(5);
  });

  it("keeps the same chunk and index in different layers apart", () => {
    const changes = new WorldChanges();
    changes.markRemoved(worldKey("forest", 0, 0, 0), 1);
    expect(changes.removedAt(worldKey("rocks", 0, 0, 0))).toBeUndefined();
  });
});

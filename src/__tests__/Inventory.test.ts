import { describe, expect, expectTypeOf, it } from "vitest";
import Inventory, { RESOURCE_IDS } from "../Inventory";
import type { ResourceId } from "../Inventory";

// Compile-time complete list of `ResourceId`: adding or removing a member of the union
// fails `tsc` here until this record is updated, and the runtime test below then checks
// that `RESOURCE_IDS` was updated too
const EVERY_RESOURCE: Record<ResourceId, true> = {
  wood: true,
  stone: true,
  mushroom: true,
};

describe("Inventory", () => {
  it("starts every resource at zero", () => {
    const inventory = new Inventory();
    for (const resource of RESOURCE_IDS) {
      expect(inventory.count(resource)).toBe(0);
    }
  });

  it("adds one unit when no amount is given", () => {
    const inventory = new Inventory();
    inventory.add("wood");
    expect(inventory.count("wood")).toBe(1);
  });

  it("accumulates repeated additions", () => {
    const inventory = new Inventory();
    inventory.add("stone", 3);
    inventory.add("stone");
    inventory.add("stone", 2);
    expect(inventory.count("stone")).toBe(6);
  });

  it("keeps each resource separate", () => {
    const inventory = new Inventory();
    inventory.add("wood", 4);
    inventory.add("mushroom", 2);
    expect(inventory.count("wood")).toBe(4);
    expect(inventory.count("mushroom")).toBe(2);
    expect(inventory.count("stone")).toBe(0);
  });

  it("keeps separate instances independent", () => {
    const first = new Inventory();
    const second = new Inventory();
    first.add("wood", 5);
    expect(second.count("wood")).toBe(0);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects the invalid amount %s without changing the count",
    (amount) => {
      const inventory = new Inventory();
      inventory.add("wood", 2);
      expect(() => inventory.add("wood", amount)).toThrow(RangeError);
      expect(inventory.count("wood")).toBe(2);
    },
  );

  it("lists resources in display order", () => {
    expect(RESOURCE_IDS).toEqual(["wood", "stone", "mushroom"]);
  });
});

describe("Inventory contract", () => {
  it("exposes the agreed types", () => {
    expectTypeOf(RESOURCE_IDS).toEqualTypeOf<readonly ResourceId[]>();
    expectTypeOf<Inventory["add"]>().toEqualTypeOf<
      (resource: ResourceId, amount?: number) => void
    >();
    expectTypeOf<Inventory["count"]>().toEqualTypeOf<
      (resource: ResourceId) => number
    >();
  });

  it("has only add and count as public methods, with no removal API", () => {
    expect(Object.getOwnPropertyNames(Inventory.prototype).sort()).toEqual([
      "add",
      "constructor",
      "count",
    ]);
    expect(Object.keys(new Inventory())).toEqual([]);
  });

  it("lists every resource id exactly once", () => {
    expect(new Set(RESOURCE_IDS).size).toBe(RESOURCE_IDS.length);
    expect([...RESOURCE_IDS].sort()).toEqual(Object.keys(EVERY_RESOURCE).sort());
  });

  it("counts every listed resource", () => {
    const inventory = new Inventory();
    for (const resource of RESOURCE_IDS) {
      inventory.add(resource, 2);
      expect(inventory.count(resource)).toBe(2);
    }
  });
});

describe("Inventory.add", () => {
  it("adds one unit when the amount is explicitly undefined", () => {
    const inventory = new Inventory();
    inventory.add("mushroom", undefined);
    expect(inventory.count("mushroom")).toBe(1);
  });

  it("adds the exact amount given", () => {
    const inventory = new Inventory();
    inventory.add("wood", 7);
    expect(inventory.count("wood")).toBe(7);
  });

  it("accepts the largest safe integer", () => {
    const inventory = new Inventory();
    inventory.add("stone", Number.MAX_SAFE_INTEGER);
    expect(inventory.count("stone")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("accumulates large amounts exactly", () => {
    const inventory = new Inventory();
    inventory.add("wood", 1_000_000_000);
    inventory.add("wood", 2_000_000_000);
    inventory.add("wood");
    expect(inventory.count("wood")).toBe(3_000_000_001);
  });

  it.each([
    -0,
    -1.5,
    0.5,
    1e-9,
    Number.MIN_VALUE,
    Number.EPSILON,
    Number.NEGATIVE_INFINITY,
    -Number.MAX_SAFE_INTEGER,
  ])("rejects the invalid amount %s", (amount) => {
    const inventory = new Inventory();
    expect(() => inventory.add("stone", amount)).toThrow(RangeError);
    expect(inventory.count("stone")).toBe(0);
  });

  it("leaves every resource unchanged after a rejected add", () => {
    const inventory = new Inventory();
    inventory.add("wood", 3);
    inventory.add("stone", 4);
    inventory.add("mushroom", 5);
    expect(() => inventory.add("stone", -2)).toThrow(RangeError);
    expect(inventory.count("wood")).toBe(3);
    expect(inventory.count("stone")).toBe(4);
    expect(inventory.count("mushroom")).toBe(5);
  });

  it("keeps working normally after a rejected add", () => {
    const inventory = new Inventory();
    expect(() => inventory.add("wood", Number.NaN)).toThrow(RangeError);
    inventory.add("wood", 2);
    expect(inventory.count("wood")).toBe(2);
  });
});

describe("Inventory.count", () => {
  it("returns a primitive number", () => {
    const inventory = new Inventory();
    inventory.add("wood", 2);
    expect(typeof inventory.count("wood")).toBe("number");
    expect(typeof inventory.count("stone")).toBe("number");
  });

  it("returns the same value on repeated reads without side effects", () => {
    const inventory = new Inventory();
    inventory.add("mushroom", 3);
    for (let i = 0; i < 100; i++) {
      expect(inventory.count("mushroom")).toBe(3);
    }
    expect(inventory.count("wood")).toBe(0);
  });
});

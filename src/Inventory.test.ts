import { describe, expect, it } from "vitest";
import Inventory, { RESOURCE_IDS } from "./Inventory";

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

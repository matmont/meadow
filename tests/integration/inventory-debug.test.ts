// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost/?debug"}
import type GUI from "lil-gui";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import DebugManager from "../../src/DebugManager";
import Inventory, { RESOURCE_IDS } from "../../src/Inventory";

function inventoryFolders(): GUI[] {
  return DebugManager.gui.folders.filter(
    (folder) => folder._title === "Inventory",
  );
}

// With `?debug` in the URL, each Inventory owns an "Inventory" folder that adds resources
describe("Inventory debug folder", () => {
  const inventories: Inventory[] = [];

  function createInventory(): Inventory {
    const inventory = new Inventory();
    inventories.push(inventory);
    return inventory;
  }

  afterEach(() => {
    for (const inventory of inventories) inventory.dispose();
    inventories.length = 0;
  });

  afterAll(() => {
    DebugManager.dispose();
  });

  it("creates one folder with an add button per resource", () => {
    createInventory();
    const folders = inventoryFolders();
    expect(folders).toHaveLength(1);
    expect(folders[0].controllers.map((controller) => controller._name)).toEqual(
      RESOURCE_IDS.map((resource) => `add 1 ${resource}`),
    );
  });

  it("adds one unit of the matching resource when a button is pressed", () => {
    const inventory = createInventory();
    const [folder] = inventoryFolders();
    const stone = folder.controllers[RESOURCE_IDS.indexOf("stone")];
    (stone.getValue() as () => void)();
    (stone.getValue() as () => void)();
    expect(inventory.count("stone")).toBe(2);
    expect(inventory.count("wood")).toBe(0);
    expect(inventory.count("mushroom")).toBe(0);
  });

  it("removes its folder on dispose, so an HMR reload leaves only one", () => {
    // Not tracked: it is disposed here, and lil-gui must not destroy the same folder twice
    const first = new Inventory();
    first.dispose();
    expect(inventoryFolders()).toHaveLength(0);

    createInventory();
    expect(inventoryFolders()).toHaveLength(1);
  });
});

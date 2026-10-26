// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Inventory from "../../src/Inventory";
import type { ResourceId } from "../../src/Inventory";
import UIManager from "../../src/UIManager";
import ResourceCounter from "../../src/ui/ResourceCounter/ResourceCounter";
import styles from "../../src/ui/ResourceCounter/ResourceCounter.module.css";

// The icons are rendered with WebGL, which happy-dom does not provide
vi.mock("../../src/ui/ResourceCounter/icons", () => ({
  renderResourceIcons: (): Record<ResourceId, string> => ({
    wood: "data:wood",
    stone: "data:stone",
    mushroom: "data:mushroom",
  }),
}));

function visibleEntries(counter: ResourceCounter): string[] {
  return Array.from(counter.element.children as HTMLCollectionOf<HTMLElement>)
    .filter((entry) => !entry.classList.contains(styles.hidden))
    .map((entry) => `${entry.title}:${entry.querySelector("span")?.textContent}`);
}

describe("ResourceCounter with Inventory and UIManager", () => {
  let root: HTMLElement;
  let inventory: Inventory;
  let counter: ResourceCounter;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.append(root);
    UIManager.init(root);
    inventory = new Inventory();
    counter = UIManager.add(new ResourceCounter(inventory), "topRight");
  });

  afterEach(() => {
    UIManager.dispose();
    root.remove();
  });

  it("mounts in the topRight slot, hidden while the inventory is empty", () => {
    expect(counter.element.parentElement?.className).toContain(
      "ui-slot--topRight",
    );
    expect(counter.element.classList.contains(styles.hidden)).toBe(true);
  });

  it("reflects inventory additions on the next UIManager.update", () => {
    inventory.add("mushroom", 3);
    inventory.add("wood");

    // The HUD only changes when UIManager syncs it, once per frame
    expect(counter.element.classList.contains(styles.hidden)).toBe(true);

    UIManager.update(1 / 60);

    expect(counter.element.classList.contains(styles.hidden)).toBe(false);
    expect(visibleEntries(counter)).toEqual(["Wood:1", "Mushrooms:3"]);

    inventory.add("stone", 2);
    inventory.add("wood");
    UIManager.update(1 / 60);

    expect(visibleEntries(counter)).toEqual(["Wood:2", "Stone:2", "Mushrooms:3"]);
  });

  it("leaves no counter behind after dispose and a new init (HMR)", () => {
    UIManager.dispose();
    expect(root.childElementCount).toBe(0);

    UIManager.init(root);
    UIManager.add(new ResourceCounter(inventory), "topRight");

    expect(root.querySelectorAll(`.${styles.panel}`)).toHaveLength(1);
  });
});

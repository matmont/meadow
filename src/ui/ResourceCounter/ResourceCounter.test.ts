// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResourceId } from "../../Inventory";
import ResourceCounter from "./ResourceCounter";
import type { ResourceCounterSource } from "./ResourceCounter";
import styles from "./ResourceCounter.module.css";

// The icons are rendered with WebGL, which happy-dom does not provide
vi.mock("./icons", () => ({
  renderResourceIcons: (): Record<ResourceId, string> => ({
    wood: "data:wood",
    stone: "data:stone",
    mushroom: "data:mushroom",
  }),
}));

class FakeSource implements ResourceCounterSource {
  readonly counts: Record<ResourceId, number> = {
    wood: 0,
    stone: 0,
    mushroom: 0,
  };

  count(resource: ResourceId): number {
    return this.counts[resource];
  }
}

function entries(counter: ResourceCounter): HTMLElement[] {
  return Array.from(counter.element.children) as HTMLElement[];
}

function entryOf(counter: ResourceCounter, title: string): HTMLElement {
  const entry = entries(counter).find((element) => element.title === title);
  if (!entry) throw new Error(`No entry titled ${title}`);
  return entry;
}

function valueOf(entry: HTMLElement): string | null {
  return entry.querySelector("span")?.textContent ?? null;
}

function isHidden(element: HTMLElement): boolean {
  return element.classList.contains(styles.hidden);
}

function visibleTitles(counter: ResourceCounter): string[] {
  return entries(counter)
    .filter((entry) => !isHidden(entry))
    .map((entry) => entry.title);
}

describe("ResourceCounter", () => {
  let source: FakeSource;
  let counter: ResourceCounter;

  beforeEach(() => {
    source = new FakeSource();
    counter = new ResourceCounter(source);
  });

  it("uses distinct CSS module classes for the hidden state", () => {
    // Guards the assertions below: they rely on `styles.hidden` being a real class name
    expect(styles.hidden).toBeTruthy();
    expect(styles.hidden).not.toBe(styles.entry);
  });

  it("creates one entry per resource in RESOURCE_IDS order", () => {
    expect(entries(counter).map((entry) => entry.title)).toEqual([
      "Wood",
      "Stone",
      "Mushrooms",
    ]);
  });

  it("shows an icon with an alt label for every entry", () => {
    const images = entries(counter).map((entry) => entry.querySelector("img"));
    expect(images.map((image) => image?.alt)).toEqual([
      "Wood",
      "Stone",
      "Mushrooms",
    ]);
    expect(images.map((image) => image?.getAttribute("src"))).toEqual([
      "data:wood",
      "data:stone",
      "data:mushroom",
    ]);
  });

  it("hides the whole panel while every count is 0", () => {
    counter.sync();

    expect(isHidden(counter.element)).toBe(true);
    expect(visibleTitles(counter)).toEqual([]);
  });

  it("shows the panel and only the entries above 0", () => {
    source.counts.stone = 2;
    counter.sync();

    expect(isHidden(counter.element)).toBe(false);
    expect(visibleTitles(counter)).toEqual(["Stone"]);
    expect(valueOf(entryOf(counter, "Stone"))).toBe("2");
  });

  it("keeps RESOURCE_IDS order among the visible entries", () => {
    source.counts.mushroom = 1;
    source.counts.wood = 4;
    counter.sync();

    expect(visibleTitles(counter)).toEqual(["Wood", "Mushrooms"]);
  });

  it("updates the number when a count changes", () => {
    source.counts.wood = 1;
    counter.sync();
    source.counts.wood = 12;
    counter.sync();

    expect(valueOf(entryOf(counter, "Wood"))).toBe("12");
  });

  it("hides an entry and the panel again when counts go back to 0", () => {
    source.counts.wood = 1;
    counter.sync();
    source.counts.wood = 0;
    counter.sync();

    expect(isHidden(entryOf(counter, "Wood"))).toBe(true);
    expect(isHidden(counter.element)).toBe(true);
  });

  it("does not touch the DOM when no value changed", () => {
    source.counts.wood = 3;
    counter.sync();

    const wood = entryOf(counter, "Wood");
    const value = wood.querySelector("span");
    if (!value) throw new Error("Missing value element");
    const textWrites = vi.spyOn(value, "textContent", "set");
    const panelToggles = vi.spyOn(counter.element.classList, "toggle");
    const entryToggles = vi.spyOn(wood.classList, "toggle");

    counter.sync();
    counter.sync();

    expect(textWrites).not.toHaveBeenCalled();
    expect(panelToggles).not.toHaveBeenCalled();
    expect(entryToggles).not.toHaveBeenCalled();
  });

  it("pulses an entry when its count increases, not when it decreases", () => {
    source.counts.wood = 2;
    counter.sync();
    const wood = entryOf(counter, "Wood");
    expect(wood.classList.contains(styles.pulse)).toBe(true);

    wood.classList.remove(styles.pulse);
    source.counts.wood = 1;
    counter.sync();
    expect(wood.classList.contains(styles.pulse)).toBe(false);
  });
});

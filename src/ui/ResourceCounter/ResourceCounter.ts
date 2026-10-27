import { RESOURCE_IDS } from "../../Inventory";
import type { ResourceId } from "../../Inventory";
import { UIComponent } from "../UIComponent";
import { h } from "../dom";
import { renderResourceIcons } from "./icons";
import styles from "./ResourceCounter.module.css";

export interface ResourceCounterSource {
  count(resource: ResourceId): number;
}

const RESOURCE_NAMES: Record<ResourceId, string> = {
  wood: "Wood",
  stone: "Stone",
  mushroom: "Mushrooms",
};

// Lists only the resources the player carries, in `RESOURCE_IDS` order; the whole panel is
// hidden while every count is 0, to keep the HUD minimal
export default class ResourceCounter extends UIComponent {
  readonly #source: ResourceCounterSource;

  constructor(source: ResourceCounterSource) {
    super(h("div", { className: styles.panel }));
    this.#source = source;

    this.bind(
      () => this.#isEmpty(),
      (empty) => {
        this.element.classList.toggle(styles.hidden, empty);
      },
    );

    const icons = renderResourceIcons(RESOURCE_IDS);
    for (const resource of RESOURCE_IDS) {
      const icon = h("img", { className: styles.icon });
      icon.src = icons[resource];
      icon.alt = RESOURCE_NAMES[resource];
      const value = h("span", { className: styles.value });
      const entry = h("div", { className: styles.entry }, icon, value);
      entry.title = RESOURCE_NAMES[resource];
      this.element.append(entry);

      let previous = 0;
      this.bind(
        () => this.#source.count(resource),
        (count) => {
          value.textContent = String(count);
          entry.classList.toggle(styles.hidden, count === 0);
          if (count > previous) restartPulse(entry);
          previous = count;
        },
      );
    }
  }

  #isEmpty(): boolean {
    for (const resource of RESOURCE_IDS) {
      if (this.#source.count(resource) > 0) return false;
    }
    return true;
  }
}

// Removing and re-adding the class does not restart a CSS animation within the same frame:
// reading layout in between makes the browser drop the old one first. It only runs when a
// count increases, never every frame
function restartPulse(entry: HTMLElement): void {
  entry.classList.remove(styles.pulse);
  void entry.offsetWidth;
  entry.classList.add(styles.pulse);
}

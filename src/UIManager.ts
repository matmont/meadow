import "./ui/ui.css";
import { h } from "./ui/dom";
import type { UIComponent } from "./ui/UIComponent";

export type UISlot =
  | "world"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight"
  | "center";

// Order-matter, so world-anchored elements stay below the rest of the HUD
const SLOTS: readonly UISlot[] = [
  "world",
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
  "center",
];

export default class UIManager {
  static readonly #slots = new Map<UISlot, HTMLElement>();
  static readonly #components = new Set<UIComponent>();

  private constructor() {}

  static init(root: HTMLElement): void {
    if (UIManager.#slots.size > 0) return;

    for (const slot of SLOTS) {
      const element = h("div", { className: `ui-slot ui-slot--${slot}` });
      root.append(element);
      UIManager.#slots.set(slot, element);
    }
  }

  static add<T extends UIComponent>(component: T, slot: UISlot): T {
    const container = UIManager.#slots.get(slot);
    if (!container) {
      throw new Error("UIManager is not initialized. Call init() first.");
    }
    if (UIManager.#components.has(component)) return component;

    UIManager.#components.add(component);
    container.append(component.element);
    component.sync();
    component.onMounted();
    return component;
  }

  static remove(component: UIComponent): boolean {
    if (!UIManager.#components.delete(component)) return false;

    component.onUnmounted();
    component.element.remove();
    component.dispose();
    return true;
  }

  static update(delta: number): void {
    for (const component of UIManager.#components) {
      component.update(delta);
      component.sync();
    }
  }

  static dispose(): void {
    for (const component of UIManager.#components) {
      UIManager.remove(component);
    }
    for (const slot of UIManager.#slots.values()) slot.remove();
    UIManager.#slots.clear();
  }
}

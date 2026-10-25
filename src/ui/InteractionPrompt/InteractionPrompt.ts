import { Vector3 } from "three";
import type { Camera } from "three";
import type { KeyCode } from "../../InputManager";
import { UIComponent } from "../UIComponent";
import { h } from "../dom";
import { keyCap, keyLabel } from "../keys";
import styles from "./InteractionPrompt.module.css";

export interface InteractionPromptSource {
  readonly focusedLabel: string | null;
  readonly focusedKey: KeyCode | null;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly anchorZ: number;
}

// Mount in the "world" slot: the prompt is positioned in pixels over the projected anchor
export default class InteractionPrompt extends UIComponent {
  readonly #source: InteractionPromptSource;
  readonly #camera: Camera;
  readonly #projected = new Vector3();
  #x = 0;
  #y = 0;
  #onScreen = false;

  constructor(source: InteractionPromptSource, camera: Camera) {
    const key = keyCap(styles.key);
    const label = h("span", { className: styles.label });
    super(h("div", { className: styles.prompt }, key, label));
    this.#source = source;
    this.#camera = camera;

    this.bind(
      () => this.#source.focusedLabel !== null && this.#onScreen,
      (visible) => {
        this.element.classList.toggle(styles.visible, visible);
      },
    );
    // A null label keeps the previous text, so it is still readable while fading out
    this.bind(
      () => this.#source.focusedLabel,
      (text) => {
        if (text !== null) label.textContent = text;
      },
    );
    this.bind(
      () => this.#source.focusedKey,
      (code) => {
        if (code !== null) key.textContent = keyLabel(code);
      },
    );
    this.bind(
      () => this.#x,
      (x) => this.element.style.setProperty("--x", `${x}px`),
    );
    this.bind(
      () => this.#y,
      (y) => this.element.style.setProperty("--y", `${y}px`),
    );
  }

  override update(_delta: number): void {
    if (this.#source.focusedLabel === null) {
      this.#onScreen = false;
      return;
    }

    const projected = this.#projected
      .set(this.#source.anchorX, this.#source.anchorY, this.#source.anchorZ)
      .project(this.#camera);
    // Outside [-1, 1] in depth the anchor is behind the camera or beyond the far plane
    this.#onScreen = projected.z > -1 && projected.z < 1;
    // Whole pixels, so the bindings only write when the prompt actually moves on screen
    this.#x = Math.round(((projected.x + 1) / 2) * window.innerWidth);
    this.#y = Math.round(((1 - projected.y) / 2) * window.innerHeight);
  }
}

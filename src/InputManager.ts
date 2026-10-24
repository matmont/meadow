// Codici fisici dei tasti (`KeyboardEvent.code`), indipendenti dal layout: "KeyW", "Space", "ArrowUp"...
export type KeyCode = string;

const MOUSE_BUTTONS = ["MouseLeft", "MouseMiddle", "MouseRight"] as const;

export default class InputManager {
  static readonly #pressed = new Set<KeyCode>();
  static #controller: AbortController | null = null;

  private constructor() {}

  static init(target: Window = window): void {
    if (InputManager.#controller) return;
    InputManager.#controller = new AbortController();
    const { signal } = InputManager.#controller;

    target.addEventListener(
      "keydown",
      (event) => InputManager.#pressed.add(event.code),
      { signal },
    );
    target.addEventListener(
      "keyup",
      (event) => InputManager.#pressed.delete(event.code),
      { signal },
    );
    target.addEventListener(
      "pointerdown",
      (event) => {
        const code = MOUSE_BUTTONS[event.button];
        if (code && event.target instanceof HTMLCanvasElement) {
          InputManager.#pressed.add(code);
        }
      },
      { signal },
    );
    target.addEventListener(
      "pointerup",
      (event) => {
        const code = MOUSE_BUTTONS[event.button];
        if (code) InputManager.#pressed.delete(code);
      },
      { signal },
    );
    target.addEventListener("blur", () => InputManager.#pressed.clear(), {
      signal,
    });
  }

  static dispose(): void {
    InputManager.#controller?.abort();
    InputManager.#controller = null;
    InputManager.#pressed.clear();
  }

  static isPressed(code: KeyCode): boolean {
    return InputManager.#pressed.has(code);
  }

  static isAnyPressed(...codes: KeyCode[]): boolean {
    return codes.some((code) => InputManager.#pressed.has(code));
  }
}

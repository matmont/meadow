// Codici fisici dei tasti (`KeyboardEvent.code`), indipendenti dal layout: "KeyW", "Space", "ArrowUp"...
export type KeyCode = string;

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

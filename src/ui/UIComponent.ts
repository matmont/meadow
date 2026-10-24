export type BindableValue = string | number | boolean | null | undefined;

const UNSET = Symbol("unset");

interface Binding {
  read: () => BindableValue;
  write: (value: BindableValue) => void;
  last: BindableValue | typeof UNSET;
}

export abstract class UIComponent {
  readonly element: HTMLElement;

  readonly #bindings: Binding[] = [];
  readonly #controller = new AbortController();

  constructor(element: HTMLElement) {
    this.element = element;
  }

  get signal(): AbortSignal {
    return this.#controller.signal;
  }

  onMounted(): void {}

  update(_delta: number): void {}

  onUnmounted(): void {}

  sync(): void {
    for (const binding of this.#bindings) {
      const value = binding.read();
      if (Object.is(value, binding.last)) continue;
      binding.last = value;
      binding.write(value);
    }
  }

  dispose(): void {
    this.#controller.abort();
  }

  protected bind<T extends BindableValue>(
    read: () => T,
    write: (value: T) => void,
  ): void {
    this.#bindings.push({
      read,
      write: write as (value: BindableValue) => void,
      last: UNSET,
    });
  }
}

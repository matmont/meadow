import type { KeyCode } from "../InputManager";

// "Digit1" → "1", "KeyJ" → "J"
export function keyLabel(code: KeyCode): string {
  return code.replace(/^(Digit|Key|Numpad)/, "");
}

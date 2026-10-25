import type { KeyCode } from "../InputManager";
import { h } from "./dom";
import styles from "./keys.module.css";

// "Digit1" → "1", "KeyJ" → "J"
export function keyLabel(code: KeyCode): string {
  return code.replace(/^(Digit|Key|Numpad)/, "");
}

// A keyboard-like key; its size comes from `--keycap-size`, set by the caller's class
export function keyCap(className?: string, code?: KeyCode): HTMLSpanElement {
  return h(
    "span",
    { className: className ? `${styles.keycap} ${className}` : styles.keycap },
    code ? keyLabel(code) : "",
  );
}

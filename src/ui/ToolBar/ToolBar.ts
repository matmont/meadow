import type { KeyCode } from "../../InputManager";
import type { Tool, ToolId } from "../../entities/Player/tools";
import { UIComponent } from "../UIComponent";
import { h } from "../dom";
import { renderToolIcons } from "./icons";
import styles from "./ToolBar.module.css";

export interface ToolBarSource {
  readonly tools: readonly Tool[];
  readonly selectedTool: ToolId;
}

export default class ToolBar extends UIComponent {
  readonly #source: ToolBarSource;

  constructor(source: ToolBarSource) {
    super(h("div", { className: styles.bar }));
    this.#source = source;

    const icons = renderToolIcons(source.tools);
    for (const tool of source.tools) {
      const icon = h("img", { className: styles.icon });
      icon.src = icons[tool.id];
      icon.alt = "";
      const slot = h(
        "div",
        { className: styles.slot },
        icon,
        h("span", { className: styles.key }, keyLabel(tool.key)),
      );
      slot.title = tool.name;
      this.element.append(slot);

      this.bind(
        () => this.#source.selectedTool === tool.id,
        (selected) => {
          slot.classList.toggle(styles.selected, selected);
        },
      );
    }
  }
}

function keyLabel(code: KeyCode): string {
  return code.replace(/^(Digit|Key|Numpad)/, "");
}

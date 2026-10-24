import { UIComponent } from "../UIComponent";
import { h } from "../dom";
import styles from "./PlayerStatus.module.css";

export interface PlayerStatusSource {
  readonly state: string;
  readonly isRunning: boolean;
}

export default class PlayerStatus extends UIComponent {
  readonly #source: PlayerStatusSource;

  constructor(source: PlayerStatusSource) {
    const state = h("span", { className: styles.state });
    const badge = h("span", { className: styles.badge }, "RUN");
    super(h("div", { className: styles.panel }, state, badge));
    this.#source = source;

    this.bind(
      () => this.#source.state,
      (value) => {
        state.textContent = value;
      },
    );
    this.bind(
      () => this.#source.isRunning,
      (running) => {
        badge.classList.toggle(styles.active, running);
      },
    );
  }
}

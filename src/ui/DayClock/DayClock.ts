import { UIComponent } from "../UIComponent";
import { h } from "../dom";
import styles from "./DayClock.module.css";

export interface DayClockSource {
  // 0 at sunrise, 0.5 at sunset, 1 at the next sunrise
  readonly dayPhase: number;
  readonly minuteOfDay: number;
}

const MARKERS = [
  { label: "Sunrise", position: 0 },
  { label: "Sunset", position: 0.5 },
  { label: "Night", position: 1 },
] as const;

export default class DayClock extends UIComponent {
  readonly #source: DayClockSource;

  constructor(source: DayClockSource) {
    const time = h("span", { className: styles.time });
    const indicator = h("span", { className: styles.indicator });
    const track = h("div", { className: styles.track }, indicator);
    const labels = h("div", { className: styles.labels });
    for (const { label, position } of MARKERS) {
      const marker = h("span", { className: styles.label }, label);
      marker.style.left = `${position * 100}%`;
      labels.append(marker);
    }
    super(h("div", { className: styles.panel }, time, track, labels));
    this.#source = source;

    // Both the clock and the indicator change once a minute: a per-minute step on the track
    // is well under a pixel, so following the phase more often would not show
    this.bind(
      () => this.#source.minuteOfDay,
      (minutes) => {
        time.textContent = formatTime(minutes);
        indicator.style.left = `${this.#source.dayPhase * 100}%`;
      },
    );
  }
}

function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${pad(hours)}:${pad(minutes % 60)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

import GUI from "lil-gui";

const FPS_SAMPLE_DURATION = 500;

export default class DebugManager {
  static readonly isEnabled = new URLSearchParams(location.search).has(
    "debug",
  );
  static #gui: GUI | null = null;
  static #renderingFolder: GUI | null = null;
  static readonly #renderingStats = { fps: 0 };
  static #fpsSampleStart: number | null = null;
  static #renderedFrameCount = 0;

  private constructor() {}

  static get gui(): GUI {
    if (!DebugManager.#gui) {
      DebugManager.#gui = new GUI({ width: 300 });
      if (!DebugManager.isEnabled) DebugManager.#gui.hide();
    }
    return DebugManager.#gui;
  }

  static resetRenderingStats(): void {
    DebugManager.#renderingStats.fps = 0;
    DebugManager.#fpsSampleStart = null;
    DebugManager.#renderedFrameCount = 0;

    if (!DebugManager.isEnabled || DebugManager.#renderingFolder) return;
    DebugManager.#renderingFolder = DebugManager.gui.addFolder("Rendering");
    DebugManager.#renderingFolder
      .add(DebugManager.#renderingStats, "fps")
      .name("FPS")
      .listen()
      .disable();
  }

  static recordRenderedFrame(time: DOMHighResTimeStamp): void {
    if (!DebugManager.#renderingFolder) return;

    if (DebugManager.#fpsSampleStart === null) {
      DebugManager.#fpsSampleStart = time;
      return;
    }

    DebugManager.#renderedFrameCount++;
    const elapsed = time - DebugManager.#fpsSampleStart;
    if (elapsed < FPS_SAMPLE_DURATION) return;

    DebugManager.#renderingStats.fps = Math.round(
      (DebugManager.#renderedFrameCount * 1000) / elapsed,
    );
    DebugManager.#fpsSampleStart = time;
    DebugManager.#renderedFrameCount = 0;
  }

  static dispose(): void {
    DebugManager.#gui?.destroy();
    DebugManager.#gui = null;
    DebugManager.#renderingFolder = null;
    DebugManager.#renderingStats.fps = 0;
    DebugManager.#fpsSampleStart = null;
    DebugManager.#renderedFrameCount = 0;
  }
}

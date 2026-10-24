import type { Object3D } from "three";
import type GUI from "lil-gui";
import DebugManager from "../DebugManager";

// Base of every particle effect, whatever simulates and draws it (CPU instances, shaders…).
// Lifecycle, driven by `ParticleSystem`:
// 1. `add()` attaches `object` to the scene and creates the optional debug folder.
// 2. `update(delta, elapsed)` emits and animates particles every frame, in seconds.
// 3. `stop()` ends the emission: particles still alive finish their life.
// 4. Once stopped and idle, the system removes the effect: debug folder, then `dispose()`.
export abstract class ParticleEffect {
  static #nextId = 0;

  readonly id = ParticleEffect.#nextId++;
  readonly object: Object3D;

  #stopped = false;
  #debugFolder: GUI | null = null;

  constructor(object: Object3D) {
    this.object = object;
  }

  get isStopped(): boolean {
    return this.#stopped;
  }

  stop(): void {
    this.#stopped = true;
  }

  // True when no particle is alive
  abstract get isIdle(): boolean;

  abstract update(delta: number, elapsed: number): void;

  // Frees every GPU resource the effect owns
  abstract dispose(): void;

  onDebugGuiCreate(_folder: GUI): void {}

  createDebugFolder(): void {
    if (this.#debugFolder) return;

    this.#debugFolder = DebugManager.createFolder(
      `${this.constructor.name} (Id: ${this.id})`,
      (folder) => this.onDebugGuiCreate(folder),
    );
  }

  destroyDebugFolder(): void {
    this.#debugFolder?.destroy();
    this.#debugFolder = null;
  }
}

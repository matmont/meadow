import type { Object3D } from "three";
import type { ParticleEffect } from "./ParticleEffect";

export class ParticleSystem {
  readonly #root: Object3D;
  readonly #effects = new Set<ParticleEffect>();

  /** @param root Object to which attach effects (usually the Scene) */
  constructor(root: Object3D) {
    this.#root = root;
  }

  get size(): number {
    return this.#effects.size;
  }

  add<T extends ParticleEffect>(effect: T): T {
    if (this.#effects.has(effect)) return effect;

    this.#effects.add(effect);
    this.#root.add(effect.object);
    effect.createDebugFolder();
    return effect;
  }

  // Removes immediately, cutting particles still alive; `effect.stop()` lets them finish
  remove(effect: ParticleEffect): boolean {
    if (!this.#effects.delete(effect)) return false;

    this.#root.remove(effect.object);
    effect.destroyDebugFolder();
    effect.dispose();
    return true;
  }

  update(delta: number, elapsed: number): void {
    for (const effect of this.#effects) {
      effect.update(delta, elapsed);
      if (effect.isStopped && effect.isIdle) this.remove(effect);
    }
  }

  dispose(): void {
    for (const effect of this.#effects) this.remove(effect);
  }
}

import { AnimationMixer, LoopOnce } from "three";
import type {
  AnimationAction,
  AnimationClip,
  AnimationMixerEventMap,
  Object3D,
} from "three";

export interface AnimationConfig {
  clip: string;
  timeScale?: number;
  once?: boolean;
}

export default class CharacterAnimator<State extends string> {
  readonly #mixer: AnimationMixer;
  readonly #actions = new Map<State, AnimationAction>();
  readonly #fadeDuration: number;
  #state: State | null = null;
  #onEnd: (() => void) | null = null;

  constructor(
    root: Object3D,
    config: Record<State, AnimationConfig>,
    fadeDuration = 0.2,
  ) {
    this.#mixer = new AnimationMixer(root);
    this.#fadeDuration = fadeDuration;

    for (const [
      state,
      { clip: name, timeScale = 1, once = false },
    ] of Object.entries(config) as [State, AnimationConfig][]) {
      const clip = CharacterAnimator.#findClip(root.animations, name);
      const action = this.#mixer.clipAction(clip.clone());
      action.setEffectiveTimeScale(timeScale);
      if (once) {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.#actions.set(state, action);
    }

    this.#mixer.addEventListener("finished", this.#handleFinished);
  }

  get state(): State | null {
    return this.#state;
  }

  get time(): number {
    return this.#state !== null ? this.#actions.get(this.#state)!.time : 0;
  }

  // `onEnd` runs when a `once` animation finishes, or when another state interrupts it
  play(state: State, onEnd?: () => void): void {
    if (state === this.#state) return;

    this.#endCurrent();
    this.#onEnd = onEnd ?? null;

    const next = this.#actions.get(state)!;
    const previous =
      this.#state !== null ? this.#actions.get(this.#state) : null;
    next.reset().fadeIn(this.#fadeDuration).play();
    previous?.fadeOut(this.#fadeDuration);

    this.#state = state;
  }

  update(delta: number): void {
    this.#mixer.update(delta);
  }

  dispose(): void {
    this.#mixer.removeEventListener("finished", this.#handleFinished);
    this.#mixer.stopAllAction();
    this.#mixer.uncacheRoot(this.#mixer.getRoot());
  }

  readonly #handleFinished = ({
    action,
  }: AnimationMixerEventMap["finished"]): void => {
    if (this.#state !== null && action === this.#actions.get(this.#state)) {
      this.#endCurrent();
    }
  };

  #endCurrent(): void {
    const onEnd = this.#onEnd;
    this.#onEnd = null;
    onEnd?.();
  }

  static #findClip(clips: AnimationClip[], name: string): AnimationClip {
    const clip = clips.find((clip) => clip.name === name);
    if (!clip) {
      const available = clips.map((clip) => clip.name).join(", ");
      throw new Error(`Animation "${name}" not found. Available: ${available}`);
    }
    return clip;
  }
}

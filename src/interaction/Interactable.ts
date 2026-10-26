import type { Object3D, Vector3Like } from "three";
import type { ToolId } from "../entities/Player/tools";
import Outline from "./Outline";

export interface InteractionAction {
  readonly id: string;
  readonly label: string;
  // With a tool the action runs on each tool hit; without one it runs on `INTERACT_KEY`
  readonly tool?: ToolId;
}

export interface InteractableOptions {
  readonly actions: readonly InteractionAction[];
  // Horizontal distance from `object`'s origin within which the actor can interact
  readonly radius: number;
  // Height of the prompt above `object`'s origin, in world units
  readonly promptHeight: number;
  // `actorPosition` is the actor's world position, reused by the manager: read it during the
  // call, never keep the reference
  readonly onAction: (
    action: InteractionAction,
    actorPosition: Readonly<Vector3Like>,
  ) => void;
  readonly isEnabled?: () => boolean;
}

export default class Interactable {
  readonly object: Object3D;
  readonly actions: readonly InteractionAction[];
  readonly radius: number;
  readonly promptHeight: number;

  readonly #onAction: InteractableOptions["onAction"];
  readonly #isEnabled: () => boolean;
  readonly #outline: Outline;

  constructor(
    object: Object3D,
    { actions, radius, promptHeight, onAction, isEnabled }: InteractableOptions,
  ) {
    this.object = object;
    this.actions = actions;
    this.radius = radius;
    this.promptHeight = promptHeight;
    this.#onAction = onAction;
    this.#isEnabled = isEnabled ?? (() => true);
    this.#outline = new Outline(object);
  }

  get isEnabled(): boolean {
    return this.#isEnabled();
  }

  // The action available with the given tool, or the tool-less one; tool actions win
  findAction(tool: ToolId): InteractionAction | null {
    let fallback: InteractionAction | null = null;
    for (const action of this.actions) {
      if (action.tool === tool) return action;
      if (action.tool === undefined) fallback ??= action;
    }
    return fallback;
  }

  perform(
    action: InteractionAction,
    actorPosition: Readonly<Vector3Like>,
  ): void {
    this.#onAction(action, actorPosition);
  }

  setHighlighted(highlighted: boolean): void {
    this.#outline.setVisible(highlighted);
  }
}

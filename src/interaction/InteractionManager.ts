import { Vector3 } from "three";
import type { EventDispatcher, Object3D, Vector3Like } from "three";
import type GUI from "lil-gui";
import DebugManager from "../DebugManager";
import InputManager from "../InputManager";
import type { KeyCode } from "../InputManager";
import type { PlayerEventMap } from "../entities/Player/Player";
import { TOOL_USE_KEY } from "../entities/Player/tools";
import type { ToolId } from "../entities/Player/tools";
import type Interactable from "./Interactable";
import type { InteractionAction } from "./Interactable";
import { OUTLINE_MATERIAL } from "./Outline";

export const INTERACT_KEY: KeyCode = "KeyE";

export interface InteractorSource {
  readonly object: Object3D;
  readonly selectedTool: ToolId;
  readonly isUsingTool: boolean;
  readonly events: EventDispatcher<PlayerEventMap>;
  // Turns towards the point while the tool is in use; null releases it
  faceTowards(point: Vector3Like | null): void;
}

const FOCUS_ANGLE = Math.cos((50 * Math.PI) / 180);
// Hysteresis: the focused target is kept within wider limits than the ones needed to get the
// focus, so the outline does not flicker between two targets at about the same distance
const KEEP_ANGLE = Math.cos((70 * Math.PI) / 180);
const KEEP_RANGE = 1.15;
const NO_SCORE = Infinity;

export default class InteractionManager {
  static readonly #interactables = new Set<Interactable>();
  static readonly #actorPosition = new Vector3();
  static readonly #forward = new Vector3();
  static readonly #toTarget = new Vector3();
  static readonly #anchor = new Vector3();
  static readonly #debugState = { focused: "" };
  static #actor: InteractorSource | null = null;
  static #focused: Interactable | null = null;
  static #focusedAction: InteractionAction | null = null;
  static #wasInteractPressed = false;
  static #debugFolder: GUI | null = null;

  private constructor() {}

  static init(actor: InteractorSource): void {
    if (InteractionManager.#actor) return;

    InteractionManager.#actor = actor;
    actor.events.addEventListener("toolHit", InteractionManager.#onToolHit);
    InteractionManager.#debugFolder = DebugManager.createFolder(
      "Interaction",
      InteractionManager.#populateDebugFolder,
    );
  }

  // Entities register in onAdded() and unregister in onRemoved(); registering before init()
  // is fine, since the world is usually built before the player exists
  static register(interactable: Interactable): void {
    InteractionManager.#interactables.add(interactable);
  }

  static unregister(interactable: Interactable): void {
    if (!InteractionManager.#interactables.delete(interactable)) return;
    if (interactable === InteractionManager.#focused) {
      InteractionManager.#setFocus(null, null);
    }
  }

  static get focusedLabel(): string | null {
    return InteractionManager.#focusedAction?.label ?? null;
  }

  static get focusedKey(): KeyCode | null {
    const action = InteractionManager.#focusedAction;
    if (!action) return null;
    return action.tool ? TOOL_USE_KEY : INTERACT_KEY;
  }

  // World position of the prompt, valid while something is focused
  static get anchorX(): number {
    return InteractionManager.#anchor.x;
  }

  static get anchorY(): number {
    return InteractionManager.#anchor.y;
  }

  static get anchorZ(): number {
    return InteractionManager.#anchor.z;
  }

  // Runs after the entity update, so it reads where the actor ended up this frame
  static update(): void {
    const actor = InteractionManager.#actor;
    if (!actor) return;

    actor.object.getWorldPosition(InteractionManager.#actorPosition);
    InteractionManager.#forward
      .set(0, 0, 1)
      .applyQuaternion(actor.object.quaternion)
      .setY(0)
      .normalize();

    InteractionManager.#updateFocus(actor);

    const focused = InteractionManager.#focused;
    const action = InteractionManager.#focusedAction;
    if (focused) {
      focused.object.getWorldPosition(InteractionManager.#anchor);
      InteractionManager.#anchor.y += focused.promptHeight;
    }

    actor.faceTowards(
      action?.tool && actor.isUsingTool ? InteractionManager.#anchor : null,
    );

    const interactPressed = InputManager.isPressed(INTERACT_KEY);
    if (
      interactPressed &&
      !InteractionManager.#wasInteractPressed &&
      focused &&
      action &&
      !action.tool
    ) {
      focused.perform(action, InteractionManager.#actorPosition);
    }
    InteractionManager.#wasInteractPressed = interactPressed;
  }

  static dispose(): void {
    InteractionManager.#actor?.events.removeEventListener(
      "toolHit",
      InteractionManager.#onToolHit,
    );
    InteractionManager.#setFocus(null, null);
    InteractionManager.#interactables.clear();
    InteractionManager.#actor = null;
    InteractionManager.#wasInteractPressed = false;
    InteractionManager.#debugFolder?.destroy();
    InteractionManager.#debugFolder = null;
  }

  static #updateFocus(actor: InteractorSource): void {
    const tool = actor.selectedTool;
    const current = InteractionManager.#focused;
    if (current) {
      // While the tool is in use the actor is turning towards the target: ignore the angle
      const minDot = actor.isUsingTool ? -1 : KEEP_ANGLE;
      const action = current.findAction(tool);
      if (
        action &&
        InteractionManager.#score(current, KEEP_RANGE, minDot) !== NO_SCORE
      ) {
        InteractionManager.#setFocus(current, action);
        return;
      }
    }

    let best: Interactable | null = null;
    let bestAction: InteractionAction | null = null;
    let bestScore = NO_SCORE;
    for (const interactable of InteractionManager.#interactables) {
      const action = interactable.findAction(tool);
      if (!action) continue;
      const score = InteractionManager.#score(interactable, 1, FOCUS_ANGLE);
      if (score >= bestScore) continue;
      best = interactable;
      bestAction = action;
      bestScore = score;
    }
    InteractionManager.#setFocus(best, bestAction);
  }

  // Lower is better: distance relative to the reach plus how far off the facing direction
  static #score(
    interactable: Interactable,
    rangeScale: number,
    minDot: number,
  ): number {
    if (!interactable.isEnabled) return NO_SCORE;

    const toTarget = interactable.object
      .getWorldPosition(InteractionManager.#toTarget)
      .sub(InteractionManager.#actorPosition)
      .setY(0);
    const distance = toTarget.length();
    const range = interactable.radius * rangeScale;
    if (distance > range) return NO_SCORE;

    // Standing on the target's origin there is no meaningful direction: count it as facing
    const dot =
      distance > 1e-3
        ? toTarget.divideScalar(distance).dot(InteractionManager.#forward)
        : 1;
    if (dot < minDot) return NO_SCORE;

    return distance / range + (1 - dot);
  }

  static #setFocus(
    interactable: Interactable | null,
    action: InteractionAction | null,
  ): void {
    InteractionManager.#focusedAction = action;
    if (interactable === InteractionManager.#focused) return;

    InteractionManager.#focused?.setHighlighted(false);
    interactable?.setHighlighted(true);
    InteractionManager.#focused = interactable;
    InteractionManager.#debugState.focused = interactable
      ? `${action?.label} (object ${interactable.object.id})`
      : "";
  }

  static readonly #onToolHit = ({ tool }: { tool: ToolId }): void => {
    const actor = InteractionManager.#actor;
    const focused = InteractionManager.#focused;
    const action = InteractionManager.#focusedAction;
    if (!actor || !focused || action?.tool !== tool) return;
    // The hit fires during the player's update, before this frame's update() of the manager
    actor.object.getWorldPosition(InteractionManager.#actorPosition);
    focused.perform(action, InteractionManager.#actorPosition);
  };

  static readonly #populateDebugFolder = (folder: GUI): void => {
    folder
      .add(OUTLINE_MATERIAL.uniforms.thickness, "value", 0, 0.02, 0.0005)
      .name("outline thickness");
    folder
      .add(OUTLINE_MATERIAL.uniforms.opacity, "value", 0, 1, 0.05)
      .name("outline opacity");
    folder
      .add(InteractionManager.#debugState, "focused")
      .listen()
      .disable();
  };
}

import RAPIER from "@dimforge/rapier3d-compat";
import type GUI from "lil-gui";
import { Box3, Group, Quaternion, Vector3 } from "three";
import { Entity } from "../../Entity";
import LoaderManager from "../../LoaderManager";
import InputManager from "../../InputManager";
import PhysicsManager from "../../PhysicsManager";
import CharacterAnimator from "../../CharacterAnimator";
import AudioManager from "../../AudioManager";
import { colorPlayer } from "./utils";

type PlayerState = "idle" | "walk" | "run" | "jump";

const FOOTSTEP_RATES: Partial<Record<PlayerState, number>> = {
  walk: 1,
  run: 2,
};

const HEIGHT = 1.8;
const RADIUS = 0.3;

export default class Player extends Entity {
  static readonly #UP = new Vector3(0, 1, 0);
  #walkSpeed = 4;
  #runSpeed = 8;
  #isJumping = false;

  readonly #direction = new Vector3();
  readonly #movement = new Vector3();
  readonly #turnSpeed = 15;
  readonly #targetQuaternion = new Quaternion();
  readonly #animator: CharacterAnimator<PlayerState>;
  readonly #body: RAPIER.RigidBody;
  readonly #collider: RAPIER.Collider;
  readonly #controller: RAPIER.KinematicCharacterController;
  #verticalVelocity = 0;
  #footsteps: number | null = null;
  #footstepsState: PlayerState | null = null;

  constructor(position: Vector3 = new Vector3(0, 0, 0)) {
    const model = LoaderManager.instantiate("baseCharacter");
    colorPlayer(model);
    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);
    super(new Group().add(model), { castShadow: true });

    this.object.position.copy(position);

    this.#animator = new CharacterAnimator<PlayerState>(model, {
      idle: { clip: "CharacterArmature|Idle" },
      walk: { clip: "CharacterArmature|Walk" },
      run: {
        clip: "CharacterArmature|Walk",
        timeScale: this.#runSpeed / this.#walkSpeed,
      },
      jump: { clip: "CharacterArmature|Victory", timeScale: 1.5 },
    });

    const world = PhysicsManager.world;
    // The body sits at the capsule's center, the object at the feet
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        position.x,
        position.y + HEIGHT / 2,
        position.z,
      ),
    );
    this.#collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(HEIGHT / 2 - RADIUS, RADIUS),
      this.#body,
    );
    this.#controller = world.createCharacterController(0.01);
    this.#controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    this.#controller.setMinSlopeSlideAngle((30 * Math.PI) / 180);
    this.#controller.enableAutostep(0.3, 0.2, false);
    this.#controller.enableSnapToGround(0.3);
  }

  get isMoving(): boolean {
    return this.#direction.lengthSq() > 0;
  }

  get isRunning(): boolean {
    return this.isMoving && InputManager.isPressed("ShiftLeft");
  }

  get isJumping(): boolean {
    return this.#isJumping;
  }

  get state(): PlayerState {
    if (this.isJumping) return "jump";
    if (!this.isMoving) return "idle";
    return this.isRunning ? "run" : "walk";
  }

  override onAdded(): void {
    this.#animator.play(this.state);
  }

  override update(delta: number, _elapsed: number): void {
    this.#readInput();
    this.#move(delta);
    if (this.isMoving) this.#turn(delta);
    this.#animator.play(this.state);
    this.#animator.update(delta);
    this.#updateFootsteps();
  }

  override onRemoved(): void {
    this.#stopFootsteps();
  }

  override dispose(): void {
    this.#animator.dispose();
    const world = PhysicsManager.world;
    world.removeCharacterController(this.#controller);
    world.removeRigidBody(this.#body);
  }

  #readInput(): void {
    const axis = (negative: string, positive: string) =>
      Number(InputManager.isPressed(positive)) -
      Number(InputManager.isPressed(negative));

    if (InputManager.isPressed("Space")) this.#jump();

    this.#direction.set(axis("KeyA", "KeyD"), 0, axis("KeyW", "KeyS"));
    if (this.isMoving) this.#direction.normalize();
  }

  #jump(): void {
    if (this.#controller.computedGrounded()) {
      this.#verticalVelocity = 5;
      this.#isJumping = true;
      AudioManager.play("jump", { volume: 0.5 });
    }
  }

  #updateFootsteps(): void {
    const state = this.state;
    if (state === this.#footstepsState) return;
    this.#footstepsState = state;

    const rate = FOOTSTEP_RATES[state];
    if (rate === undefined) {
      this.#stopFootsteps();
    } else if (this.#footsteps === null) {
      this.#footsteps = AudioManager.play("steps", { loop: true, rate });
    } else {
      AudioManager.setRate("steps", rate, this.#footsteps);
    }
  }

  #stopFootsteps(): void {
    if (this.#footsteps === null) return;
    AudioManager.stop("steps", this.#footsteps);
    this.#footsteps = null;
  }

  #jumpFinished(): void {
    this.#isJumping = false;
    this.#verticalVelocity = 0;
  }

  #move(delta: number): void {
    const speed = this.isRunning ? this.#runSpeed : this.#walkSpeed;
    this.#verticalVelocity += PhysicsManager.GRAVITY.y * delta;
    this.#movement
      .copy(this.#direction)
      .multiplyScalar(speed * delta)
      .setY(this.#verticalVelocity * delta);

    this.#controller.computeColliderMovement(this.#collider, this.#movement);
    const corrected = this.#controller.computedMovement();
    if (this.#controller.computedGrounded()) this.#jumpFinished();

    const current = this.#body.translation();
    const next = {
      x: current.x + corrected.x,
      y: current.y + corrected.y,
      z: current.z + corrected.z,
    };
    this.#body.setNextKinematicTranslation(next);
    this.object.position.set(next.x, next.y - HEIGHT / 2, next.z);
  }

  #turn(delta: number): void {
    const yaw = Math.atan2(this.#direction.x, this.#direction.z);
    this.#targetQuaternion.setFromAxisAngle(Player.#UP, yaw);
    const alpha = 1 - Math.exp(-this.#turnSpeed * delta);
    this.object.quaternion.slerp(this.#targetQuaternion, alpha);
  }

  override onDebugGuiCreate(folder: GUI): void {
    const privateParams = {
      walkSpeed: this.#walkSpeed,
      runSpeed: this.#runSpeed,
    };

    folder.add(this, "isMoving").listen().disable();
    folder.add(this, "isRunning").listen().disable();
    folder.add(this, "isJumping").listen().disable();
    folder.add(this, "state").listen().disable();
    folder.add(privateParams, "walkSpeed").onChange((value: number) => {
      this.#walkSpeed = value;
      this.#animator.play(this.state);
    });
    folder.add(privateParams, "runSpeed").onChange((value: number) => {
      this.#runSpeed = value;
      this.#animator.play(this.state);
    });
  }
}

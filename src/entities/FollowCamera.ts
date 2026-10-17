import { Vector3 } from "three";
import type { Camera, Object3D, Vector3Like } from "three";
import { Entity } from "../Entity";

export interface FollowCameraOptions {
  offset?: Vector3Like;
  lookAtOffset?: Vector3Like;
  smoothing?: number;
}

const defaultOptions: FollowCameraOptions = {
  offset: { x: 0, y: 10, z: 10 },
  lookAtOffset: { x: 0, y: 0, z: 0 },
  smoothing: 10,
};

export default class FollowCamera extends Entity {
  readonly #followed: Object3D;
  readonly #offset = new Vector3();
  readonly #lookAtOffset = new Vector3();
  readonly #smoothing: number;

  readonly #followedPosition = new Vector3();
  readonly #desiredPosition = new Vector3();
  readonly #lookAtPoint = new Vector3();

  constructor(
    camera: Camera,
    followed: Object3D,
    {
      offset = defaultOptions.offset,
      lookAtOffset = defaultOptions.lookAtOffset,
      smoothing = defaultOptions.smoothing,
    }: FollowCameraOptions = {},
  ) {
    super(camera);
    this.#followed = followed;
    this.#offset.copy(offset!);
    this.#lookAtOffset.copy(lookAtOffset!);
    this.#smoothing = smoothing!;
  }

  override onAdded(): void {
    this.#computeTargets();
    this.object.position.copy(this.#desiredPosition);
    this.object.lookAt(this.#lookAtPoint);
  }

  override update(delta: number): void {
    this.#computeTargets();
    // Smorzamento esponenziale: stesso movimento a qualsiasi frame rate
    const alpha = 1 - Math.exp(-this.#smoothing * delta);
    this.object.position.lerp(this.#desiredPosition, alpha);
    this.object.lookAt(this.#lookAtPoint);
  }

  override dispose(): void {}

  #computeTargets(): void {
    this.#followed.getWorldPosition(this.#followedPosition);

    this.#desiredPosition.copy(this.#offset).add(this.#followedPosition);
    this.#lookAtPoint.copy(this.#lookAtOffset).add(this.#followedPosition);
  }
}

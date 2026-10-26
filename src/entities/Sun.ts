import {
  CameraHelper,
  DirectionalLight,
  Group,
  Matrix4,
  Object3D,
  Vector3,
} from "three";
import type { ColorRepresentation, Vector3Like } from "three";
import type GUI from "lil-gui";
import { Entity } from "../Entity";
import { COLORS } from "../colors";

export interface SunOptions {
  offset?: Vector3Like;
  focusOffset?: Vector3Like;
  color?: ColorRepresentation;
  intensity?: number;
  shadowSize?: number;
  mapSize?: number;
}

const defaultOptions: SunOptions = {
  offset: { x: 5, y: 10, z: 5 },
  focusOffset: { x: 0, y: 0, z: 0 },
  color: COLORS.sunlight,
  intensity: 5,
  shadowSize: 30,
  mapSize: 2048,
};

export default class Sun extends Entity {
  readonly light: DirectionalLight;
  readonly #followed: Object3D;
  readonly #focusOffset = new Vector3();
  readonly #lightRotation = new Matrix4();
  readonly #lightRotationInverse = new Matrix4();
  readonly #focus = new Vector3();
  #helper: CameraHelper | null = null;

  constructor(
    followed: Object3D,
    {
      offset = defaultOptions.offset,
      focusOffset = defaultOptions.focusOffset,
      color = defaultOptions.color,
      intensity = defaultOptions.intensity,
      shadowSize = defaultOptions.shadowSize,
      mapSize = defaultOptions.mapSize,
    }: SunOptions = {},
  ) {
    const light = new DirectionalLight(color, intensity);
    light.position.copy(offset!);
    light.castShadow = true;
    light.shadow.mapSize.set(mapSize!, mapSize!);

    // Light and target move together inside the group: the direction never changes
    const group = new Group();
    group.add(light, light.target);
    super(group);

    this.light = light;
    this.#followed = followed;
    this.#focusOffset.copy(focusOffset!);
    this.#lightRotation.lookAt(
      light.position,
      new Vector3(),
      Object3D.DEFAULT_UP,
    );
    this.#lightRotationInverse.copy(this.#lightRotation).transpose();
    this.shadowSize = shadowSize!;
  }

  get shadowSize(): number {
    return this.light.shadow.camera.right;
  }

  set shadowSize(value: number) {
    const camera = this.light.shadow.camera;
    camera.left = camera.bottom = -value;
    camera.right = camera.top = value;
    // The light sits close to the focus: an orthographic camera may start behind it, so the
    // ground and casters on the side facing the sun are not clipped as the frustum grows
    const distance = this.light.position.length();
    camera.near = distance - value * 2;
    camera.far = distance + value * 2;
    camera.updateProjectionMatrix();
    this.#helper?.update();
  }

  override onAdded(): void {
    this.#follow();
  }

  override update(): void {
    this.#follow();
  }

  override onRemoved(): void {
    this.#helper?.removeFromParent();
  }

  override dispose(): void {
    this.light.dispose();
    this.#helper?.dispose();
  }

  override onDebugGuiCreate(folder: GUI): void {
    const shadow = this.light.shadow;
    folder.add(this, "shadowSize", 2, 50, 1).name("shadow size");
    folder.add(shadow, "bias", -0.005, 0.005, 0.0001);
    folder.add(shadow, "normalBias", 0, 0.2, 0.001).name("normal bias");

    const params = { showFrustum: false };
    folder
      .add(params, "showFrustum")
      .name("show shadow frustum")
      .onChange((visible: boolean) => {
        if (visible) {
          this.#helper ??= new CameraHelper(shadow.camera);
          this.object.parent?.add(this.#helper);
        } else {
          this.#helper?.removeFromParent();
        }
      });
  }

  #follow(): void {
    this.#followed.getWorldPosition(this.#focus).add(this.#focusOffset);

    // Snap to the shadow map's texel grid, in light space, to avoid shimmering edges
    const texel = (this.shadowSize * 2) / this.light.shadow.mapSize.x;
    this.#focus.applyMatrix4(this.#lightRotationInverse);
    this.#focus.x = Math.round(this.#focus.x / texel) * texel;
    this.#focus.y = Math.round(this.#focus.y / texel) * texel;
    this.#focus.applyMatrix4(this.#lightRotation);

    this.object.position.copy(this.#focus);
  }
}

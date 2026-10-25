import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from "three";
import type GUI from "lil-gui";
import { Entity } from "../Entity";
import PhysicsManager from "../PhysicsManager";

export default class PhysicsDebug extends Entity {
  readonly #geometry: BufferGeometry;

  constructor() {
    const geometry = new BufferGeometry();
    super(new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true })));
    this.#geometry = geometry;
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  override update(): void {
    // Rebuilding the lines is costly: skip it while they are hidden
    if (!this.object.visible) return;

    const { vertices, colors } = PhysicsManager.world.debugRender();
    this.#geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    this.#geometry.setAttribute("color", new BufferAttribute(colors, 4));
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(this.object, "visible").name("show colliders");
  }
}

import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
} from "three";
import { Entity } from "../Entity";
import PhysicsManager from "../PhysicsManager";

export default class PhysicsDebug extends Entity {
  readonly #geometry: BufferGeometry;

  constructor() {
    const geometry = new BufferGeometry();
    super(new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true })));
    this.#geometry = geometry;
    this.object.frustumCulled = false;
  }

  override update(): void {
    const { vertices, colors } = PhysicsManager.world.debugRender();
    this.#geometry.setAttribute("position", new BufferAttribute(vertices, 3));
    this.#geometry.setAttribute("color", new BufferAttribute(colors, 4));
  }
}

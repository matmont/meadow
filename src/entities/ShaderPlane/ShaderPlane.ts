import { Mesh, PlaneGeometry, RawShaderMaterial } from "three";
import type { Vector3Like } from "three";
import { Entity } from "../../Entity";
import fragmentShader from "./fragment.glsl?raw";
import vertexShader from "./vertex.glsl?raw";

export default class ShaderPlane extends Entity {
  constructor(position: Vector3Like = { x: 0, y: 0, z: 0 }) {
    super(
      new Mesh(
        new PlaneGeometry(2, 2, 32, 32),
        new RawShaderMaterial({ vertexShader, fragmentShader, side: 2 }),
      ),
    );
    this.object.position.copy(position);
  }
}

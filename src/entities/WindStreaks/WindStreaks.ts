import {
  BufferAttribute,
  Color,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  MathUtils,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
} from "three";
import type { PerspectiveCamera } from "three";
import type GUI from "lil-gui";
import { Entity } from "../../Entity";
import { COLORS } from "../../colors";
import fragmentShader from "./fragment.glsl?raw";
import vertexShader from "./vertex.glsl?raw";

const STREAK_COUNT = 32;
const SEGMENTS = 32;
// Streak sizes and speeds in the uniforms are the ones they have at this distance
const REFERENCE_DEPTH = 14;

export interface WindStreaksOptions {
  // How far from the camera the streaks seem to be: closer streaks are bigger, faster, and
  // drift more when the camera moves
  depth?: number;
  // Direction on screen, normalized when set
  direction?: { x: number; y: number };
}

// Stylized gusts drawn as a screen-space overlay, not as objects in the world. The vertex
// shader writes clip-space positions directly, so the mesh needs no placement in front of
// the camera, and the fragment shader only runs on the pixels the thin strips cover. The
// whole life of every streak is computed on the GPU from time and a per-streak seed
export default class WindStreaks extends Entity {
  readonly #camera: PerspectiveCamera;
  readonly #material: ShaderMaterial;
  // The uOffset uniform value, updated in place
  readonly #offset: Vector2;
  readonly #lastCameraPosition = new Vector3();
  readonly #cameraDelta = new Vector3();
  readonly #right = new Vector3();
  readonly #up = new Vector3();
  #hasLastCameraPosition = false;
  depth: number;

  constructor(
    camera: PerspectiveCamera,
    { depth = 6, direction = { x: 1, y: 0.25 } }: WindStreaksOptions = {},
  ) {
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uAspect: { value: camera.aspect },
        uOffset: { value: new Vector2() },
        uScale: { value: 1 },
        uDirection: {
          value: new Vector2(direction.x, direction.y).normalize(),
        },
        uLifetime: { value: 2.6 },
        uTravel: { value: 1.1 },
        uLength: { value: 0.45 },
        uWidth: { value: 0.008 },
        uAmplitude: { value: 0.04 },
        uFrequency: { value: 7 },
        uMinDensity: { value: 0.15 },
        uColor: { value: new Color(COLORS.wind) },
        uOpacity: { value: 0.4 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new Mesh(createStripGeometry(), material);
    // Clip-space vertices: the bounding sphere means nothing, and the overlay draws last
    mesh.frustumCulled = false;
    mesh.renderOrder = 1000;
    mesh.name = "windStreaks";

    super(mesh);
    this.#camera = camera;
    this.#material = material;
    this.depth = depth;
    this.#offset = material.uniforms.uOffset!.value as Vector2;
  }

  override update(_delta: number, elapsed: number): void {
    const uniforms = this.#material.uniforms;
    uniforms.uTime!.value = elapsed;
    uniforms.uAspect!.value = this.#camera.aspect;
    uniforms.uScale!.value = REFERENCE_DEPTH / this.depth;

    // Moves the streaks opposite to the camera, by the amount the ground at `depth` moves on
    // screen. Only sideways and vertical camera motion is visible this way, which is enough
    // for a camera that follows the player at a fixed offset
    const position = this.#camera.position;
    if (this.#hasLastCameraPosition) {
      this.#cameraDelta.subVectors(position, this.#lastCameraPosition);
      const matrix = this.#camera.matrixWorld;
      this.#right.setFromMatrixColumn(matrix, 0);
      this.#up.setFromMatrixColumn(matrix, 1);
      const viewHeight =
        2 * this.depth * Math.tan(MathUtils.degToRad(this.#camera.fov) / 2);
      const scale = 2 / viewHeight;
      this.#offset.x -= this.#cameraDelta.dot(this.#right) * scale;
      this.#offset.y -= this.#cameraDelta.dot(this.#up) * scale;
    }
    this.#lastCameraPosition.copy(position);
    this.#hasLastCameraPosition = true;
  }

  override onDebugGuiCreate(folder: GUI): void {
    const uniforms = this.#material.uniforms;
    folder.add(this, "depth", 2, 30, 0.5);
    folder.add(uniforms.uOpacity!, "value", 0, 1, 0.01).name("opacity");
    folder.add(uniforms.uLifetime!, "value", 0.5, 8, 0.1).name("lifetime");
    folder.add(uniforms.uTravel!, "value", 0.2, 3, 0.05).name("travel");
    folder.add(uniforms.uLength!, "value", 0.05, 1.5, 0.01).name("length");
    folder.add(uniforms.uWidth!, "value", 0.001, 0.03, 0.001).name("width");
    folder.add(uniforms.uAmplitude!, "value", 0, 0.2, 0.005).name("amplitude");
    folder.add(uniforms.uFrequency!, "value", 0, 20, 0.5).name("frequency");
    folder.add(uniforms.uMinDensity!, "value", 0, 1, 0.01).name("min density");
  }
}

// One strip per streak: pairs of vertices from tail (x = 0) to head (x = 1), on the two
// sides of the line (y = -1 and y = +1). The vertex shader bends it along the path
function createStripGeometry(): InstancedBufferGeometry {
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  for (let segment = 0; segment <= SEGMENTS; segment++) {
    const progress = segment / SEGMENTS;
    positions.set([progress, -1, 0, progress, 1, 0], segment * 6);
  }

  const indices: number[] = [];
  for (let segment = 0; segment < SEGMENTS; segment++) {
    const a = segment * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }

  const seeds = new Float32Array(STREAK_COUNT);
  for (let index = 0; index < STREAK_COUNT; index++) seeds[index] = index + 1;

  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
  geometry.instanceCount = STREAK_COUNT;
  return geometry;
}

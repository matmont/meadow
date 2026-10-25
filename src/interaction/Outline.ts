import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  ShaderMaterial,
  SkinnedMesh,
} from "three";
import type { Object3D } from "three";
import { COLORS } from "../colors";

// Inverted hull: a back-face copy of each mesh, pushed outwards along the normal in view
// space. Scaling the push by the view depth keeps the outline about the same width on screen
const vertexShader = /* glsl */ `
  attribute vec3 outlineNormal;
  uniform float thickness;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 viewNormal = normalize(normalMatrix * outlineNormal);
    viewPosition.xyz += viewNormal * thickness * -viewPosition.z;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 color;
  uniform float opacity;

  void main() {
    gl_FragColor = vec4(color, opacity);
  }
`;

// Shared by every outline and never disposed, like the cached models it is drawn on
export const OUTLINE_MATERIAL = new ShaderMaterial({
  uniforms: {
    color: { value: new Color(COLORS.outline) },
    thickness: { value: 0.004 },
    opacity: { value: 0.8 },
  },
  vertexShader,
  fragmentShader,
  side: BackSide,
  transparent: true,
});

// Cloned models share their geometries, so each hull geometry is built once per source
// geometry. It shares the source's position and index buffers: disposing it would also free
// them on the GPU, so it lives as long as the cached source does
const hullGeometries = new WeakMap<BufferGeometry, BufferGeometry>();

interface Hull {
  readonly mesh: Mesh;
  readonly source: Mesh;
}

export default class Outline {
  readonly #object: Object3D;
  #hulls: Hull[] | null = null;
  #visible = false;

  constructor(object: Object3D) {
    this.#object = object;
  }

  // Hulls are attached only while visible, so the owner's dispose() never sees them
  setVisible(visible: boolean): void {
    if (visible === this.#visible) return;
    this.#visible = visible;

    const hulls = (this.#hulls ??= this.#createHulls());
    for (const { mesh, source } of hulls) {
      if (visible) source.add(mesh);
      else mesh.removeFromParent();
    }
  }

  #createHulls(): Hull[] {
    const hulls: Hull[] = [];
    this.#object.traverse((child) => {
      // Skinned and instanced meshes would need their own hull types: not needed yet
      if (
        !(child instanceof Mesh) ||
        child instanceof SkinnedMesh ||
        child instanceof InstancedMesh
      ) {
        return;
      }

      const mesh = new Mesh(hullGeometry(child.geometry), OUTLINE_MATERIAL);
      mesh.raycast = () => {};
      hulls.push({ mesh, source: child });
    });
    return hulls;
  }
}

function hullGeometry(source: BufferGeometry): BufferGeometry {
  const cached = hullGeometries.get(source);
  if (cached) return cached;

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", source.getAttribute("position"));
  if (source.index) geometry.setIndex(source.index);
  geometry.setAttribute("outlineNormal", smoothNormals(source));
  hullGeometries.set(source, geometry);
  return geometry;
}

// Low-poly models have split normals on hard edges, which would open gaps in the hull:
// average the normals of every vertex sharing the same position
function smoothNormals(geometry: BufferGeometry): BufferAttribute {
  const position = geometry.getAttribute("position");
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");

  const sums = new Map<string, [number, number, number]>();
  const keys: string[] = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    keys.push(key);
    let sum = sums.get(key);
    if (!sum) sums.set(key, (sum = [0, 0, 0]));
    sum[0] += normal.getX(i);
    sum[1] += normal.getY(i);
    sum[2] += normal.getZ(i);
  }

  const result = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const [x, y, z] = sums.get(keys[i])!;
    const length = Math.hypot(x, y, z) || 1;
    result[i * 3] = x / length;
    result[i * 3 + 1] = y / length;
    result[i * 3 + 2] = z / length;
  }
  return new BufferAttribute(result, 3);
}

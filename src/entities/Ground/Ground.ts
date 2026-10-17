import RAPIER from "@dimforge/rapier3d-compat";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { Entity } from "../../Entity";
import PhysicsManager from "../../PhysicsManager";
import AudioManager from "../../AudioManager";
import { createGroundDecorations } from "./utils";

const SIZE = 100;
const TILE_SIZE = 3;
const THICKNESS = 1;

const UV_CORNERS = [
  [0, 0], // bottom-left
  [1, 0],
  [1, 1],
  [0, 1],
];

function createTiledGroundGeometry(
  size: number,
  tileSize: number,
): BufferGeometry {
  const tiles = Math.ceil(size / tileSize);
  const half = (tiles * tileSize) / 2;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const x0 = -half + col * tileSize;
      const x1 = x0 + tileSize;
      const z0 = -half + row * tileSize;
      const z1 = z0 + tileSize;

      const base = positions.length / 3;
      positions.push(x0, 0, z1, x1, 0, z1, x1, 0, z0, x0, 0, z0);
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);

      const rotation = Math.floor(Math.random() * 4);
      for (let i = 0; i < 4; i++) {
        uvs.push(...UV_CORNERS[(i + rotation) % 4]);
      }

      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

export default class Ground extends Entity {
  readonly #body: RAPIER.RigidBody;
  readonly #geometry: BufferGeometry;
  readonly #material: MeshStandardMaterial;
  #soundtrack: number | null = null;

  constructor() {
    const geometry = createTiledGroundGeometry(SIZE, TILE_SIZE);
    const material = new MeshStandardMaterial({
      color: 0x329383,
    });

    const object = new Group();
    object.add(new Mesh(geometry, material), createGroundDecorations(SIZE));
    super(object, {
      castShadow: true,
      receiveShadow: true,
    });
    this.#geometry = geometry;
    this.#material = material;

    const world = PhysicsManager.world;
    this.#body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -THICKNESS / 2, 0),
    );
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(SIZE / 2, THICKNESS / 2, SIZE / 2),
      this.#body,
    );
  }

  override onAdded(): void {
    this.#soundtrack = AudioManager.play("gemWaltz", {
      loop: true,
      volume: 0.5,
    });
  }

  override onRemoved(): void {
    if (this.#soundtrack !== null) {
      AudioManager.stop("gemWaltz", this.#soundtrack);
      this.#soundtrack = null;
    }
  }

  override dispose(): void {
    // Decorations share cached model resources, so only dispose the unique ground mesh.
    this.#geometry.dispose();
    this.#material.dispose();
    PhysicsManager.world.removeRigidBody(this.#body);
  }
}

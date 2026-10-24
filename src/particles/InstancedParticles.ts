import {
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { BufferGeometry, Material } from "three";
import { ParticleEffect } from "./ParticleEffect";

export interface Particle {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly rotation: Euler;
  // Angular velocity around each axis, in rad/s
  readonly spin: Vector3;
  readonly color: Color;
  // Uniform scale; with a unit geometry centered at the origin it is also the particle height
  size: number;
  age: number;
  life: number;
}

export interface GroundCollision {
  // Fraction of the vertical speed kept after a bounce
  restitution: number;
  // Below this impact speed a particle stops bouncing and slides to a halt
  minBounceSpeed: number;
  // Exponential damping of sliding and spinning while resting on the ground
  friction: number;
}

export interface InstancedParticlesOptions {
  // Maximum number of particles alive at once: the pool is allocated once with this size
  capacity: number;
  // Downward acceleration, in m/s²
  gravity?: number;
  // Exponential damping of the velocity while in the air
  drag?: number;
  // Collision with the ground plane at y = 0; leave out for particles that fly freely
  ground?: GroundCollision;
  // Fraction of the lifetime after which the particle shrinks away to nothing
  shrinkStart?: number;
  castShadow?: boolean;
}

const MAX_DELTA = 0.1;
const WHITE = new Color(0xffffff);

// Particles simulated on the CPU and drawn by one InstancedMesh. The pool is preallocated and
// reused as a ring, so nothing is allocated per frame. Alive particles are packed into the
// first `count` instances every frame: dead ones are never drawn and leave nothing behind.
// Subclasses only decide when to emit and how each particle starts, through `spawn()`.
export abstract class InstancedParticles extends ParticleEffect {
  readonly #mesh: InstancedMesh;
  readonly #particles: Particle[] = [];
  readonly #gravity: number;
  readonly #drag: number;
  readonly #ground: GroundCollision | undefined;
  readonly #shrinkStart: number;
  readonly #matrix = new Matrix4();
  readonly #quaternion = new Quaternion();
  readonly #scale = new Vector3();
  #next = 0;
  #alive = 0;

  constructor(
    geometry: BufferGeometry,
    material: Material,
    {
      capacity,
      gravity = 9.8,
      drag = 0,
      ground,
      shrinkStart = 1,
      castShadow = false,
    }: InstancedParticlesOptions,
  ) {
    const mesh = new InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    mesh.castShadow = castShadow;
    // Instances move every frame, so a bounding sphere would always be stale
    mesh.frustumCulled = false;
    // Creates the per-instance color buffer up front, with its final size
    mesh.setColorAt(0, WHITE);
    super(mesh);

    this.#mesh = mesh;
    this.#gravity = gravity;
    this.#drag = drag;
    this.#ground = ground;
    this.#shrinkStart = shrinkStart;
    for (let index = 0; index < capacity; index++) {
      this.#particles.push({
        position: new Vector3(),
        velocity: new Vector3(),
        rotation: new Euler(),
        spin: new Vector3(),
        color: new Color(),
        size: 0,
        age: Infinity,
        life: 0,
      });
    }
  }

  override get isIdle(): boolean {
    return this.#alive === 0;
  }

  override update(rawDelta: number, elapsed: number): void {
    const delta = Math.min(rawDelta, MAX_DELTA);
    if (!this.isStopped) this.emit(delta, elapsed);
    this.#simulate(delta);
  }

  override dispose(): void {
    // The mesh owns geometry and material, created by the subclass for this effect only
    this.#mesh.geometry.dispose();
    (this.#mesh.material as Material).dispose();
    // Frees the instance matrix and color buffers
    this.#mesh.dispose();
  }

  protected abstract emit(delta: number, elapsed: number): void;

  // Takes the oldest slot, alive or not, and resets it for the caller to fill in
  protected spawn(): Particle {
    const particle = this.#particles[this.#next]!;
    this.#next = (this.#next + 1) % this.#particles.length;

    particle.position.set(0, 0, 0);
    particle.velocity.set(0, 0, 0);
    particle.rotation.set(0, 0, 0);
    particle.spin.set(0, 0, 0);
    particle.color.copy(WHITE);
    particle.size = 1;
    particle.age = 0;
    particle.life = 1;
    return particle;
  }

  #simulate(delta: number): void {
    const mesh = this.#mesh;
    let count = 0;

    for (const particle of this.#particles) {
      if (particle.age >= particle.life) continue;
      particle.age += delta;
      if (particle.age >= particle.life) continue;

      this.#integrate(particle, delta);

      const progress = particle.age / particle.life;
      const shrink =
        progress < this.#shrinkStart
          ? 1
          : 1 - (progress - this.#shrinkStart) / (1 - this.#shrinkStart);
      this.#scale.setScalar(particle.size * shrink);
      this.#quaternion.setFromEuler(particle.rotation);
      this.#matrix.compose(particle.position, this.#quaternion, this.#scale);

      mesh.setMatrixAt(count, this.#matrix);
      mesh.setColorAt(count, particle.color);
      count++;
    }

    this.#alive = count;
    mesh.count = count;
    if (count === 0) return;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
  }

  #integrate(particle: Particle, delta: number): void {
    const { position, velocity, rotation, spin } = particle;
    velocity.y -= this.#gravity * delta;
    if (this.#drag > 0) velocity.multiplyScalar(Math.exp(-this.#drag * delta));
    position.addScaledVector(velocity, delta);

    const ground = this.#ground;
    const floor = particle.size / 2;
    if (ground && position.y <= floor) {
      position.y = floor;
      if (velocity.y < -ground.minBounceSpeed) {
        velocity.y *= -ground.restitution;
        velocity.x *= 0.5;
        velocity.z *= 0.5;
        spin.multiplyScalar(0.5);
      } else {
        const damping = Math.exp(-ground.friction * delta);
        velocity.set(velocity.x * damping, 0, velocity.z * damping);
        spin.multiplyScalar(damping);
      }
    }

    rotation.x += spin.x * delta;
    rotation.y += spin.y * delta;
    rotation.z += spin.z * delta;
  }
}

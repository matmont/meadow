import {
  BoxGeometry,
  Color,
  Euler,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { Object3D } from "three";
import type GUI from "lil-gui";
import { Entity } from "../../Entity";
import { COLORS } from "../../colors";

export interface FootDustFollowed {
  readonly object: Object3D;
  readonly isMoving: boolean;
  readonly isRunning: boolean;
  readonly isGrounded: boolean;
}

interface Kick {
  // Upward speed at birth, in m/s
  lift: number;
  // Sideways speed at birth, in m/s
  spread: number;
  // Edge of a clod at birth, in meters; grains are smaller
  size: number;
  // Average lifetime, in seconds
  life: number;
}

interface Emission extends Kick {
  // Particles per second
  rate: number;
}

interface Particle {
  readonly position: Vector3;
  readonly velocity: Vector3;
  readonly rotation: Euler;
  readonly spin: Vector3;
  readonly color: Color;
  size: number;
  age: number;
  life: number;
}

// Enough for the running rate times the longest lifetime, plus a landing burst
const CAPACITY = 128;
const LANDING_PARTICLES = 12;
const SPAWN_RADIUS = 0.2;
const GRAVITY = 9.8;
// Below this impact speed a cube stops bouncing and slides to a halt
const BOUNCE_MIN_SPEED = 0.6;
const BOUNCE_RESTITUTION = 0.3;
const GROUND_FRICTION = 8;
// Fraction of the lifetime after which the cube starts shrinking away
const SHRINK_START = 0.6;
const MAX_DELTA = 0.1;
// Clods are bigger and take the ground color, the rest are tiny dirt and sand grains
const CLOD_CHANCE = 0.35;
const GRAIN_SCALE = 0.4;

const groundColor = new Color(COLORS.ground);
const dirtColor = new Color(COLORS.dirt);
const sandColor = new Color(COLORS.sand);

// Small cubes of ground kicked up by the feet. Few particles are alive at once, so they are
// simulated on the CPU and drawn by one InstancedMesh: alive particles are packed into the
// first `count` instances every frame
export default class FootDust extends Entity {
  readonly walk: Emission = {
    rate: 20,
    lift: 1.6,
    spread: 0.6,
    size: 0.06,
    life: 0.7,
  };
  readonly run: Emission = {
    rate: 40,
    lift: 5,
    spread: 1,
    size: 0.08,
    life: 0.9,
  };
  readonly landing: Kick = { lift: 2.2, spread: 1.6, size: 0.07, life: 0.9 };

  readonly #followed: FootDustFollowed;
  readonly #mesh: InstancedMesh;
  readonly #particles: Particle[] = [];
  readonly #feet = new Vector3();
  readonly #forward = new Vector3();
  readonly #matrix = new Matrix4();
  readonly #quaternion = new Quaternion();
  readonly #scale = new Vector3();
  #next = 0;
  #pending = 0;
  #wasGrounded = true;

  constructor(followed: FootDustFollowed) {
    const mesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ roughness: 1 }),
      CAPACITY,
    );
    mesh.count = 0;
    // Instances move every frame, so a bounding sphere would always be stale
    mesh.frustumCulled = false;
    super(mesh, { castShadow: true });

    this.#followed = followed;
    this.#mesh = mesh;
    for (let index = 0; index < CAPACITY; index++) {
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
    // Creates the per-instance color buffer before the first render
    mesh.setColorAt(0, groundColor);
  }

  override update(rawDelta: number): void {
    const delta = Math.min(rawDelta, MAX_DELTA);
    this.#emit(delta);
    this.#simulate(delta);
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(this.walk, "rate", 0, 40, 1).name("walk rate");
    folder.add(this.run, "rate", 0, 80, 1).name("run rate");
    folder.add(this.run, "lift", 0, 5, 0.1).name("run lift");
    folder.add(this.run, "size", 0.02, 0.3, 0.01).name("run size");
  }

  override dispose(): void {
    super.dispose();
    // Frees the instance matrix and color buffers
    this.#mesh.dispose();
  }

  #emit(delta: number): void {
    const followed = this.#followed;

    if (followed.isGrounded && !this.#wasGrounded) {
      this.#spawn(LANDING_PARTICLES, this.landing, false);
    }
    this.#wasGrounded = followed.isGrounded;

    if (!followed.isGrounded || !followed.isMoving) {
      this.#pending = 0;
      return;
    }
    const emission = followed.isRunning ? this.run : this.walk;
    this.#pending += emission.rate * delta;
    const count = Math.floor(this.#pending);
    this.#pending -= count;
    this.#spawn(count, emission, true);
  }

  #spawn(count: number, kick: Kick, backwards: boolean): void {
    if (count === 0) return;
    const object = this.#followed.object;
    object.getWorldPosition(this.#feet);
    object.getWorldDirection(this.#forward);

    for (let i = 0; i < Math.min(count, CAPACITY); i++) {
      // Reuses the oldest slot
      const particle = this.#particles[this.#next]!;
      this.#next = (this.#next + 1) % CAPACITY;

      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * SPAWN_RADIUS;
      const sideways = kick.spread * randomBetween(0.3, 1);
      // Walking and running throw the dirt behind the feet
      const back = backwards ? kick.spread : 0;

      const clod = Math.random() < CLOD_CHANCE;
      particle.size =
        kick.size * randomBetween(0.7, 1.3) * (clod ? 1 : GRAIN_SCALE);
      if (clod) {
        particle.color
          .copy(groundColor)
          .offsetHSL(0, 0, randomBetween(-0.06, 0.03));
      } else {
        particle.color.lerpColors(dirtColor, sandColor, Math.random());
      }
      particle.position.set(
        this.#feet.x + Math.cos(angle) * distance,
        particle.size / 2,
        this.#feet.z + Math.sin(angle) * distance,
      );
      particle.velocity.set(
        Math.cos(angle) * sideways - this.#forward.x * back,
        kick.lift * randomBetween(0.5, 1),
        Math.sin(angle) * sideways - this.#forward.z * back,
      );
      particle.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );
      particle.spin.set(
        randomBetween(-12, 12),
        randomBetween(-12, 12),
        randomBetween(-12, 12),
      );
      particle.age = 0;
      particle.life = kick.life * randomBetween(0.7, 1.3);
    }
  }

  #simulate(delta: number): void {
    const mesh = this.#mesh;
    let count = 0;

    for (const particle of this.#particles) {
      if (particle.age >= particle.life) continue;
      particle.age += delta;
      if (particle.age >= particle.life) continue;

      const { position, velocity, rotation, spin } = particle;
      velocity.y -= GRAVITY * delta;
      position.addScaledVector(velocity, delta);

      const floor = particle.size / 2;
      if (position.y <= floor) {
        position.y = floor;
        if (velocity.y < -BOUNCE_MIN_SPEED) {
          velocity.y *= -BOUNCE_RESTITUTION;
          velocity.x *= 0.5;
          velocity.z *= 0.5;
          spin.multiplyScalar(0.5);
        } else {
          // Resting on the ground: friction stops sliding and tumbling
          const damping = Math.exp(-GROUND_FRICTION * delta);
          velocity.set(velocity.x * damping, 0, velocity.z * damping);
          spin.multiplyScalar(damping);
        }
      }
      rotation.x += spin.x * delta;
      rotation.y += spin.y * delta;
      rotation.z += spin.z * delta;

      const progress = particle.age / particle.life;
      const shrink =
        progress < SHRINK_START
          ? 1
          : 1 - (progress - SHRINK_START) / (1 - SHRINK_START);
      this.#scale.setScalar(particle.size * shrink);
      this.#quaternion.setFromEuler(rotation);
      this.#matrix.compose(position, this.#quaternion, this.#scale);

      mesh.setMatrixAt(count, this.#matrix);
      mesh.setColorAt(count, particle.color);
      count++;
    }

    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

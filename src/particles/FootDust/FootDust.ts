import { BoxGeometry, Color, MeshStandardMaterial, Vector3 } from "three";
import type { Object3D } from "three";
import type GUI from "lil-gui";
import { COLORS } from "../../colors";
import { InstancedParticles } from "../InstancedParticles";

export interface FootDustSource {
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

const LANDING_PARTICLES = 12;
const SPAWN_RADIUS = 0.2;
// Clods are bigger and take the ground color, the rest are tiny dirt and sand grains
const CLOD_CHANCE = 0.35;
const GRAIN_SCALE = 0.4;

const groundColor = new Color(COLORS.ground);
const dirtColor = new Color(COLORS.dirt);
const sandColor = new Color(COLORS.sand);

// Small cubes of ground kicked up by the feet while walking or running, plus a burst on landing
export default class FootDust extends InstancedParticles {
  readonly walk: Emission = {
    rate: 20, // 20
    lift: 1.6,
    spread: 0.6,
    size: 0.06,
    life: 0.7,
  };
  readonly run: Emission = {
    rate: 40, // 40
    lift: 5,
    spread: 1,
    size: 0.08,
    life: 0.9,
  };
  readonly landing: Kick = { lift: 2.2, spread: 1.6, size: 0.07, life: 0.9 };

  readonly #source: FootDustSource;
  readonly #feet = new Vector3();
  readonly #forward = new Vector3();
  #pending = 0;
  #wasGrounded = true;

  constructor(source: FootDustSource) {
    super(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ roughness: 1 }),
      {
        // Enough for the running rate times the longest lifetime, plus a landing burst
        capacity: 128,
        ground: { restitution: 0.3, minBounceSpeed: 0.6, friction: 8 },
        shrinkStart: 0.6,
        castShadow: true,
      },
    );
    this.#source = source;
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(this.walk, "rate", 0, 40, 1).name("walk rate");
    folder.add(this.run, "rate", 0, 80, 1).name("run rate");
    folder.add(this.run, "lift", 0, 5, 0.1).name("run lift");
    folder.add(this.run, "size", 0.02, 0.3, 0.01).name("run size");
  }

  protected override emit(delta: number): void {
    const source = this.#source;

    if (source.isGrounded && !this.#wasGrounded) {
      this.#kick(LANDING_PARTICLES, this.landing, false);
    }
    this.#wasGrounded = source.isGrounded;

    if (!source.isGrounded || !source.isMoving) {
      this.#pending = 0;
      return;
    }
    const emission = source.isRunning ? this.run : this.walk;
    this.#pending += emission.rate * delta;
    const count = Math.floor(this.#pending);
    this.#pending -= count;
    this.#kick(count, emission, true);
  }

  #kick(count: number, kick: Kick, backwards: boolean): void {
    if (count === 0) return;
    const object = this.#source.object;
    object.getWorldPosition(this.#feet);
    object.getWorldDirection(this.#forward);

    for (let i = 0; i < count; i++) {
      const particle = this.spawn();
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
      particle.life = kick.life * randomBetween(0.7, 1.3);
    }
  }
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

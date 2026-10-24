import { Matrix4, Quaternion, Vector3 } from "three";
import type { ModelId } from "../../LoaderManager";

// Square area on the XZ plane, starting at its minimum corner
export interface ScatterArea {
  x: number;
  z: number;
  size: number;
}

export interface ScatterOptions {
  models: readonly ModelId[];
  count: number;
  // Keeps the spawn point at the world origin clear
  exclusionRadius: number;
  minScale: number;
  maxScale: number;
}

// Where one copy of a model goes: position, rotation and scale in world space
export interface Placement {
  readonly model: ModelId;
  readonly matrix: Matrix4;
}

export type RandomSource = () => number;

const FULL_ROTATION = Math.PI * 2;
const UP = new Vector3(0, 1, 0);

const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();

export function scatterModels(
  area: ScatterArea,
  options: ScatterOptions,
  random: RandomSource = Math.random,
): Placement[] {
  if (options.models.length === 0) {
    throw new Error("Cannot scatter without models.");
  }

  const placements: Placement[] = [];
  let previousModel: ModelId | undefined;

  for (let index = 0; index < options.count; index++) {
    const model = pickModel(options.models, random, previousModel);
    const { x, z } = randomPosition(area, options.exclusionRadius, random);
    position.set(x, 0, z);
    rotation.setFromAxisAngle(UP, random() * FULL_ROTATION);
    scale.setScalar(lerp(options.minScale, options.maxScale, random()));

    placements.push({
      model,
      matrix: new Matrix4().compose(position, rotation, scale),
    });
    previousModel = model;
  }

  return placements;
}

function pickModel(
  models: readonly ModelId[],
  random: RandomSource,
  excluded?: ModelId,
): ModelId {
  if (models.length === 1) return models[0]!;

  const excludedIndex = excluded === undefined ? -1 : models.indexOf(excluded);
  const availableCount =
    excludedIndex === -1 ? models.length : models.length - 1;
  let selectedIndex = Math.floor(random() * availableCount);
  if (excludedIndex !== -1 && selectedIndex >= excludedIndex) selectedIndex++;
  return models[selectedIndex]!;
}

function randomPosition(
  { x: minX, z: minZ, size }: ScatterArea,
  exclusionRadius: number,
  random: RandomSource,
): { x: number; z: number } {
  const exclusionRadiusSquared = exclusionRadius ** 2;

  let x: number;
  let z: number;
  do {
    x = minX + random() * size;
    z = minZ + random() * size;
  } while (x * x + z * z < exclusionRadiusSquared);

  return { x, z };
}

export function createSeededRandom(seed: number): RandomSource {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(start: number, end: number, alpha: number): number {
  return start + (end - start) * alpha;
}

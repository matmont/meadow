import { Group } from "three";
import type { Object3D } from "three";
import LoaderManager from "../../LoaderManager";
import type { ModelId } from "../../LoaderManager";

interface ScatterOptions {
  name: string;
  models: readonly ModelId[];
  count: number;
  areaSize: number;
  edgePadding: number;
  exclusionRadius: number;
  minScale: number;
  maxScale: number;
}

type RandomSource = () => number;

const FULL_ROTATION = Math.PI * 2;
const FLOWER_MODELS = [
  "flowerPurple",
  "flowerPurpleB",
  "flowerPurpleC",
  "flowerYellow",
  "flowerYellowB",
  "flowerYellowC",
  "flowerRed",
  "flowerRedB",
  "flowerRedC",
] as const satisfies readonly ModelId[];

export function createGroundDecorations(areaSize: number): Group {
  const random = createSeededRandom(0x3a17c9);
  const decorations = new Group();
  decorations.name = "ground-decorations";

  decorations.add(
    scatterModels(
      {
        name: "grass-instances",
        models: ["grass"],
        count: 70,
        areaSize,
        edgePadding: 2,
        exclusionRadius: 3,
        minScale: 0.6,
        maxScale: 1.15,
      },
      random,
    ),
    scatterModels(
      {
        name: "flower-instances",
        models: FLOWER_MODELS,
        count: 35,
        areaSize,
        edgePadding: 2,
        exclusionRadius: 3,
        minScale: 0.65,
        maxScale: 1.2,
      },
      random,
    ),
  );

  return decorations;
}

export function scatterModels(
  options: ScatterOptions,
  random: RandomSource = Math.random,
): Group {
  if (options.models.length === 0) {
    throw new Error(`Cannot scatter "${options.name}" without models.`);
  }

  const instances = new Group();
  instances.name = options.name;
  let previousModel: ModelId | undefined;

  for (let index = 0; index < options.count; index++) {
    const model = pickModel(options.models, random, previousModel);
    instances.add(createModelInstance(model, options, random));
    previousModel = model;
  }

  return instances;
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

function createModelInstance(
  model: ModelId,
  options: ScatterOptions,
  random: RandomSource,
): Object3D {
  const instance = LoaderManager.instantiate(model);
  const { x, z } = randomGroundPosition(options, random);
  const scale = lerp(options.minScale, options.maxScale, random());

  instance.position.set(x, 0, z);
  instance.rotation.y = random() * FULL_ROTATION;
  instance.scale.multiplyScalar(scale);
  return instance;
}

function randomGroundPosition(
  { areaSize, edgePadding, exclusionRadius }: ScatterOptions,
  random: RandomSource,
): { x: number; z: number } {
  const halfExtent = areaSize / 2 - edgePadding;
  const exclusionRadiusSquared = exclusionRadius ** 2;

  let x: number;
  let z: number;
  do {
    x = lerp(-halfExtent, halfExtent, random());
    z = lerp(-halfExtent, halfExtent, random());
  } while (x * x + z * z < exclusionRadiusSquared);

  return { x, z };
}

function createSeededRandom(seed: number): RandomSource {
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

import {
  LoadingManager,
  NoColorSpace,
  SRGBColorSpace,
  TextureLoader,
} from "three";
import type { ColorSpace, Group, Object3D, Texture } from "three";
import { Howl } from "howler";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";

interface ModelFormats {
  gltf: GLTF;
  fbx: Group;
}
type ModelFormat = keyof ModelFormats;

// `url` is relative to `import.meta.env.BASE_URL`, which is the root of the `public/` folder
interface ModelDescriptor {
  format: ModelFormat;
  url: string;
  scale?: number;
}

interface TextureDescriptor {
  url: string;
  // SRGBColorSpace for color maps (albedo, emissive); data maps (normal, roughness, ao, height) stay linear
  colorSpace?: ColorSpace;
}

interface SoundDescriptor {
  url: string;
  volume?: number;
}

const PROP_SCALE = 3;

const ASSETS = {
  models: {
    grass: { format: "gltf", url: "models/grass.glb", scale: PROP_SCALE },
    flowerPurple: {
      format: "gltf",
      url: "models/flower_purpleA.glb",
      scale: PROP_SCALE,
    },
    flowerPurpleB: {
      format: "gltf",
      url: "models/flower_purpleB.glb",
      scale: PROP_SCALE,
    },
    flowerPurpleC: {
      format: "gltf",
      url: "models/flower_purpleC.glb",
      scale: PROP_SCALE,
    },
    flowerYellow: {
      format: "gltf",
      url: "models/flower_yellowA.glb",
      scale: PROP_SCALE,
    },
    flowerYellowB: {
      format: "gltf",
      url: "models/flower_yellowB.glb",
      scale: PROP_SCALE,
    },
    flowerYellowC: {
      format: "gltf",
      url: "models/flower_yellowC.glb",
      scale: PROP_SCALE,
    },
    flowerRed: {
      format: "gltf",
      url: "models/flower_redA.glb",
      scale: PROP_SCALE,
    },
    flowerRedB: {
      format: "gltf",
      url: "models/flower_redB.glb",
      scale: PROP_SCALE,
    },
    flowerRedC: {
      format: "gltf",
      url: "models/flower_redC.glb",
      scale: PROP_SCALE,
    },
    treePine: {
      format: "gltf",
      url: "models/tree_pineRoundA.glb",
      scale: PROP_SCALE,
    },
    rockTall: {
      format: "gltf",
      url: "models/rock_tallJ.glb",
      scale: PROP_SCALE,
    },
    explorer: {
      format: "gltf",
      url: "models/characters/explorer.glb",
      scale: 1.3,
    },
    tools: { format: "gltf", url: "models/tools/tools.glb" },
  },
  textures: {
    grassColor: {
      url: "textures/grass/grass_01_color_1k.png",
      colorSpace: SRGBColorSpace,
    },
    grassNormal: { url: "textures/grass/grass_01_normal_gl_1k.png" },
    grassAo: { url: "textures/grass/grass_01_ambient_occlusion_1k.png" },
    grassRoughness: { url: "textures/grass/grass_01_roughness_1k.png" },
    grassHeight: { url: "textures/grass/grass_01_height_1k.png" },
  },
  sounds: {
    gemWaltz: { url: "audio/gem-waltz.webm" },
    jump: { url: "audio/jump.ogg" },
    steps: { url: "audio/steps.webm" },
  },
} as const satisfies {
  models: Record<string, ModelDescriptor>;
  textures: Record<string, TextureDescriptor>;
  sounds: Record<string, SoundDescriptor>;
};

export type ModelId = keyof typeof ASSETS.models;
export type TextureId = keyof typeof ASSETS.textures;
export type SoundId = keyof typeof ASSETS.sounds;
type ModelOf<K extends ModelId> =
  ModelFormats[(typeof ASSETS.models)[K]["format"]];

// Web Audio (html5: false) decodes the whole file up front: it loops without gaps, and a
// play() issued before the first user interaction is queued until the browser unlocks audio
function loadSound(src: string, volume: number): Promise<Howl> {
  return new Promise((resolve, reject) => {
    const sound = new Howl({
      src: [src],
      volume,
      onload: () => resolve(sound),
      onloaderror: (_id, error) => {
        sound.unload();
        reject(new Error(String(error)));
      },
    });
  });
}

export type ProgressCallback = (loaded: number, total: number) => void;

export default class LoaderManager {
  static readonly #models = new Map<ModelId, ModelFormats[ModelFormat]>();
  static readonly #textures = new Map<TextureId, Texture>();
  static readonly #sounds = new Map<SoundId, Howl>();
  static #loading: Promise<void> | null = null;

  private constructor() {}

  static get isLoaded(): boolean {
    const total =
      Object.keys(ASSETS.models).length +
      Object.keys(ASSETS.textures).length +
      Object.keys(ASSETS.sounds).length;
    return (
      LoaderManager.#models.size +
        LoaderManager.#textures.size +
        LoaderManager.#sounds.size ===
      total
    );
  }

  static loadAll(onProgress?: ProgressCallback): Promise<void> {
    LoaderManager.#loading ??= LoaderManager.#load(onProgress).catch(
      (error: unknown) => {
        LoaderManager.#loading = null;
        throw error;
      },
    );
    return LoaderManager.#loading;
  }

  static model<K extends ModelId>(id: K): ModelOf<K> {
    const model = LoaderManager.#models.get(id);
    if (!model) throw LoaderManager.#notLoaded("Model", id);
    return model as ModelOf<K>;
  }

  static texture(id: TextureId): Texture {
    const texture = LoaderManager.#textures.get(id);
    if (!texture) throw LoaderManager.#notLoaded("Texture", id);
    return texture;
  }

  static get soundIds(): SoundId[] {
    return Object.keys(ASSETS.sounds) as SoundId[];
  }

  static sound(id: SoundId): Howl {
    const sound = LoaderManager.#sounds.get(id);
    if (!sound) throw LoaderManager.#notLoaded("Sound", id);
    return sound;
  }

  static instantiate(id: ModelId, node?: string): Object3D {
    const model = LoaderManager.model(id);
    const root = "scene" in model ? model.scene : model;
    const source = node === undefined ? root : root.getObjectByName(node);
    if (!source) throw new Error(`Node "${node}" not found in model "${id}"`);
    // SkeletonUtils.clone, a differenza di Object3D.clone, ricollega le ossa delle SkinnedMesh
    const object = clone(source);
    if (node === undefined) object.animations = model.animations;
    const { scale = 1 }: ModelDescriptor = ASSETS.models[id];
    object.scale.multiplyScalar(scale);
    return object;
  }

  static async #load(onProgress?: ProgressCallback): Promise<void> {
    const manager = new LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress?.(loaded, total);

    const modelLoaders = {
      gltf: new GLTFLoader(manager),
      fbx: new FBXLoader(manager),
    };
    const textureLoader = new TextureLoader(manager);

    const models = Object.entries(ASSETS.models) as [
      ModelId,
      ModelDescriptor,
    ][];
    const textures = Object.entries(ASSETS.textures) as [
      TextureId,
      TextureDescriptor,
    ][];
    const sounds = Object.entries(ASSETS.sounds) as [
      SoundId,
      SoundDescriptor,
    ][];

    await Promise.all([
      ...models.map(([id, { format, url }]) =>
        LoaderManager.#fetch(id, url, async (fullUrl) => {
          LoaderManager.#models.set(
            id,
            await modelLoaders[format].loadAsync(fullUrl),
          );
        }),
      ),
      ...textures.map(([id, { url, colorSpace = NoColorSpace }]) =>
        LoaderManager.#fetch(id, url, async (fullUrl) => {
          const texture = await textureLoader.loadAsync(fullUrl);
          texture.colorSpace = colorSpace;
          LoaderManager.#textures.set(id, texture);
        }),
      ),
      ...sounds.map(([id, { url, volume = 1 }]) =>
        LoaderManager.#fetch(id, url, async (fullUrl) => {
          // Howler has its own loader: report to the LoadingManager so progress includes sounds
          manager.itemStart(fullUrl);
          try {
            LoaderManager.#sounds.set(id, await loadSound(fullUrl, volume));
          } catch (error) {
            manager.itemError(fullUrl);
            throw error;
          } finally {
            manager.itemEnd(fullUrl);
          }
        }),
      ),
    ]);
  }

  static async #fetch(
    id: string,
    url: string,
    load: (fullUrl: string) => Promise<void>,
  ): Promise<void> {
    const fullUrl = import.meta.env.BASE_URL + url;
    try {
      await load(fullUrl);
    } catch (cause) {
      throw new Error(`Failed to load asset "${id}" (${fullUrl})`, { cause });
    }
  }

  static #notLoaded(kind: string, id: string): Error {
    return new Error(
      `${kind} "${id}" is not loaded. Await LoaderManager.loadAll() first.`,
    );
  }
}

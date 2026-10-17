import { Group, Mesh } from "three";
import type { Material, Object3D } from "three";
import type GUI from "lil-gui";
import DebugManager from "./DebugManager";

export interface EntityOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
}

export abstract class Entity {
  static #nextId = 0;

  readonly id = Entity.#nextId++;
  readonly object: Object3D;

  #destroyed = false;
  #debugFolder: GUI | null = null;

  constructor(
    object: Object3D = new Group(),
    { castShadow = false, receiveShadow = false }: EntityOptions = {},
  ) {
    this.object = object;
    this.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
    });
  }

  get isDestroyed(): boolean {
    return this.#destroyed;
  }

  destroy(): void {
    this.#destroyed = true;
  }

  onAdded(): void {}

  update(_delta: number, _elapsed: number): void {}

  onRemoved(): void {}

  onDebugGuiCreate(_folder: GUI): void {}

  createDebugFolder(): void {
    if (!DebugManager.isEnabled || this.#debugFolder) return;

    const folder = DebugManager.gui.addFolder(
      `${this.constructor.name} (Id: ${this.id})`,
    );
    this.onDebugGuiCreate(folder);
    if (folder.controllers.length === 0 && folder.folders.length === 0) {
      folder.destroy();
      return;
    }
    this.#debugFolder = folder;
  }

  destroyDebugFolder(): void {
    this.#debugFolder?.destroy();
    this.#debugFolder = null;
  }

  dispose(): void {
    this.object.traverse((child) => {
      if (!(child instanceof Mesh)) return;

      child.geometry.dispose();
      const materials: Material[] = Array.isArray(child.material)
        ? child.material
        : [child.material];
      for (const material of materials) {
        material.dispose();
      }
    });
  }
}

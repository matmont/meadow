import { Box3, Mesh, PointLight, Vector3 } from "three";
import type { Material, Object3D } from "three";
import LoaderManager from "../../LoaderManager";
import type { Tool } from "./tools";
import { COLORS } from "../../colors";

const FLAME_MATERIAL = "TL_Flame";
const FLICKER_AMOUNT = 0.1;
const FLICKER_SMOOTHING = 15;

export default class ToolHolder {
  readonly #hand: Object3D;
  readonly #light = new PointLight(COLORS.white, 0, 0, 2);
  readonly #flameBounds = new Box3();
  #tool: Tool | null = null;
  #object: Object3D | null = null;

  constructor(hand: Object3D) {
    this.#hand = hand;
    this.#hand.add(this.#light);
  }

  get tool(): Tool | null {
    return this.#tool;
  }

  equip(tool: Tool): void {
    if (tool === this.#tool) return;
    this.#unequip();

    const object = LoaderManager.instantiate("tools", tool.node);
    object.traverse((child) => {
      if (child instanceof Mesh) child.castShadow = true;
    });

    if ("light" in tool) {
      this.#light.color.set(tool.light.color);
      this.#light.distance = tool.light.distance;
      this.#light.intensity = tool.light.intensity;
      this.#flameCenter(object, this.#light.position);
      object.add(this.#light);
    }

    this.#hand.add(object);
    this.#tool = tool;
    this.#object = object;
  }

  update(delta: number): void {
    const tool = this.#tool;
    if (!tool || !("light" in tool)) return;

    const target =
      tool.light.intensity * (1 + (Math.random() * 2 - 1) * FLICKER_AMOUNT);
    const alpha = 1 - Math.exp(-FLICKER_SMOOTHING * delta);
    this.#light.intensity += (target - this.#light.intensity) * alpha;
  }

  dispose(): void {
    this.#unequip();
    this.#light.removeFromParent();
    this.#light.dispose();
  }

  #unequip(): void {
    if (!this.#object) return;

    this.#light.intensity = 0;
    this.#light.position.set(0, 0, 0);
    this.#hand.add(this.#light);
    this.#object.removeFromParent();
    this.#object = null;
    this.#tool = null;
  }

  #flameCenter(object: Object3D, target: Vector3): void {
    this.#flameBounds.makeEmpty();
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const materials: Material[] = Array.isArray(child.material)
        ? child.material
        : [child.material];
      if (materials.some((material) => material.name === FLAME_MATERIAL)) {
        this.#flameBounds.expandByObject(child);
      }
    });
    if (this.#flameBounds.isEmpty()) target.set(0, 0, 0);
    else this.#flameBounds.getCenter(target);
  }
}

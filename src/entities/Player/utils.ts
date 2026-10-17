import { Mesh, MeshPhongMaterial } from "three";
import type { Object3D } from "three";

// The FBX ships near-black diffuse colors and full white specular: fix them by material name.
// Materials are shared with the cached model, so this affects every instance.
export function colorPlayer(model: Object3D): void {
  model.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      if (!(material instanceof MeshPhongMaterial)) continue;
      if (material.name === "Skin") material.color.set(0xe0ac69);
      material.specular.set(0x111111);
    }
  });
}

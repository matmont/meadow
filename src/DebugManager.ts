import GUI from "lil-gui";
import { Mesh, MeshBasicMaterial, SkinnedMesh } from "three";
import type { Object3D } from "three";
import { COLORS } from "./colors";

const FPS_SAMPLE_DURATION = 500;

export default class DebugManager {
  static readonly isEnabled = new URLSearchParams(location.search).has("debug");
  static #gui: GUI | null = null;
  static #generalFolder: GUI | null = null;
  static #scene: Object3D | null = null;
  static readonly #generalSettings = { fps: 0, wireframes: false };
  static #fpsSampleStart: number | null = null;
  static #renderedFrameCount = 0;

  static readonly #wireframeMaterial = new MeshBasicMaterial({
    color: COLORS.debugWireframe,
    wireframe: true,
  });
  static readonly #wireframes = new WeakSet<Object3D>();
  static readonly #wireframedMeshes = new WeakSet<Mesh>();
  static readonly #pendingObjects: Object3D[] = [];

  private constructor() {}

  static get gui(): GUI {
    if (!DebugManager.#gui) {
      DebugManager.#gui = new GUI({ width: 300, title: "Game Engine" });
      if (!DebugManager.isEnabled) DebugManager.#gui.hide();
    }
    return DebugManager.#gui;
  }

  // Returns null when debug is disabled or `populate` adds no controls
  static createFolder(
    title: string,
    populate: (folder: GUI) => void,
  ): GUI | null {
    if (!DebugManager.isEnabled) return null;

    const folder = DebugManager.gui.addFolder(title);
    populate(folder);
    if (folder.controllers.length === 0 && folder.folders.length === 0) {
      folder.destroy();
      return null;
    }
    return folder;
  }

  static attachScene(scene: Object3D): void {
    DebugManager.#scene = scene;
    DebugManager.#generalSettings.fps = 0;
    DebugManager.#fpsSampleStart = null;
    DebugManager.#renderedFrameCount = 0;

    if (!DebugManager.isEnabled || DebugManager.#generalFolder) return;
    DebugManager.#generalFolder = DebugManager.gui.addFolder("General");
    DebugManager.#generalFolder
      .add(DebugManager.#generalSettings, "fps")
      .name("FPS")
      .listen()
      .disable();
    DebugManager.#generalFolder
      .add(DebugManager.#generalSettings, "wireframes")
      .name("Wireframes")
      .onChange((enabled: boolean) => {
        if (!enabled) DebugManager.#removeWireframes();
      });
  }

  static update(time: DOMHighResTimeStamp): void {
    if (!DebugManager.isEnabled) return;

    DebugManager.#recordFrame(time);
    DebugManager.#syncWireframes();
  }

  static #syncWireframes(): void {
    if (!DebugManager.#generalSettings.wireframes || !DebugManager.#scene) {
      return;
    }

    DebugManager.#scene.traverse(DebugManager.#collectUnwireframedMesh);
    for (const object of DebugManager.#pendingObjects) {
      DebugManager.#addWireframe(object as Mesh);
    }
    DebugManager.#pendingObjects.length = 0;
  }

  static #recordFrame(time: DOMHighResTimeStamp): void {
    if (!DebugManager.#generalFolder) return;

    if (DebugManager.#fpsSampleStart === null) {
      DebugManager.#fpsSampleStart = time;
      return;
    }

    DebugManager.#renderedFrameCount++;
    const elapsed = time - DebugManager.#fpsSampleStart;
    if (elapsed < FPS_SAMPLE_DURATION) return;

    DebugManager.#generalSettings.fps = Math.round(
      (DebugManager.#renderedFrameCount * 1000) / elapsed,
    );
    DebugManager.#fpsSampleStart = time;
    DebugManager.#renderedFrameCount = 0;
  }

  static dispose(): void {
    DebugManager.#removeWireframes();
    DebugManager.#wireframeMaterial.dispose();
    DebugManager.#gui?.destroy();
    DebugManager.#gui = null;
    DebugManager.#generalFolder = null;
    DebugManager.#scene = null;
    DebugManager.#generalSettings.fps = 0;
    DebugManager.#generalSettings.wireframes = false;
    DebugManager.#fpsSampleStart = null;
    DebugManager.#renderedFrameCount = 0;
  }

  static readonly #collectUnwireframedMesh = (object: Object3D): void => {
    if (
      object instanceof Mesh &&
      !DebugManager.#wireframes.has(object) &&
      !DebugManager.#wireframedMeshes.has(object)
    ) {
      DebugManager.#pendingObjects.push(object);
    }
  };

  static readonly #collectWireframe = (object: Object3D): void => {
    if (DebugManager.#wireframes.has(object)) {
      DebugManager.#pendingObjects.push(object);
    }
  };

  static #addWireframe(mesh: Mesh): void {
    let wireframe: Mesh;
    if (mesh instanceof SkinnedMesh) {
      const skinnedWireframe = new SkinnedMesh(
        mesh.geometry,
        DebugManager.#wireframeMaterial,
      );
      skinnedWireframe.bind(mesh.skeleton, mesh.bindMatrix);
      wireframe = skinnedWireframe;
    } else {
      wireframe = new Mesh(mesh.geometry, DebugManager.#wireframeMaterial);
    }
    wireframe.morphTargetInfluences = mesh.morphTargetInfluences;
    wireframe.raycast = () => {};

    DebugManager.#wireframes.add(wireframe);
    DebugManager.#wireframedMeshes.add(mesh);
    mesh.add(wireframe);
  }

  static #removeWireframes(): void {
    DebugManager.#scene?.traverse(DebugManager.#collectWireframe);
    for (const wireframe of DebugManager.#pendingObjects) {
      if (wireframe.parent instanceof Mesh) {
        DebugManager.#wireframedMeshes.delete(wireframe.parent);
      }
      wireframe.removeFromParent();
    }
    DebugManager.#pendingObjects.length = 0;
  }
}

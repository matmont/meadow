import { PerspectiveCamera, Scene, Timer, WebGLRenderer } from "three";
import type { WebGLRendererParameters } from "three";
import DebugManager from "./DebugManager";
import { EntityManager } from "./EntityManager";
import PhysicsManager from "./PhysicsManager";
import { resizeRendererToDisplaySize } from "./utils";

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  maxFps?: number;
  maxPixelCount?: number;
  renderer?: Omit<WebGLRendererParameters, "canvas">;
}

export class Engine {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly renderer: WebGLRenderer;
  readonly entities = new EntityManager(this.scene);
  readonly #timer = new Timer();
  readonly #maxPixelCount: number | undefined;
  #frameInterval = 0;
  #lastFrameTime = 0;
  #running = false;
  #disposed = false;

  constructor({
    canvas,
    maxFps = Infinity,
    maxPixelCount,
    renderer,
  }: EngineOptions) {
    this.renderer = new WebGLRenderer({ antialias: true, ...renderer, canvas });
    this.renderer.shadowMap.enabled = true;
    this.camera = new PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    this.#maxPixelCount = maxPixelCount;
    this.maxFps = maxFps;
    this.#timer.connect(document);
  }

  get isRunning(): boolean {
    return this.#running;
  }

  get maxFps(): number {
    return this.#frameInterval === 0 ? Infinity : 1000 / this.#frameInterval;
  }

  set maxFps(value: number) {
    if (!(value > 0)) {
      throw new RangeError(`maxFps must be greater than 0, received: ${value}`);
    }
    this.#frameInterval = 1000 / value;
  }

  start(): void {
    this.#assertNotDisposed();
    if (this.#running) return;

    this.#running = true;
    this.#lastFrameTime = 0;
    this.#timer.reset();
    DebugManager.attachScene(this.scene);
    console.log(this.entities);
    this.renderer.setAnimationLoop(this.#loop);
  }

  stop(): void {
    if (!this.#running) return;

    this.#running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose(): void {
    if (this.#disposed) return;

    this.stop();
    this.entities.dispose();
    this.#timer.dispose();
    this.renderer.dispose();
    this.#disposed = true;
  }

  readonly #loop = (time: DOMHighResTimeStamp): void => {
    const sinceLastFrame = time - this.#lastFrameTime;
    if (sinceLastFrame < this.#frameInterval) return;
    this.#lastFrameTime = time - (sinceLastFrame % this.#frameInterval || 0);

    this.#timer.update(time);

    this.#resize();
    const delta = this.#timer.getDelta();
    this.entities.update(delta, this.#timer.getElapsed());
    DebugManager.update(time);
    if (PhysicsManager.isInitialized) PhysicsManager.step(delta);
    this.renderer.render(this.scene, this.camera);
  };

  #resize(): void {
    if (!resizeRendererToDisplaySize(this.renderer, this.#maxPixelCount)) {
      return;
    }
    const canvas = this.renderer.domElement;
    this.camera.aspect = canvas.clientWidth / canvas.clientHeight;
    this.camera.updateProjectionMatrix();
  }

  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw new Error(
        "The Engine has been disposed and cannot be used anymore.",
      );
    }
  }
}

import {
  AmbientLight,
  Box3,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from "three";
import LoaderManager from "../../LoaderManager";
import type { ModelId } from "../../LoaderManager";
import type { ResourceId } from "../../Inventory";
import { COLORS } from "../../colors";

const ICON_SIZE = 96;
const PADDING = 1.05;

const ICON_MODELS: Record<ResourceId, ModelId> = {
  wood: "resourceWood",
  stone: "resourceStone",
  mushroom: "resourceMushroom",
};

// Three-quarter view from the front, slightly above, like the props are seen in game
const VIEW_DIRECTION = new Vector3(1, 0.9, 1.4).normalize();

// Renders each resource model once into a PNG data URL, like the ToolBar icons. The renderer
// lives only for this call so the HUD does not keep a second WebGL context alive
export function renderResourceIcons(
  resources: readonly ResourceId[],
): Record<ResourceId, string> {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(ICON_SIZE, ICON_SIZE, false);
  renderer.setClearColor(COLORS.black, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera();
  camera.position.copy(VIEW_DIRECTION).multiplyScalar(10);
  camera.lookAt(0, 0, 0);
  const ambient = new AmbientLight(COLORS.white, 1.2);
  const key = new DirectionalLight(COLORS.white, 2.5);
  key.position.set(3, 6, 5);
  scene.add(ambient, key);

  const bounds = new Box3();
  const sphere = new Sphere();
  const icons: Partial<Record<ResourceId, string>> = {};

  for (const resource of resources) {
    // Shares geometry and materials with the cached model: removed, never disposed
    const object = LoaderManager.instantiate(ICON_MODELS[resource]);
    object.updateMatrixWorld(true);
    bounds.setFromObject(object, true);
    bounds.getBoundingSphere(sphere);
    object.position.sub(sphere.center);

    // The bounding sphere fits the model whatever the view direction, at the cost of a bit
    // of empty margin around elongated models such as the log
    const half = sphere.radius * PADDING;
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();

    scene.add(object);
    renderer.render(scene, camera);
    icons[resource] = renderer.domElement.toDataURL("image/png");
    scene.remove(object);
  }

  key.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return icons as Record<ResourceId, string>;
}

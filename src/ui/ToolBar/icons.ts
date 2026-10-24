import {
  AmbientLight,
  Box3,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import LoaderManager from "../../LoaderManager";
import type { Tool, ToolId } from "../../entities/Player/tools";

const ICON_SIZE = 128;
const PADDING = 1.15;

// Tool handles run along -Z with the head in the YZ plane, so a camera on +X sees their
// profile; tilting around X lays the handle on the diagonal, a slight Y turn adds depth
const ICON_ROTATION: Record<ToolId, { x: number; y: number }> = {
  pickaxe: { x: Math.PI / 4, y: 0.35 },
  axe: { x: Math.PI / 4, y: 0.35 },
  torch: { x: -0.2, y: 0.35 },
};

// Renders each tool model once into a PNG data URL. The renderer lives only for this call so
// the HUD does not keep a second WebGL context alive next to the game one
export function renderToolIcons(
  tools: readonly Tool[],
): Record<ToolId, string> {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(ICON_SIZE, ICON_SIZE, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera();
  camera.position.set(10, 0, 0);
  camera.lookAt(0, 0, 0);
  const ambient = new AmbientLight(0xffffff, 1.2);
  const key = new DirectionalLight(0xffffff, 2.5);
  key.position.set(5, 6, 3);
  scene.add(ambient, key);

  const bounds = new Box3();
  const center = new Vector3();
  const size = new Vector3();
  const icons: Partial<Record<ToolId, string>> = {};

  for (const tool of tools) {
    // Shares geometry and materials with the cached model: removed, never disposed
    const object = LoaderManager.instantiate("tools", tool.node);
    const { x, y } = ICON_ROTATION[tool.id];
    object.rotation.set(x, y, 0, "YXZ");
    object.updateMatrixWorld(true);

    bounds.setFromObject(object, true);
    bounds.getCenter(center);
    bounds.getSize(size);
    object.position.sub(center);

    // Seen from +X, screen width is the world Z extent and screen height the Y extent
    const half = (Math.max(size.y, size.z) / 2) * PADDING;
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();

    scene.add(object);
    renderer.render(scene, camera);
    icons[tool.id] = renderer.domElement.toDataURL("image/png");
    scene.remove(object);
  }

  key.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return icons as Record<ToolId, string>;
}

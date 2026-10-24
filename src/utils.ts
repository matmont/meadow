import { WebGLRenderer } from "three";

// Past these limits the extra pixels are barely visible but cost a lot of fill rate,
// especially on large external displays
const MAX_PIXEL_RATIO = 2;
const MAX_PIXEL_COUNT = 2560 * 1440;

export function resizeRendererToDisplaySize(
  renderer: WebGLRenderer,
  maxPixelCount = MAX_PIXEL_COUNT,
) {
  const canvas = renderer.domElement;
  const pixelRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
  let width = Math.floor(canvas.clientWidth * pixelRatio);
  let height = Math.floor(canvas.clientHeight * pixelRatio);
  const pixelCount = width * height;
  const renderScale =
    pixelCount > maxPixelCount ? Math.sqrt(maxPixelCount / pixelCount) : 1;
  width = Math.floor(width * renderScale);
  height = Math.floor(height * renderScale);

  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}

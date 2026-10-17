import { WebGLRenderer } from "three";

export function resizeRendererToDisplaySize(
  renderer: WebGLRenderer,
  maxPixelCount = 3840 * 2160,
) {
  const canvas = renderer.domElement;
  const pixelRatio = window.devicePixelRatio;
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

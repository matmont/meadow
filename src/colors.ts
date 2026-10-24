import type { ColorRepresentation } from "three";

// Colors used by Three.js objects. HUD colors are CSS variables in `src/ui/ui.css`
export const COLORS = {
  white: 0xffffff,
  black: 0x000000,
  sunlight: 0xffffff,
  sky: 0xbfd9ff,
  hemisphereGround: 0x3a4a2a,
  ground: 0x329383,
  torchLight: 0xff9a3c,
  dirt: 0x7a5a3a,
  sand: 0xcdb284,
  debugWireframe: 0xff0000,
} as const satisfies Record<string, ColorRepresentation>;

import type { ColorRepresentation } from "three";
import type { KeyCode } from "../../InputManager";
import { COLORS } from "../../colors";

export interface ToolLight {
  readonly color: ColorRepresentation;
  readonly intensity: number;
  readonly distance: number;
  readonly decay: number;
}

export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly key: KeyCode;
  readonly node: string;
  readonly light?: ToolLight;
}

// Held together with the left mouse button to use the selected tool
export const TOOL_USE_KEY: KeyCode = "KeyJ";

export const TOOLS = [
  { id: "pickaxe", name: "Pickaxe", key: "Digit1", node: "Pickaxe" },
  { id: "axe", name: "Axe", key: "Digit2", node: "Axe" },
  {
    id: "torch",
    name: "Torch",
    key: "Digit3",
    node: "Torch",
    light: {
      color: COLORS.torchLight,
      intensity: 4,
      distance: 12,
      decay: 1,
    },
  },
] as const satisfies readonly ToolDefinition[];

export type Tool = (typeof TOOLS)[number];
export type ToolId = Tool["id"];

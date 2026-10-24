import type { ColorRepresentation } from "three";
import type { KeyCode } from "../../InputManager";

export interface ToolLight {
  readonly color: ColorRepresentation;
  readonly intensity: number;
  readonly distance: number;
}

export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly key: KeyCode;
  readonly node: string;
  readonly light?: ToolLight;
}

export const TOOLS = [
  { id: "pickaxe", name: "Pickaxe", key: "Digit1", node: "Pickaxe" },
  { id: "axe", name: "Axe", key: "Digit2", node: "Axe" },
  {
    id: "torch",
    name: "Torch",
    key: "Digit3",
    node: "Torch",
    light: { color: 0xff9a3c, intensity: 4, distance: 6 },
  },
] as const satisfies readonly ToolDefinition[];

export type Tool = (typeof TOOLS)[number];
export type ToolId = Tool["id"];

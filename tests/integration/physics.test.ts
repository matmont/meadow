import RAPIER from "@dimforge/rapier3d-compat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import PhysicsManager from "../../src/PhysicsManager";

const STEP = 1 / 60;
const BALL_RADIUS = 0.5;

describe("PhysicsManager", () => {
  beforeAll(async () => {
    await PhysicsManager.init();
  });

  // Every Rapier object must be removed before the world is freed (see AGENTS.md)
  afterAll(() => {
    PhysicsManager.dispose();
  });

  it("initializes a world with the game gravity", () => {
    expect(PhysicsManager.isInitialized).toBe(true);
    expect(PhysicsManager.world.gravity.y).toBeCloseTo(
      PhysicsManager.GRAVITY.y,
    );
  });

  it("lets a dynamic body fall and rest on a fixed collider", () => {
    const world = PhysicsManager.world;
    const ground = world.createCollider(
      RAPIER.ColliderDesc.cuboid(10, 0.5, 10).setTranslation(0, -0.5, 0),
    );
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 3, 0),
    );
    world.createCollider(RAPIER.ColliderDesc.ball(BALL_RADIUS), body);

    for (let i = 0; i < 240; i++) PhysicsManager.step(STEP);

    expect(body.translation().y).toBeCloseTo(BALL_RADIUS, 1);
    expect(Math.abs(body.linvel().y)).toBeLessThan(0.05);

    world.removeRigidBody(body);
    world.removeCollider(ground, false);
  });
});

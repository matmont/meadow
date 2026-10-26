import { afterEach, describe, expect, it } from "vitest";
import PhysicsManager from "../../src/PhysicsManager";

// Each test starts and ends without a world, so the static state never leaks between tests
describe("PhysicsManager lifecycle", () => {
  afterEach(() => {
    PhysicsManager.dispose();
  });

  it("throws when the world is read before init()", () => {
    expect(PhysicsManager.isInitialized).toBe(false);
    expect(() => PhysicsManager.world).toThrow(/not initialized/);
  });

  it("keeps the same world when init() is called twice", async () => {
    await PhysicsManager.init();
    const world = PhysicsManager.world;

    await PhysicsManager.init();

    expect(PhysicsManager.world).toBe(world);
  });

  it("forgets the world on dispose() and creates a new one on the next init()", async () => {
    await PhysicsManager.init();
    const first = PhysicsManager.world;

    PhysicsManager.dispose();

    expect(PhysicsManager.isInitialized).toBe(false);
    expect(() => PhysicsManager.world).toThrow(/not initialized/);

    await PhysicsManager.init();
    expect(PhysicsManager.world).not.toBe(first);
  });

  it("allows dispose() without a world", () => {
    expect(() => PhysicsManager.dispose()).not.toThrow();
  });

  it("uses the frame delta as the timestep when it is small enough", async () => {
    await PhysicsManager.init();

    PhysicsManager.step(1 / 60);

    expect(PhysicsManager.world.timestep).toBeCloseTo(1 / 60);
  });

  it("clamps long frames to a 1/30 s timestep", async () => {
    await PhysicsManager.init();

    PhysicsManager.step(0.5);

    expect(PhysicsManager.world.timestep).toBeCloseTo(1 / 30);
  });
});

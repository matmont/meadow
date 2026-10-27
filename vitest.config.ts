import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

// Reuses the app's Vite config, so tests resolve modules exactly like `yarn dev` and
// `yarn build`. Each project inherits the root `test` options through `extends: true`
export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          // Rapier's `main` is a CommonJS file inside a `"type": "module"` package, so Node
          // cannot load it, and Vite's SSR transform breaks its frozen default export.
          // Pointing at its ESM build (the `module` field the browser bundle uses) lets Node
          // import it natively
          find: /^@dimforge\/rapier3d-compat$/,
          replacement: "@dimforge/rapier3d-compat/rapier.es.js",
        },
      ],
    },
    test: {
      // No DOM by default. A test that needs one opts in with a
      // `// @vitest-environment happy-dom` (or `jsdom`) comment at the top of its file,
      // after that package is added as a devDependency
      environment: "node",
      projects: [
        {
          extends: true,
          test: {
            name: "unit",
            include: ["src/**/__tests__/**/*.test.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "integration",
            include: ["tests/integration/**/*.test.ts"],
          },
        },
      ],
    },
  }),
);

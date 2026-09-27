// Bundles the worker (and the migrate/seed entry points) into dist/ with esbuild.
// Path aliases (@/…) are resolved by esbuild from tsconfig.json.
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  // Native/optional deps stay external; everything else is bundled.
  packages: "external",
  tsconfig: "tsconfig.json",
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
};

await build({ ...common, entryPoints: { worker: "src/worker/main.ts" }, outdir: "dist", outExtension: { ".js": ".mjs" } });
// migrate/seed run in the worker image (which has production node_modules).
await build({ ...common, entryPoints: { migrate: "src/lib/db/migrate.ts", seed: "seed/seed.ts" }, outdir: "dist", outExtension: { ".js": ".mjs" } });

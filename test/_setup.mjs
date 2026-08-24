// Test bootstrap: teach Node's ESM loader to resolve this package's own
// build output.
//
// WHY THIS EXISTS. tsconfig sets `moduleResolution: "bundler"`, so the
// emitted dist/*.js keeps extensionless relative imports (`from "../api"`).
// That is correct for the consumers — every brand app runs this through
// Vite — but Node's ESM resolver requires a real file path, so
// `import "../dist/index.js"` dies on the first internal import.
//
// The alternatives were worse: changing the emit shape would change what
// four brand apps consume, and adding a bundler or a TS test runner would
// add a dependency tree to a package whose whole job is to be small. A
// resolve hook is fifteen lines and touches nothing that ships.
//
// Tests therefore run against dist/, which means `npm test` builds first —
// see package.json. That has an accidental virtue: they test what the brand
// apps actually import, not the TypeScript they never see.

import { register } from "node:module";

register("./_resolve-extensionless.mjs", import.meta.url);

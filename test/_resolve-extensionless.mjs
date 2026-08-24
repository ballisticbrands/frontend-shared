// Resolve hook: `./foo` → `./foo.js` → `./foo/index.js`, relative imports
// only. See test/_setup.mjs for why.
//
// Deliberately narrow. It never touches bare specifiers (`react`,
// `react-dom/server`), so package resolution, exports maps and node_modules
// all behave exactly as they normally would — the hook can only ever add a
// file extension to a path that already points inside this package.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  const relative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
  if (relative && !hasExtension && context.parentURL) {
    const base = new URL(specifier, context.parentURL).href;
    for (const candidate of [`${base}.js`, `${base}/index.js`]) {
      if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate, context);
    }
  }
  return nextResolve(specifier, context);
}

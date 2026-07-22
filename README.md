# @ballisticbrands/frontend-shared

Shared TypeScript library consumed by every Dragon-brand app frontend.
Publishes to **GitHub Packages** as `@ballisticbrands/frontend-shared`.

## Where this fits

Three-repo pattern for the frontend layer:

```
ballisticbrands/frontend-shared          ← this repo (npm package)
ballisticbrands/dragonbot-frontend       ← app.getdragonbot.com
ballisticbrands/dragonrefunds-frontend   ← app.dragonrefunds.com
(future brand frontends…)
```

All consumer apps talk to the same shared backend at
`api.getdragonbot.com` (repo: `ballisticbrands/sellerconnect`). Bearer
tokens issued by that backend are not origin-scoped, so a user who
signs up on one brand's app can sign in on another with the same
credentials. The backend derives which brand a request came from via
the `Origin` header — see `sellerconnect/src/lib/brand.ts`.

## What lives here vs. each consumer repo

| Owned by consumer | Owned by shared (this repo) |
|---|---|
| `App.tsx` (routes) | `lib/api.ts` — apiFetch, ApiError |
| `main.tsx` (boot, analytics injection) | `lib/session.ts` — token, useSession, fetchCurrentUser |
| `src/brands/*.ts` (brand config) | `lib/auth.ts` — signIn/signUp/signOut/verify/resend |
| `SignUp.tsx` / `SignIn.tsx` (copy + layout) | `lib/attribution.ts` — capture + identify + trackAccountConnected |
| `Dashboard.tsx` + dashboard subtree | `brand-context.tsx` — BrandProvider + useBrand |
| Layouts (AuthLayout, AppLayout, DocsLayout) | `config.ts` — configureShared + getSharedConfig |
| `Index.tsx` (marketing landing) | `Button`, `Input`, `Label` primitives |
| `components/ui/{Badge,Card,CopyButton,CodeBlock}` | `Turnstile`, `VerifyEmailBanner` |
| `docs/*` | `VerifyEmailPage`, `ForgotPasswordPage` |
| `public/*` (logo, favicon) | `useSignUpForm`, `useSignInForm` |

Rule of thumb: **backend-contract-touching code + auth flow lives
here**. Everything else (marketing pages, dashboard workflows,
brand-specific features) lives in the consumer repo.

## Boot sequence in every consumer

```tsx
// consumer/src/main.tsx
import { configureShared, BrandProvider } from "@ballisticbrands/frontend-shared";
import { activeBrand } from "./brands";
import { config } from "./lib/config";

const brand = activeBrand();

// Call BEFORE any shared function runs. Sets the module-level
// singleton non-React code (attribution helpers, fetch wrapper)
// reads apiUrl + brand + turnstileSiteKey from.
configureShared({
  apiUrl: config.apiUrl,
  brand,
  turnstileSiteKey: config.turnstileSiteKey,
});

// ...analytics injection, attribution capture...

createRoot(root).render(
  <BrandProvider brand={brand}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </BrandProvider>
);
```

React components read brand via `useBrand()`. Non-React code inside
shared reads via `getSharedConfig().brand`. Both point at the same
value the consumer passed to `configureShared()` at boot.

## Publishing a new version

Semver. Every change gets a version. **Tag = source of truth**;
CI enforces that the tag matches `package.json` and refuses to
publish otherwise.

```bash
# 1. Edit src/, bump package.json version + SHARED_PACKAGE_VERSION
#    in src/index.ts
# 2. Commit + push to main
git add . && git commit -m "v0.4.0: <what changed>" && git push

# 3. Tag matching the new version and push
git tag v0.4.0
git push origin v0.4.0

# .github/workflows/publish.yml runs on the tag push:
#   verifies tag matches package.json → builds → npm publish
```

**Breaking changes** = major bump (v1.x.x). Consumers pin `^0.x` so
they auto-pick minor + patch bumps but require a package.json edit
to accept a major.

**Never mutate a published version.** If you tagged v0.4.0 and
something's wrong, bump to v0.4.1 and tag that. GH Packages doesn't
let you re-publish the same version anyway.

## Consuming from a brand repo

Consumer `package.json`:
```json
"dependencies": {
  "@ballisticbrands/frontend-shared": "^0.3.0"
}
```

Consumer `.npmrc` (at repo root):
```
@ballisticbrands:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
always-auth=true
```

Consumer `.github/workflows/deploy.yml` install step:
```yaml
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: npm
    registry-url: "https://npm.pkg.github.com"
    scope: "@ballisticbrands"

- name: Install dependencies
  run: npm install --no-audit --no-fund  # NOT `npm ci` — see note below
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Consumer `tailwind.config.js` `content` array **must include** the
shared package's dist output so Tailwind JIT sees the classes used
inside shared components:
```js
content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}',
  './node_modules/@ballisticbrands/frontend-shared/dist/**/*.js',
],
```

**Why `npm install` and not `npm ci`?** Local dev requires a PAT
with `read:packages` to update `package-lock.json` (GH Packages
requires auth even for public packages). Using `npm install` lets
CI generate lock entries when the shared dep is bumped, without
requiring every dev to hand-regenerate the lock file locally.

## Local dev loop

Package/publish/install cycle is slow when iterating. Use `npm link`:

```bash
# In frontend-shared
npm run build   # generate dist/
npm link         # register global symlink

# In the consumer repo
npm link @ballisticbrands/frontend-shared
```

Now the consumer's `node_modules/@ballisticbrands/frontend-shared`
points at your local checkout. Rebuild shared (`npm run build`) to
see changes; the consumer's Vite dev server hot-reloads.

**When done** — restore the published version:
```bash
# In the consumer repo
npm unlink @ballisticbrands/frontend-shared
npm install    # re-adds the pinned version from package.json
```

For a stable "under test" version between local iteration and full
release, publish a pre-release:
```bash
# Bump to 0.4.0-rc.1, tag v0.4.0-rc.1, publish.
# Consumers pin "@ballisticbrands/frontend-shared": "0.4.0-rc.1"
# for testing, then upgrade to "0.4.0" once stable.
```

## Adding a new symbol

1. Write the code in `src/<subdir>/`
2. **Re-export from `src/index.ts`** — anything not re-exported is
   an internal detail; consumers can't import from deep paths (dist
   doesn't expose them by convention)
3. Bump `package.json` version + `SHARED_PACKAGE_VERSION` in
   `src/index.ts` (minor for additions, major for breakage)
4. Commit → tag → push tag → publish workflow runs
5. Update each consumer's `package.json` pin + push (their CI
   installs the new version on next deploy)

## Adding a new brand

Fork one of the consumer repos:

```bash
gh repo create ballisticbrands/dragon<name>-frontend --public \
  --template ballisticbrands/dragonbot-frontend
```

(Or copy locally, delete `.git`, `git init`, push to a new empty
repo — this is what was done for dragonrefunds-frontend before the
template pattern was set up.)

Then in the new repo:
1. Edit `src/brands/<name>.ts` with the new brand's values (GA4 ID,
   Clarity ID, header label, etc.)
2. Rename `src/brands/dragonbot.ts` → `src/brands/<name>.ts`
3. Update `src/brands/index.ts` to import + export the new brand
4. Update `public/CNAME` to the new app hostname
5. Update `index.html` fallback title + description
6. Enable GH Pages + set custom domain via `gh api /repos/.../pages`
7. Add the new hostname to backend's CORS allowlist + brand registry
   (see `sellerconnect/config/tenants/dragonbot.json` +
   `sellerconnect/src/lib/brand.ts`)
8. Add the new hostname to the Cloudflare Turnstile widget allowlist
9. Provision DNS: at Namecheap, add `app` CNAME → `ballisticbrands.github.io`

## Peer dependencies

`react`, `react-dom`, `react-router-dom` — consumers provide.
Shared components use whichever version the consumer has installed.
Bumping the peer range requires a MAJOR version bump of shared to
signal potential incompatibility.

## Architecture rationale

**Why not a monorepo?** The apps are meant to diverge in features
(DragonBot grows into a data-connector story, Dragon Refunds grows a
refunds workflow, more brands in the pipeline). Separate repos keep
divergence trivial — brand-specific code lives in one place with no
shared coordination needed to change it. The shared code that DOES
need to stay in sync (auth flow, backend contract) lives here as a
versioned dep.

**Why not git submodule?** Submodule UX is universally painful
(every clone/pull needs `--recurse-submodules`, versioning is by
commit SHA, breaking changes propagate immediately without semver
signaling). npm package via GH Packages gives semver, changelogs,
and clean CI installs.

**Why GH Packages, not public npm?** Origin-scoped auth is the
default and matches how the org's other packages are handled. The
public/private toggle is a per-package setting we can flip if we
ever want it.

## Runbook: things that will bite you

- **"401 unauthenticated" on `npm install`** — the consumer repo's
  `.npmrc` uses `${NODE_AUTH_TOKEN}`. Locally: set env
  `NODE_AUTH_TOKEN=<a GH PAT with read:packages>` before running.
  In CI: workflow sets `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`
  and grants `permissions: packages: read`.
- **"403 permission_denied" on install** — the package is private.
  Either flip visibility in the GH web UI (org settings must permit
  public packages first) or link the private package to each
  consumer repo under Package Settings → Manage Actions access.
- **"Missing @ballisticbrands/frontend-shared from lock file"** on
  `npm ci` — the consumer's lock file doesn't have the current dep.
  CI uses `npm install` (not `npm ci`) for this reason; if you
  reintroduced `npm ci`, revert.
- **Tailwind class not rendering** in a shared component — the
  consumer's `tailwind.config.js` `content` array is missing
  `./node_modules/@ballisticbrands/frontend-shared/dist/**/*.js`.
- **Tag exists but no publish workflow ran** — the `.github/workflows/publish.yml`
  only fires on tag push, not on branch push. If you tagged locally
  but forgot `git push origin vX.Y.Z`, nothing publishes.
- **Publish workflow failed on tag verification** — the tag doesn't
  match `package.json` version. Delete the tag, bump package.json,
  re-tag, push.

## Related repos + services

- **Consumers:**
  [dragonbot-frontend](https://github.com/ballisticbrands/dragonbot-frontend),
  [dragonrefunds-frontend](https://github.com/ballisticbrands/dragonrefunds-frontend)
- **Backend:** [sellerconnect](https://github.com/ballisticbrands/sellerconnect)
  (serves all brands at `api.getdragonbot.com`; brand detection at
  `src/lib/brand.ts`)
- **Landing pages:** each brand has its own LP repo
  (`DragonBotLP`, `DragonRefunds-LP`)
- **GH Packages:** https://github.com/orgs/ballisticbrands/packages/npm/frontend-shared

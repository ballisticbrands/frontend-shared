# @ballisticbrands/frontend-shared

Shared TypeScript library consumed by both `dragonbot-frontend` and
`dragonrefunds-frontend`. Owns everything that both apps have to
implement identically to stay compatible with the shared backend:

- API client + `ApiError`
- Session token storage + `useSession()` hook
- Auth API-call functions (sign-up, sign-in, sign-out, verify email,
  resend verification)
- First-touch attribution + cross-platform user identity
- Brand context (`BrandProvider` + `useBrand()`)
- Auth-flow UI (`Turnstile`, `VerifyEmailBanner`, `<VerifyEmail />`
  page, `<ForgotPassword />` page)
- Auth-form hooks (`useSignUpForm`, `useSignInForm`)

Brand-specific chrome, dashboard, marketing pages, and any workflow
that differs between DragonBot and Dragon Refunds stays in each
brand's own repo.

## Publishing

```bash
# bump package.json version, commit
git tag v0.1.0
git push origin v0.1.0
# .github/workflows/publish.yml runs → publishes to GitHub Packages
```

CI verifies the tag matches `package.json` — a hand-rolled bump that
forgot to tag will NOT publish.

## Consuming

In each consumer repo's `package.json`:

```json
"dependencies": {
  "@ballisticbrands/frontend-shared": "^0.1.0"
}
```

And a `.npmrc` at the consumer repo root:

```
@ballisticbrands:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

The `NPM_TOKEN` is a GH Actions secret (a PAT with `read:packages`
on this org). Local dev: set `NPM_TOKEN` in your shell profile with
the same PAT.

## Development loop

For rapid iteration during active shared-code work, use `npm link`:

```bash
# in frontend-shared
npm run build
npm link

# in the consumer repo
npm link @ballisticbrands/frontend-shared
```

Now the consumer's `node_modules/@ballisticbrands/frontend-shared`
symlinks to your local checkout — no publish cycle needed. When
done: `npm unlink @ballisticbrands/frontend-shared` in the consumer,
then `npm install` to restore the published version.

## Peer dependencies

`react`, `react-dom`, and `react-router-dom` are peer deps —
consumers provide them. Shared components use whatever React version
the consumer has installed.

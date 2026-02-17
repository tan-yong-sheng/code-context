# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the code-context project.

## Workflows Overview

| Workflow | File | Purpose |
|----------|------|---------|
| **CI** | `ci.yml` | Lint and build on multiple platforms |
| **E2E Tests** | `e2e-test.yml` | Run E2E tests on Ubuntu, macOS, and Windows |
| **Publish** | `publish.yml` | Publish to NPM with dev/beta/latest tags |
| **Release** | `release.yml` | Create GitHub releases |

---

## Publishing to NPM

The `publish.yml` workflow is **manual only** - it does not trigger automatically on push.

### How to Publish

#### Option 1: GitHub Actions UI

1. Go to **Actions** → **Publish to NPM** → **Run workflow**
2. Select the NPM tag (`dev`, `beta`, or `latest`)
3. Click **Run workflow**

#### Option 2: GitHub CLI (gh)

```bash
# Publish dev version
gh workflow run publish.yml -f npm_tag=dev

# Publish beta version
gh workflow run publish.yml -f npm_tag=beta

# Publish latest (production) version
gh workflow run publish.yml -f npm_tag=latest -f version_bump=patch
```

### Publishing Options

#### Publish Beta Version

1. Go to **Actions** → **Publish to NPM** → **Run workflow**
2. Select `beta` from the **NPM tag** dropdown
3. Click **Run workflow**

This creates a version like `0.0.1-beta.1739701234` and tags it as `beta`.

Install:
```bash
npm install @tan-yong-sheng/code-context-core@beta
```

#### Publish Production Version (Latest)

1. Go to **Actions** → **Publish to NPM** → **Run workflow**
2. Select `latest` from the **NPM tag** dropdown
3. Select version bump type (`patch`, `minor`, or `major`)
4. Click **Run workflow**

This will:
- Bump the version in `package.json`
- Publish to NPM with `latest` tag
- Create a Git tag (e.g., `v0.0.2`)
- Create a GitHub Release with auto-generated notes

Install:
```bash
npm install @tan-yong-sheng/code-context-core  # or @latest
```

---

## Required Secrets

You need to configure one secret in your GitHub repository:

### `NPM_TOKEN`

1. Go to [npmjs.com](https://www.npmjs.com/) → Access Tokens → Generate New Token
2. Select **Publish** scope
3. Copy the token
4. Go to your GitHub repo → Settings → Secrets and variables → Actions
5. Click **New repository secret**
6. Name: `NPM_TOKEN`
7. Value: Your npm token

---

## NPM Tags Explained

| Tag | Purpose | When to Use |
|-----|---------|-------------|
| `latest` | Production releases | Stable, tested releases for general use |
| `beta` | Pre-release testing | Feature-complete but needs testing before stable |
| `dev` | Development builds | Latest changes from main branch, may be unstable |

### Version Examples

Given current version `0.0.1`:

- **dev publish:** `0.0.1-dev.1739701234` (timestamp-based)
- **beta publish:** `0.0.1-beta.1739701234` (timestamp-based)
- **latest patch:** `0.0.2` (bumps patch version)
- **latest minor:** `0.1.0` (bumps minor version)
- **latest major:** `1.0.0` (bumps major version)

---

## Troubleshooting

### Publish fails with "You cannot publish over the previously published versions"

This happens when trying to publish the same version twice. The dev and beta workflows include timestamps to avoid this. If it happens:
- For `latest`: Manually bump version in package.json before publishing
- For `dev`/`beta`: Re-run the workflow (new timestamp)

### "npm ERR! 401 Unauthorized - You must be logged in"

The `NPM_TOKEN` secret is not set or is invalid. Check:
1. Secret is named exactly `NPM_TOKEN`
2. Token has "Publish" scope on npm
3. Token is not expired

### Tests fail but I want to publish anyway

This is not recommended, but you can:
1. Go to the workflow file
2. Temporarily remove the `needs: build` line
3. Run the workflow
4. **Remember to restore the file afterward!**

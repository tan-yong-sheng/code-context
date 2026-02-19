# GitHub Workflows Documentation

This directory contains all GitHub Actions workflows for the Code Context project. Workflows are organized by purpose: continuous integration, testing, and releases.

## Quick Reference

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `tests.yml` | push/PR to main/master | Primary CI: unit tests, coverage, lint |
| `tests-e2e-matrix.yml` | push/PR (paths filter) | Cross-platform E2E tests |
| `tests-vscode.yml` | push/PR (paths filter) | VSCode extension tests |
| `ci-dev-release.yml` | push to dev, manual | Auto-publish dev versions |
| `release-npm-manual.yml` | Manual dispatch | Controlled npm releases |
| `release-vscode-manual.yml` | Manual dispatch | Controlled VSCode releases |
| `release-on-tag.yml` | Tag push (v*, c*) | Auto-publish on tag |
| `build-vscode-platforms.yml` | Manual, tag (vscode-v*) | Multi-platform VSIX builds |

## Workflow Categories

### Continuous Integration

These workflows run on every code change to verify quality and compatibility.

#### `tests.yml` — Primary Test Workflow
- **Triggers:** push/PR to main/master
- **Runs:**
  - Unit tests with coverage for core package (Node 20.x, 22.x)
  - Unit tests with coverage for MCP package (Node 20.x, 22.x)
  - E2E tests (PR only, skipped on push events)
  - Linting
- **Artifacts:** Coverage reports

#### `tests-e2e-matrix.yml` — Cross-Platform E2E Tests
- **Triggers:** push/PR (paths: core/mcp source files), manual
- **Runs:**
  - E2E tests on Ubuntu (Node 20.x, 22.x)
  - E2E tests on macOS (Node 20.x)
  - E2E tests on Windows (Node 20.x)
- **Artifacts:** Test results, database artifacts on failure

#### `tests-vscode.yml` — VSCode Extension Tests
- **Triggers:** push/PR (paths: vscode-extension, core source), manual
- **Runs:**
  - Builds core package
  - Builds VSCode extension
  - Runs extension tests on Ubuntu, Windows, macOS
- **Artifacts:** Test results per platform

### Continuous Deployment (Development)

#### `ci-dev-release.yml` — Dev Branch Auto-Release
- **Triggers:** push/PR to master/main/dev, manual dispatch
- **Runs:**
  - Tests on Node 20.x, 22.x
  - Auto-publishes npm dev versions (when on `dev` branch or manual `publish=true`)
  - Auto-publishes VSCode pre-release extensions
- **Use Case:** Automatic dev releases for testing new features

### Manual Releases

These workflows are triggered manually via GitHub UI or `gh` CLI for controlled releases.

#### `release-npm-manual.yml` — Manual NPM Release
- **Triggers:** Manual dispatch
- **Inputs:**
  - `npm_tag`: dev, beta, or latest
  - `version_bump`: patch, minor, major (for latest only)
- **Runs:**
  - Builds core + MCP packages
  - Runs E2E tests
  - Publishes to npm with specified tag
  - Creates git tag + GitHub release (latest only)

#### `release-vscode-manual.yml` — Manual VSCode Release
- **Triggers:** Manual dispatch
- **Inputs:**
  - `release_type`: dev, beta, or release
  - `version_bump`: patch, minor, major (for release only)
- **Runs:**
  - NPM E2E tests
  - VSCode tests on all platforms
  - Builds and publishes extension
  - Creates git tag + GitHub release (release only)

### Automated Releases

#### `release-on-tag.yml` — Tag-Triggered Release
- **Triggers:** Tag push matching `v*` or `c*`
- **Runs:**
  - Builds packages
  - Publishes core + MCP to npm
- **Use Case:** Quick releases via git tags (no test gate)

### Platform Builds

#### `build-vscode-platforms.yml` — Multi-Platform VSCode Builds
- **Triggers:** Manual dispatch, tag push (vscode-v*)
- **Inputs:**
  - `vs_code_version`: VS Code version for Electron target
  - `electron_version`: Electron version
  - `publish`: Whether to publish to marketplace
- **Builds:**
  - linux-x64, linux-arm64
  - darwin-x64, darwin-arm64
  - win32-x64
  - Universal (no native binaries)
- **Artifacts:** Platform-specific VSIX files

## Workflow Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                    Code Change (push/PR)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
    ┌──────────┐      ┌──────────────┐    ┌──────────────┐
    │ tests.yml│      │tests-e2e-    │    │tests-vscode  │
    │ (primary)│      │matrix.yml    │    │.yml          │
    └──────────┘      └──────────────┘    └──────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     ci-dev-release.yml        │
              │   (if on dev branch)          │
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │     Manual Release            │
              │  release-npm-manual.yml       │
              │  release-vscode-manual.yml    │
              └───────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │    build-vscode-platforms.yml │
              │    (platform-specific builds) │
              └───────────────────────────────┘
```

---

## Publishing to NPM

The `release-npm-manual.yml` workflow is **manual only** - it does not trigger automatically on push.

### How to Publish

#### Option 1: GitHub Actions UI

1. Go to **Actions** → **Release NPM Manual** → **Run workflow**
2. Select the NPM tag (`dev`, `beta`, or `latest`)
3. Click **Run workflow**

#### Option 2: GitHub CLI (gh)

```bash
# Publish dev version
gh workflow run release-npm-manual.yml -f npm_tag=dev

# Publish beta version
gh workflow run release-npm-manual.yml -f npm_tag=beta

# Publish latest (production) version
gh workflow run release-npm-manual.yml -f npm_tag=latest -f version_bump=patch
```

### Publishing Options

#### Publish Beta Version

1. Go to **Actions** → **Release NPM Manual** → **Run workflow**
2. Select `beta` from the **NPM tag** dropdown
3. Click **Run workflow**

This creates a version like `0.0.1-beta.1739701234` and tags it as `beta`.

Install:
```bash
npm install @tan-yong-sheng/code-context-core@beta
```

#### Publish Production Version (Latest)

1. Go to **Actions** → **Release NPM Manual** → **Run workflow**
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

You need to configure these secrets in your GitHub repository:

### `NPM_TOKEN`

1. Go to [npmjs.com](https://www.npmjs.com/) → Access Tokens → Generate New Token
2. Select **Publish** scope
3. Copy the token
4. Go to your GitHub repo → Settings → Secrets and variables → Actions
5. Click **New repository secret**
6. Name: `NPM_TOKEN`
7. Value: Your npm token

### `VSCE_PAT` (for VSCode extension)

1. Go to [vscode.dev](https://vscode.dev/) → Manage Extensions → Publisher
2. Create a Personal Access Token
3. Add as secret named `VSCE_PAT`

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

## Best Practices

### Native Module Rebuilding

All workflows that use `better-sqlite3` must rebuild it for the target platform:

```yaml
- name: Rebuild native dependencies
  run: pnpm rebuild better-sqlite3
```

### Path Filters

Some workflows use path filters to avoid unnecessary runs:

```yaml
paths:
  - 'packages/core/src/**'
  - 'packages/mcp/src/**'
```

### Matrix Strategy

For cross-platform testing, use matrix strategy:

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node-version: [20.x, 22.x]
```

---

## Troubleshooting

### E2E Tests Skipped
E2E tests in `tests.yml` are skipped on push events. They only run on pull requests:
```yaml
if: github.event_name == 'pull_request'
```

### Native Module Issues
If `better-sqlite3` fails to load, ensure:
1. The workflow rebuilds the module for the target platform
2. For VSCode extension, use `build-vscode-platforms.yml` for platform-specific builds

### Workflow Not Triggering
Check:
1. Branch name matches trigger (main, master, dev)
2. Path filters match changed files
3. For manual workflows, ensure `workflow_dispatch` is configured

### Publish fails with "You cannot publish over the previously published versions"

This happens when trying to publish the same version twice. The dev and beta workflows include timestamps to avoid this. If it happens:
- For `latest`: Manually bump version in package.json before publishing
- For `dev`/`beta`: Re-run the workflow (new timestamp)

### "npm ERR! 401 Unauthorized - You must be logged in"

The `NPM_TOKEN` secret is not set or is invalid. Check:
1. Secret is named exactly `NPM_TOKEN`
2. Token has "Publish" scope on npm
3. Token is not expired

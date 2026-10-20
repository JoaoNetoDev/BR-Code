# BR Code

<div align="center">
  <img src="public/logo/br-code.png" alt="BR Code" width="128" height="128" />
</div>
<p align="center">
  <a href="README.md">Português (Brasil)</a> | English
</p>

BR Code is an AI coding workbench — a Brazilian adaptation of [ZCode](https://github.com/zai-org/ZCode) by Z.ai — with a desktop app, web interface, and terminal agent. This repository contains the client, backend services, shared UI, and the Agent CLI and runtime source code.

> **Credits:** this project is a fork of [ZCode](https://github.com/zai-org/ZCode), maintained by [Z.ai](https://z.ai) and distributed under the Apache-2.0 license. All credit for the original base belongs to the upstream authors; this fork's adaptations are maintained by the community.

## Updates

- 2026-10-19: synced with ZCode v3.16.2.
- 2026-10-16: synced with ZCode v3.16.1.
- 2026-10-10: synced with ZCode v3.15.1.
- 2026-09-23: synced with ZCode v3.14.3.

## Setup

Install Git, Node.js **24.14.0**, and pnpm **10.33.2**; the reference versions are in [mise.toml](mise.toml). The development and packaging commands below are run from the repository root.

```bash
pnpm bootstrap
```

`pnpm bootstrap` installs the workspace dependencies, prepares the local desktop runtime assets, and runs `build:bootstrap`.

The Agent CLI and runtime source code lives in [apps/zcode-cli/](apps/zcode-cli/) as a regular directory cloned together with the repository — there is no need to pull or initialize a separate Git submodule.

Other setup and build entry points, as needed:

| Command                        | Purpose                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `pnpm install`                 | Install dependencies                                                              |
| `pnpm prepare:desktop-runtime` | Prepare desktop runtime assets, including remote assets by default                |
| `pnpm prepare:remote-assets`   | Prepare remote assets separately                                                  |
| `pnpm bootstrap:with-remote`   | Set up dependencies and local/remote assets and build the packages in sequence; skips the desktop bundle |
| `pnpm build`                   | Recursively run each workspace package's build script, including the asset preparation steps |

By default, `bootstrap` skips remote asset preparation — suitable for local desktop development. When using remote workspaces or validating remote distribution artifacts, run the corresponding preparation command.

## Development and Usage

### Desktop

```bash
pnpm dev:desktop

# Using the test environment
pnpm dev:desktop:test
```

`pnpm dev:desktop` defaults to `pnpm dev:desktop:prod`, using the production service configuration. The startup script prepares the local assets, builds the desktop agent, and then starts Electron and source watching mode.

To use an independent data directory during development, set `ZCODE_DATA_BASE_DIR`. For example, on macOS / Linux:

```bash
ZCODE_DATA_BASE_DIR="$HOME/.zcode-dev-home" pnpm dev:desktop:test
```

### Remote assets (SSH/WSL)

First run `pnpm bootstrap:with-remote` to prepare the remote assets (mock-cdn); then `pnpm dev:desktop`. When connecting to a remote project, select "local download and upload" in the assets. In the development state, assets come from the local `packages/desktop/mock-cdn` and local build artifacts, uploaded via SFTP to the remote host — no CDN access.

### Web Development

When changing the Web or backend code, use development mode:

```bash
pnpm dev:web

# Set the backend workspace (macOS / Linux)
ZCODE_SERVER_WORKSPACE=/path/to/project pnpm dev:web
```

The command starts the Web development server (default `http://localhost:5173`) and the backend (default `http://localhost:3030`); browser access goes to the former. `/ws` and general `/api` requests are proxied to the local backend; `/api/v1/oauth/token` is proxied separately to the configured product service.

After changing agent code, run `pnpm --filter @zcode/cli... build` and restart the service. To validate the complete distribution package, follow the packaging section "BR Code command line" below.

### BR Code command line

The command-line distribution package includes the TUI, Web, and the agent, all started by the `zcode` command: with no arguments it opens the TUI; with `--web` as the first argument it starts the web version; the remaining arguments go to the existing Agent CLI. In both modes everything runs locally, without Electron.

```bash
# Open the interactive interface in the terminal (default)
zcode

# Start the web interface
zcode --web

# Set the project and port without opening the browser
zcode --web --workspace /path/to/project --port 3030 --no-open

# Show the CLI or web mode options
zcode --help
zcode --web --help
```

In web mode, the default working directory is the current one, listening on `127.0.0.1`, with no access token by default, choosing a free port and opening the browser. Open the address shown in the terminal and stop the service with `Ctrl+C`. For LAN access, use `--host 0.0.0.0`; when listening on a non-local address, an access token is generated by default — use the tokenized link shown in the terminal. You can set the token with `--token` or disable authentication with `--no-token`.

When starting the HTTP entry of the general web service directly, API/WebSocket authentication is configured with `ZCODE_SERVER_AUTH_TOKEN`; when creating the service via the programming API, use the `authToken` option.

The build is detailed in the packaging section. `pnpm build:zcode` only generates the distribution package; it does not replace an existing `zcode` on the `PATH`. If the command still points to an old installation, check it with `command -v zcode` (macOS / Linux) or `where.exe zcode` (Windows).

### CLI Source Development

See the [CLI usage guide (Chinese)](apps/zcode-cli/docs/usage/README.md) for model configuration, non-interactive runs, tools and extensions, batch evaluation, and trajectory capture.

To develop the TUI or agent directly, run the entry from the source code:

```bash
pnpm --filter @zcode/cli dev --help
pnpm --filter @zcode/cli dev

# Build the CLI and its workspace dependencies
pnpm --filter @zcode/cli... build
node apps/zcode-cli/packages/cli/dist/zcode.cjs --help
```

This entry runs the Agent CLI directly, without going through the `--web` routing of the distribution package. To develop the web, use `pnpm dev:web`; to validate the unified `zcode` command, use `bin/zcode.mjs` after extracting the package.

### UI Plugin development

See [UI Plugin: capabilities, API, and debugging](UI_PLUGIN.md), starting with the Excalidraw canvas collaboration example, to understand plugin installation/updating, page APIs, and host integration points.

## Configuration

The root [.env.example](.env.example) provides sample service addresses and build configuration; copy it to `.env` as needed, with local overrides in `.env.local`. The desktop development environment is selected with `dev:desktop:test` / `dev:desktop:prod`.

| Setting                              | Purpose                                                        |
| ------------------------------------ | ----------------------------------------------------------------- |
| `ZCODE_DATA_BASE_DIR`                | Base directory for application data; data goes under `.zcode/`    |
| `ZCODE_SERVER_WORKSPACE`             | Workspace path for the web backend                                |
| `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` | Path to a local provider configuration file; without it, the built-in configuration is used |
| `ZCODE_DIST_BASE_URL`                | Download root URL used by the CLI installation script             |

Runtime variables can be set explicitly in the environment of the startup command. The default configuration shipped with the client is in [config/README.md](config/README.md).

## Packaging

Generating third-party notices, the distribution verification process, and where the notices are located in the artifacts: [third-party/README.md](third-party/README.md).

### Desktop

```bash
pnpm bundle:desktop

# Set the target platform and CPU architecture
pnpm bundle:desktop -- --os win --arch x64

pnpm bundle:desktop -- --help
```

The default target is macOS arm64 and the default output directory is `packages/desktop/dist/`. `--os` accepts `mac`, `win`, and `linux`; `--arch` accepts `x64` and `arm64`. Actually packaging and signing requires the tools and configuration of the target platform.

Installation: open the generated DMG and drag BR Code to "Applications". Local builds are not signed; if macOS blocks the first launch, run:

```bash
sudo xattr -rd com.apple.quarantine /Applications/BRCode.app
```

### BR Code command line

The build entry point is `pnpm build:zcode`. The script builds the CLI/TUI, backend, and web in sequence, collects the TUI native libraries, workers, and runtime dependencies, and assembles the distribution package; running it still requires Node.js, at the reference version from `mise.toml`.

Before packaging, you must set the download root URL `ZCODE_DIST_BASE_URL` (in `.env`, `.env.local`, or an environment variable), or pass it via `--base-url`. The addresses below are filling examples — replace them with your actual hosting address when publishing:

```bash
pnpm build:zcode --base-url https://downloads.example.com/brcode/

# With ZCODE_DIST_BASE_URL already configured
pnpm build:zcode

# Only reassembles the package, reusing existing agent, backend, and web builds
pnpm build:zcode --skip-build

# Show the version, output directory, and other options
pnpm build:zcode --help
```

The default version comes from the root `package.json`; the output is in `dist/zcode/`:

- `releases/<version>/zcode-<version>.tar.gz`: runtime package.
- `releases/<version>/sha256.txt`: checksums.
- `latest.json`, `install.sh`: version index and installation script.

The entire directory can be uploaded to the configured download root URL. The installation script downloads the package from there, installs it by default in `~/.zcode/runtime`, and creates the `zcode` command in `~/.local/bin`. The installation directory can be changed with `ZCODE_DIST_HOME` and the command directory with `ZCODE_DIST_BIN_DIR`.

To debug the artifact locally, just extract and run it, with no upload or installation:

```bash
zcode_version=$(node -p "require('./dist/zcode/latest.json').version")
mkdir -p dist/zcode/debug
tar -xzf "dist/zcode/releases/$zcode_version/zcode-$zcode_version.tar.gz" \
  -C dist/zcode/debug
# Start the TUI (default)
node dist/zcode/debug/zcode/bin/zcode.mjs

# Start web mode
node dist/zcode/debug/zcode/bin/zcode.mjs --web \
  --workspace "$PWD" --port 3030 --no-open
```

Open `http://127.0.0.1:3030` in the browser to validate the complete chain: the same backend serving the web pages and the agent. The port must be free; if `pnpm dev:web` is running, use another `--port`.

## Repository Structure

| Directory                                             | Responsibility                                             |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `packages/desktop`                                    | Electron Main, Host, Renderer, and desktop packaging         |
| `packages/web`                                        | Web client                                                   |
| `packages/server`                                     | HTTP / WebSocket services and remote connections             |
| `packages/zcode-server-cli`                           | Standalone server startup and process management             |
| `packages/ui`                                         | Shared React components, hooks, and state (Zustand)          |
| `packages/services`                                   | Business services and persistence                            |
| `packages/shared`, `packages/rpc`, `packages/client`  | Shared protocols and types, RPC framework, agent client SDK  |
| `packages/provider`, `packages/provider-node`         | Common provider capabilities and Node implementation         |
| `apps/zcode-cli`                                      | Agent CLI, TUI, runtime, and tools                           |
| `scripts`, `config`, `third-party`                    | Build scripts, built-in configuration, and third-party materials |

## Project Notice

Feature and offering scope, maintenance rules, execution and data risks, plus third-party license and copyright notes: [NOTICE.md](NOTICE.md).

## License

This project is distributed under the [Apache License 2.0](LICENSE), inherited from upstream ZCode. This fork does **not** send contributions back to the original repository — it is an independent adaptation maintained at [JoaoNetoDev/BR-Code](https://github.com/JoaoNetoDev/BR-Code).

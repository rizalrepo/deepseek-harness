# Run the Desktop app on Linux

English | [中文](linux-desktop.zh.md)

The Desktop app ships official packages for macOS and Windows. Linux is not yet officially packaged, but the app builds and runs from source on x86_64 Linux with a few patches.

This guide produces an unpackaged Electron app with a GNOME/KDE dock icon and a one-command updater.

## Quick Install (One Command)

Run this in your terminal:

```sh
curl -fsSL https://raw.githubusercontent.com/rizalrepo/deepseek-harness/master/install.sh | bash
```

The installer automatically clones the repo, installs dependencies, builds the artifacts and runtime, installs hicolor desktop icons, and registers `dsh-desktop` and `update-dsh-desktop` in `~/.local/bin/`.

To launch:

```sh
dsh-desktop
```

---

## Manual Installation

## Prerequisites

| Tool | Minimum | Notes |
|------|---------|-------|
| Node.js | 24 | `nvm install 24` recommended |
| pnpm | 11.x | `corepack enable && corepack prepare pnpm@latest --activate` |
| Git | 2.x | |
| Electron dependencies | — | `libgtk-3`, `libnss3`, `libatk-bridge2.0`, `libdrm`, `mesa-libgbm` (Fedora: usually preinstalled; Debian/Ubuntu: `sudo apt install libgtk-3-0 libnss3 libatk-bridge2.0-0 libdrm2 libgbm1`) |
| sharp native deps | — | `libvips` (Fedora: `libvips`; Debian/Ubuntu: `libvips-dev`) |

## 1. Clone and build

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
```

### Apply the Linux Desktop patch

The patch adds Linux x64 as a desktop target, sets the app identity for GNOME/KDE integration, and includes a fix for the `platform.deepseek.com` CloudFront WAF blocking non-browser User-Agents.

```sh
git apply patches/linux-desktop.patch
```

### Build

```sh
pnpm run build:artifacts
pnpm --filter @deepseek-ai/dsh-desktop run build
```

### Prepare the Electron runtime

```sh
cd apps/desktop
pnpm run prepare:primary-runtime
cd ../..
```

Set the platform in the generated runtime descriptor:

```sh
node -e '
const fs = require("fs");
const f = "apps/desktop/.desktop-build/development/project/desktop-runtime.json";
if (fs.existsSync(f)) {
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  v.platform = "linux";
  v.arch = "x64";
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
}
'
```

## 2. Generate a transparent icon

The bundled `icon.svg` has a white background suited for macOS/Windows. The render script strips it and recolors the gradient for dark Linux themes, then installs hicolor icons at all standard sizes.

```sh
node scripts/render-linux-icons.mjs
gtk-update-icon-cache -f ~/.local/share/icons/hicolor 2>/dev/null || true
```

## 3. Create a launcher script

Create `~/.local/bin/dsh-desktop`:

```sh
#!/bin/bash
set -e

APP_DIR="$HOME/deepseek-harness/apps/desktop"          # ← adjust to your clone path
ELECTRON="$APP_DIR/node_modules/.bin/electron"
RUNTIME_DIR="$APP_DIR/.desktop-build/targets/linux-x64/runtime/primary-runtime"
USER_DATA="${XDG_CONFIG_HOME:-$HOME/.config}/deepseek-harness-desktop"

export DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
export DSH_DESKTOP_PRIMARY_RUNTIME_DIR="$RUNTIME_DIR"
export DSH_DESKTOP_OPEN_DEVTOOLS="${DSH_DESKTOP_OPEN_DEVTOOLS:-0}"

mkdir -p "$USER_DATA"

exec "$ELECTRON" \
  --class=deepseek-harness \
  --name=deepseek-harness \
  --ozone-platform-hint=auto \
  --user-data-dir="$USER_DATA" \
  "$APP_DIR" "$@"
```

```sh
chmod +x ~/.local/bin/dsh-desktop
```

The `--ozone-platform-hint=auto` flag selects Wayland when available and falls back to X11.

## 4. Add a desktop entry

Create `~/.local/share/applications/deepseek-harness.desktop`:

```ini
[Desktop Entry]
Name=DeepSeek Harness
Comment=AI Agent Harness Desktop Application
Exec=$HOME/.local/bin/dsh-desktop %U
Icon=deepseek-harness
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=deepseek-harness
MimeType=x-scheme-handler/dsh;
```

Replace `$HOME` with your actual home directory path. Refresh the desktop database:

```sh
update-desktop-database ~/.local/share/applications 2>/dev/null || true
```

The app should now appear in your application launcher and can be pinned to the dock.

## In-app updates

The app checks the checkout's GitHub remote (`fork` if present, else `origin`) for new commits on `master` at startup and every 10 minutes. A newer commit shows the Update indicator; **Check for Updates** in the app menu runs the check on demand.

Choosing Update runs in the background: `git merge --ff-only` to the fetched commit, `pnpm install`, `pnpm run build:artifacts`, the desktop build, `prepare:primary-runtime`, and `prepare:dev-project`. When it finishes, **Install and Restart** stops the backend and relaunches the app. Local edits or commits that prevent a fast-forward make the update fail with the git error instead of being overwritten; the running app is unaffected.

## 5. Update script (optional)

Create `~/.local/bin/update-dsh-desktop` to pull upstream changes and rebuild:

```sh
#!/bin/bash
set -e

REPO_DIR="$HOME/deepseek-harness"                      # ← adjust to your clone path

echo "=== 1. Pulling upstream changes ==="
cd "$REPO_DIR"
pkill -TERM -f "electron.*apps/desktop" 2>/dev/null || true
sleep 1
pkill -9 -f "electron.*apps/desktop" 2>/dev/null || true

git checkout HEAD -- apps/ packages/ 2>/dev/null || true
git pull origin master
git apply patches/linux-desktop.patch

echo "=== 2. Installing dependencies ==="
pnpm install

echo "=== 3. Building ==="
pnpm run build:artifacts
pnpm --filter @deepseek-ai/dsh-desktop run build

echo "=== 4. Preparing runtime ==="
cd "$REPO_DIR/apps/desktop"
pnpm run prepare:primary-runtime
cd "$REPO_DIR"

node -e '
const fs = require("fs");
const f = "apps/desktop/.desktop-build/development/project/desktop-runtime.json";
if (fs.existsSync(f)) {
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  v.platform = "linux";
  v.arch = "x64";
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
}
'

echo "=== 5. Rendering icons ==="
node scripts/render-linux-icons.mjs
gtk-update-icon-cache -f ~/.local/share/icons/hicolor 2>/dev/null || true

echo ""
echo "=== Done! Launch with: dsh-desktop ==="
```

```sh
chmod +x ~/.local/bin/update-dsh-desktop
```

## Authentication

DeepSeek Harness supports two authentication methods:

- **API Key**: Enter your [DeepSeek API key](https://platform.deepseek.com/) in Settings → Models.
- **Browser login** (`deepseek-account`): The app opens your default browser for OAuth sign-in. This works out of the box on Linux.

> **Note**: Profile and balance reads from `platform.deepseek.com` may fail on some networks due to CloudFront WAF challenges. The Linux patch includes a workaround (browser User-Agent header) that mitigates this. Chat and model access through `api.deepseek.com` are unaffected.

## Troubleshooting

### "DeepSeek Harness is unavailable" dialog

Check the crash log at `~/.config/deepseek-harness-desktop/logs/crash-*.log`. Common causes:

- **Missing Electron dependencies**: Install the GTK/NSS/GBM libraries listed in Prerequisites.
- **Stale build**: Re-run the build steps or use `update-dsh-desktop`.
- **WAF block on account endpoint**: The patch sets a browser User-Agent, but if you still see `status: 403` or `status: 202` errors for `platform.deepseek.com`, chat will still work — only the account profile/balance sidebar will show as unavailable.

### Wayland warnings

Binding version warnings like `Binding to wl_shm version 1 but version 2 is available` are harmless Chromium/Electron noise and can be ignored.

### Sharp warning

`[SharpElectronLinux] Warning: Binaries provided by Electron for use on Linux may be incompatible with sharp` is a build-time notice. If image operations fail, install system `libvips` and rebuild with `npm rebuild sharp`.

## Known limitations

- Auto-update is source based (see [In-app updates](#in-app-updates)); upstream only ships macOS/Windows installers.
- No `.deb`/`.rpm` packaging: the app runs unpackaged from the source checkout.
- Tray icon may not render on all Linux desktop environments.

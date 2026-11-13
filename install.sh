#!/usr/bin/env bash
# DeepSeek Harness Linux Desktop Installer
# Installs DeepSeek Harness as a native Electron desktop app on Linux.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/rizalrepo/deepseek-harness/master/install.sh | bash
#
# Environment variables:
#   INSTALL_DIR   Target directory (default: $HOME/.local/share/deepseek-harness)
#   BIN_DIR       Binary directory for launcher (default: $HOME/.local/bin)

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${BLUE}==>${NC} $*"; }
ok()    { echo -e "${GREEN}==>${NC} $*"; }
warn()  { echo -e "${YELLOW}WARNING:${NC} $*"; }
error() { echo -e "${RED}ERROR:${NC} $*" >&2; exit 1; }

echo -e "${BLUE}"
echo "  ____                  ____            _      _   _                                "
echo " |  _ \  ___  ___ _ __ / ___|  ___  ___| | __ | | | | __ _ _ __ _ __   ___  ___ ___ "
echo " | | | |/ _ \/ _ \ '_ \\___ \ / _ \/ _ \ |/ / | |_| |/ _\` | '__| '_ \ / _ \/ __/ __|"
echo " | |_| |  __/  __/ |_) |___) |  __/  __/   <  |  _  | (_| | |  | | | |  __/\__ \__ \\"
echo " |____/ \___|\___| .__/|____/ \___|\___|_|\_\ |_| |_|\__,_|_|  |_| |_|\___||___/___/"
echo "                 |_|                          Linux Desktop Native Installer        "
echo -e "${NC}"

# Check architecture
ARCH=$(uname -m)
if [ "$ARCH" != "x86_64" ]; then
  error "Only x86_64 Linux is currently supported. Detected architecture: $ARCH"
fi

# Check Git
command -v git >/dev/null 2>&1 || error "Git is required but not installed. Please install git first."

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
  # Try loading nvm if present
  if [ -s "${HOME}/.nvm/nvm.sh" ]; then
    # shellcheck source=/dev/null
    . "${HOME}/.nvm/nvm.sh"
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  error "Node.js (>=24) is required. Please install Node.js: https://nodejs.org or via nvm."
fi

NODE_MAJOR=$(node -v | sed -E 's/v([0-9]+).*/\1/')
if [ "$NODE_MAJOR" -lt 22 ]; then
  warn "Node.js $NODE_MAJOR detected. Node.js 24 is recommended for best compatibility."
fi

# Check / Install pnpm
if ! command -v pnpm >/dev/null 2>&1; then
  info "pnpm not found. Installing via corepack..."
  if command -v corepack >/dev/null 2>&1; then
    corepack enable || true
    corepack prepare pnpm@latest --activate || true
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    info "Installing pnpm via npm..."
    npm install -g pnpm || error "Failed to install pnpm. Please install it manually: https://pnpm.io/installation"
  fi
fi

# Define paths
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/share/deepseek-harness}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
DESKTOP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
REPO_URL="https://github.com/rizalrepo/deepseek-harness.git"

mkdir -p "$BIN_DIR" "$DESKTOP_DIR"

# Clone or update repository
if [ -d "$INSTALL_DIR/.git" ]; then
  info "Existing installation found at $INSTALL_DIR. Pulling latest changes..."
  cd "$INSTALL_DIR"
  pkill -TERM -f "electron.*apps/desktop" 2>/dev/null || true
  git checkout HEAD -- apps/ packages/ 2>/dev/null || true
  git pull origin master
else
  info "Cloning DeepSeek Harness into $INSTALL_DIR..."
  git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Apply Linux patch if exists and not yet applied
if [ -f "patches/linux-desktop.patch" ]; then
  info "Verifying Linux patches..."
  if ! git apply --check -R patches/linux-desktop.patch >/dev/null 2>&1; then
    git apply -3 patches/linux-desktop.patch || true
  fi
fi

# Install dependencies
info "Installing dependencies with pnpm (this may take a couple minutes)..."
pnpm install

# Build artifacts and desktop shell
info "Building core artifacts..."
pnpm run build:artifacts

info "Building desktop application..."
pnpm --filter @deepseek-ai/dsh-desktop run build

# Prepare primary runtime and development project
info "Preparing primary Electron runtime and development project..."
cd "$INSTALL_DIR/apps/desktop"
pnpm run prepare:primary-runtime
pnpm run prepare:dev-project
cd "$INSTALL_DIR"

# Write platform/arch descriptor
node -e '
const fs = require("fs");
const f = "'"$INSTALL_DIR"'/apps/desktop/.desktop-build/development/project/desktop-runtime.json";
if (fs.existsSync(f)) {
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  v.platform = "linux";
  v.arch = "x64";
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
}
'

# Render hicolor icons
info "Rendering desktop icons..."
if [ -f "scripts/render-linux-icons.mjs" ]; then
  node scripts/render-linux-icons.mjs || true
  gtk-update-icon-cache -f ~/.local/share/icons/hicolor 2>/dev/null || true
fi

# Create launcher script
info "Creating launcher script at $BIN_DIR/dsh-desktop..."
cat << 'EOF' > "$BIN_DIR/dsh-desktop"
#!/usr/bin/env bash
set -e

INSTALL_ROOT="@INSTALL_DIR@"
APP_DIR="$INSTALL_ROOT/apps/desktop"
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
EOF

sed -i "s|@INSTALL_DIR@|$INSTALL_DIR|g" "$BIN_DIR/dsh-desktop"
chmod +x "$BIN_DIR/dsh-desktop"

# Create updater script
info "Creating updater script at $BIN_DIR/update-dsh-desktop..."
cat << 'EOF' > "$BIN_DIR/update-dsh-desktop"
#!/usr/bin/env bash
set -e

REPO_DIR="@INSTALL_DIR@"
echo "=== 1. Pulling latest updates ==="
cd "$REPO_DIR"

pkill -TERM -f "electron.*apps/desktop" 2>/dev/null || true
sleep 1
pkill -9 -f "electron.*apps/desktop" 2>/dev/null || true

git checkout HEAD -- apps/ packages/ 2>/dev/null || true
git pull origin master
if [ -f patches/linux-desktop.patch ]; then
  git apply -3 patches/linux-desktop.patch 2>/dev/null || true
fi

echo "=== 2. Updating dependencies ==="
pnpm install

echo "=== 3. Building artifacts ==="
pnpm run build:artifacts
pnpm --filter @deepseek-ai/dsh-desktop run build

echo "=== 4. Updating runtime ==="
cd "$REPO_DIR/apps/desktop"
pnpm run prepare:primary-runtime
pnpm run prepare:dev-project
cd "$REPO_DIR"

node -e '
const fs = require("fs");
const f = "'"$REPO_DIR"'/apps/desktop/.desktop-build/development/project/desktop-runtime.json";
if (fs.existsSync(f)) {
  const v = JSON.parse(fs.readFileSync(f, "utf8"));
  v.platform = "linux";
  v.arch = "x64";
  fs.writeFileSync(f, JSON.stringify(v, null, 2) + "\n");
}
'

if [ -f scripts/render-linux-icons.mjs ]; then
  node scripts/render-linux-icons.mjs || true
  gtk-update-icon-cache -f ~/.local/share/icons/hicolor 2>/dev/null || true
fi

echo ""
echo "=== DeepSeek Harness Desktop updated successfully! ==="
EOF

sed -i "s|@INSTALL_DIR@|$INSTALL_DIR|g" "$BIN_DIR/update-dsh-desktop"
chmod +x "$BIN_DIR/update-dsh-desktop"

# Create .desktop file
info "Creating desktop entry at $DESKTOP_DIR/deepseek-harness.desktop..."
cat << EOF > "$DESKTOP_DIR/deepseek-harness.desktop"
[Desktop Entry]
Name=DeepSeek Harness
Comment=AI Agent Harness Desktop Application
Exec=$BIN_DIR/dsh-desktop %U
Icon=deepseek-harness
Terminal=false
Type=Application
Categories=Development;Utility;
StartupWMClass=deepseek-harness
MimeType=x-scheme-handler/dsh;
EOF

update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

echo ""
ok "Installation complete!"
echo ""
echo "  Run from terminal : dsh-desktop"
echo "  Update anytime    : update-dsh-desktop"
echo "  Application Menu  : 'DeepSeek Harness' (in GNOME / KDE / XFCE menu)"
echo ""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  warn "$BIN_DIR is not in your PATH. Add it to ~/.bashrc or ~/.zshrc:"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

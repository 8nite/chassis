#!/usr/bin/env bash
set -euo pipefail












RED='\033[0;31m'
GREEN='\033[0;32m'
ORANGE='\033[38;5;214m'
MUTED='\033[0;2m'
NC='\033[0m'

CHASSIS_DIR="${CHASSIS_DIR:-$HOME/.chassis}"
CHASSIS_SRC="${CHASSIS_SRC:-$HOME/.chassis-src}"
FORK_REPO="${FORK_REPO:-https://github.com/claudianus/chassis.git}"
FORK_BRANCH="${FORK_BRANCH:-fix-zhipuai-coding-plan-thinking}"

info()  { echo -e "${MUTED}$*${NC}"; }
warn()  { echo -e "${ORANGE}$*${NC}"; }
err()   { echo -e "${RED}$*${NC}" >&2; }
ok()    { echo -e "${GREEN}$*${NC}"; }

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Error: $1 is required but not installed."
    exit 1
  fi
}

need git
need bun


if [ -d "$CHASSIS_SRC/.git" ]; then
  info "Updating existing source at $CHASSIS_SRC ..."
  git -C "$CHASSIS_SRC" fetch origin "$FORK_BRANCH"
  git -C "$CHASSIS_SRC" checkout "$FORK_BRANCH"
  git -C "$CHASSIS_SRC" reset --hard "origin/$FORK_BRANCH"
else
  info "Cloning fork (shallow) to $CHASSIS_SRC ..."
  git clone --depth 1 --branch "$FORK_BRANCH" "$FORK_REPO" "$CHASSIS_SRC"
fi


PROMPT_FILE="$CHASSIS_SRC/packages/chassis/src/cli/cmd/tui/component/prompt/index.tsx"
if [ ! -f "$PROMPT_FILE" ]; then
  err "Prompt file not found: $PROMPT_FILE"
  exit 1
fi

if grep -q "setTimeout(() => setTimeout" "$PROMPT_FILE"; then
  ok "IME fix already present in source."
else
  warn "IME fix not found. Applying patch ..."

  sed -i 's|onSubmit={submit}|onSubmit={() => {\n                // IME: double-defer so the last composed character (e.g. Korean\n                // hangul) is flushed to plainText before we read it for submission.\n                setTimeout(() => setTimeout(() => submit(), 0), 0)\n              }}|' "$PROMPT_FILE"
  if grep -q "setTimeout(() => setTimeout" "$PROMPT_FILE"; then
    ok "Patch applied."
  else
    err "Failed to apply patch. The source may have changed."
    exit 1
  fi
fi


info "Installing dependencies (this may take a minute) ..."
cd "$CHASSIS_SRC"
bun install --frozen-lockfile 2>/dev/null || bun install


info "Building chassis for current platform ..."
cd "$CHASSIS_SRC/packages/chassis"
bun run build --single


mkdir -p "$CHASSIS_DIR/bin"

PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)
[ "$ARCH" = "aarch64" ] && ARCH="arm64"
[ "$ARCH" = "x86_64" ] && ARCH="x64"
[ "$PLATFORM" = "darwin" ] && true
[ "$PLATFORM" = "linux" ] && true

BUILT_BINARY="$CHASSIS_SRC/packages/chassis/dist/chassis-${PLATFORM}-${ARCH}/bin/chassis"

if [ ! -f "$BUILT_BINARY" ]; then
  BUILT_BINARY=$(find "$CHASSIS_SRC/packages/chassis/dist" -name "chassis" -type f -executable 2>/dev/null | head -1)
fi

if [ -f "$BUILT_BINARY" ]; then
  if [ -f "$CHASSIS_DIR/bin/chassis" ]; then
    cp "$CHASSIS_DIR/bin/chassis" "$CHASSIS_DIR/bin/chassis.bak.$(date +%Y%m%d%H%M%S)"
  fi
  cp "$BUILT_BINARY" "$CHASSIS_DIR/bin/chassis"
  chmod +x "$CHASSIS_DIR/bin/chassis"
  ok "Installed to $CHASSIS_DIR/bin/chassis"
else
  err "Build failed - binary not found in dist/"
  info "Try running manually:"
  echo "  cd $CHASSIS_SRC/packages/chassis && bun run build --single"
  exit 1
fi

echo ""
ok "Done! Korean IME fix is now active."
echo ""
info "To uninstall and revert to the official release:"
echo "  curl -fsSL https:///install | bash"
echo ""
info "To update (re-pull and rebuild):"
echo "  $0"

# Ensure the right Node.js version is on PATH for husky hooks.
#
# Husky hooks run via `sh -e` from a non-interactive environment, so any
# nvm setup that lives in ~/.bashrc / ~/.zshrc is NOT loaded. On systems
# where the distro provides an old `node` binary (e.g. Ubuntu 20.04 ships
# Node 10), the hook would resolve `node` to that obsolete version and
# fail to run modern dev tooling like lint-staged or commitlint.
#
# This script:
#   1. Sources nvm (if installed) so `nvm` and `node` are usable
#   2. Activates Node 24 (matches package.json#engines.node), or nvm's default
#   3. Force-prepends the active Node bin dir to PATH, since some nvm
#      versions skip that step in non-interactive shells
#
# Sourced from .husky/pre-commit and .husky/commit-msg.
# Silently no-ops on machines without nvm, leaving the system Node in place.

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
export NVM_DIR

if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" --no-use

    if nvm ls 24 >/dev/null 2>&1; then
        nvm use 24 >/dev/null 2>&1 || true
    else
        nvm use default >/dev/null 2>&1 || true
    fi

    NVM_VERSION="$(nvm current 2>/dev/null || true)"
    case "$NVM_VERSION" in
        v*)
            NVM_NODE_BIN="$NVM_DIR/versions/node/$NVM_VERSION/bin"
            if [ -d "$NVM_NODE_BIN" ]; then
                case ":$PATH:" in
                    *":$NVM_NODE_BIN:"*) ;;
                    *) export PATH="$NVM_NODE_BIN:$PATH" ;;
                esac
            fi
            ;;
    esac
fi

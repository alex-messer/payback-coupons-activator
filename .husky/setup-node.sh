# Puts nvm's Node 24 on PATH for husky hooks (non-interactive shells skip ~/.bashrc's nvm setup).
# No-ops if nvm isn't installed.

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

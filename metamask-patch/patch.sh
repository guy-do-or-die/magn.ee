#!/bin/bash
# ┌───────────────────────────────────────────────────────────┐
# │  Magnee – MetaMask EIP-7702 Patch Builder                 │
# │                                                           │
# │  Downloads a MetaMask release from GitHub, applies        │
# │  EIP-7702 patches, and produces an unpacked extension     │
# │  ready to load in Chrome/Brave via "Load unpacked".       │
# │                                                           │
# │  Never touches installed extensions.                      │
# └───────────────────────────────────────────────────────────┘
#
# Usage:
#   ./patch.sh                     # use default version (13.16.1)
#   ./patch.sh 13.17.0             # use specific version
#   ./patch.sh /path/to/ext/dir    # patch an existing directory
#
# Output:
#   ./metamask-patched/            # ready to load via chrome://extensions
#
# Requirements: curl, unzip, perl

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT_VERSION="13.16.1"
OUTPUT_DIR="$SCRIPT_DIR/metamask-patched"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

ok()   { echo -e "  ${GREEN}✅${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠️${NC}  $1"; }
fail() { echo -e "  ${RED}❌${NC} $1"; }
info() { echo -e "  ${DIM}$1${NC}"; }

# ── Download ────────────────────────────────────────────────
download_metamask() {
    local version="$1"
    local url="https://github.com/MetaMask/metamask-extension/releases/download/v${version}/metamask-chrome-${version}.zip"
    local zipfile="$SCRIPT_DIR/.cache/metamask-chrome-${version}.zip"

    mkdir -p "$SCRIPT_DIR/.cache"

    if [ -f "$zipfile" ]; then
        info "Using cached: $(basename "$zipfile")"
    else
        echo -e "  ⬇️  Downloading MetaMask v${version}..."
        if ! curl -fSL --progress-bar -o "$zipfile" "$url"; then
            fail "Download failed. Version may not exist."
            fail "Check: https://github.com/MetaMask/metamask-extension/releases"
            rm -f "$zipfile"
            return 1
        fi
        ok "Downloaded $(du -h "$zipfile" | cut -f1)"
    fi

    rm -rf "$OUTPUT_DIR"
    mkdir -p "$OUTPUT_DIR"
    unzip -q "$zipfile" -d "$OUTPUT_DIR"
    ok "Extracted to $(basename "$OUTPUT_DIR")/"
}

# ── Guard patching ──────────────────────────────────────────

# Find which JS file contains a string (fixed or regex)
find_guard_file() {
    local dir="$1" search="$2" mode="${3:-fixed}"
    if [ "$mode" = "regex" ]; then
        grep -rlP "$search" "$dir"/*.js 2>/dev/null | head -1
    else
        grep -rlF "$search" "$dir"/*.js 2>/dev/null | head -1
    fi
}

# Try multiple fixed-string find/replace pairs
try_guard() {
    local dir="$1" num="$2" desc="$3"
    shift 3

    echo -e "${BOLD}Guard $num:${NC} $desc"

    while [ $# -ge 2 ]; do
        local find="$1" replace="$2"
        shift 2

        local file
        file=$(find_guard_file "$dir" "$find" "fixed")

        if [ -n "$file" ]; then
            perl -pi -e "s/\Q${find}\E/${replace}/" "$file"
            if ! grep -qF "$find" "$file"; then
                ok "Patched ($(basename "$file"))"
                return 0
            fi
        fi

        # Check if already patched
        if grep -rqF "$replace" "$dir"/*.js 2>/dev/null; then
            ok "Already patched"
            return 0
        fi
    done

    warn "Guard not found"
    return 1
}

# Apply a regex-based guard patch across all JS files
# The regex should have a capture group structure that allows replacement
try_guard_regex() {
    local dir="$1" num="$2" desc="$3" regex="$4" replace="$5" already="$6"

    echo -e "${BOLD}Guard $num:${NC} $desc"

    # Check if already patched
    if grep -rqF "$already" "$dir"/*.js 2>/dev/null; then
        ok "Already patched"
        return 0
    fi

    local file
    file=$(find_guard_file "$dir" "$regex" "regex")

    if [ -n "$file" ]; then
        perl -pi -e "s/${regex}/${replace}/" "$file"
        # Verify the patch took
        if grep -rqF "$already" "$dir"/*.js 2>/dev/null; then
            ok "Patched ($(basename "$file"))"
            return 0
        else
            fail "Replacement did not produce expected result"
            return 1
        fi
    fi

    warn "Guard not found"
    return 1
}

apply_patches() {
    local dir="$1"
    local total=0 passed=0

    echo ""
    echo -e "${BOLD}Applying patches...${NC}"
    echo ""

    # ── Guard 1: External EIP-7702 transaction block ────────
    # @metamask/transaction-controller: validateTransactionOrigin()
    # Blocks dapp-initiated type 0x04 transactions
    total=$((total + 1))
    if try_guard "$dir" 1 "External EIP-7702 transaction block" \
        'External EIP-7702 transactions are not supported' \
        'MAGNEE_PATCHED: EIP-7702 allowed from dapps'; then
        passed=$((passed + 1))
    fi

    # ── Guard 2: External signature block ───────────────────
    # Blocks eth_signTypedData_v4 with verifyingContract matching EOA
    # String varies between builds
    total=$((total + 1))
    if try_guard "$dir" 2 "External signature verifyingContract block" \
        'External signature requests for contracts are not supported' \
        'MAGNEE_PATCHED: contract signatures allowed' \
        'External signature requests cannot use internal accounts as the verifying contract.' \
        'MAGNEE_PATCHED: contract signatures allowed from dapps.'; then
        passed=$((passed + 1))
    fi

    # ── Guard 3: Envelope type validation ───────────────────
    # Bug: "0x04" !== "0x4" string comparison in TransactionEnvelopeType enum
    # Pattern: if(VAR&&!Object.values(VAR.TransactionEnvelopeType).includes(VAR))throw
    # Variable names change per build (e, n, t, etc.)
    total=$((total + 1))
    if try_guard_regex "$dir" 3 \
        "Envelope type validation (0x04 vs 0x4)" \
        'if\((\w+)&&!Object\.values\((\w+)\.TransactionEnvelopeType\)\.includes\(\1\)\)throw' \
        'if(false&&!Object.values($2.TransactionEnvelopeType).includes($1))throw' \
        'if(false&&!Object.values('; then
        passed=$((passed + 1))
    fi

    # ── Guard 4: authorizationList + envelope type ──────────
    # Bug: "0x04" !== "0x4" when checking authorizationList requires setCode
    # Pattern: VAR&&VAR!==VAR.TransactionEnvelopeType.setCode
    total=$((total + 1))
    if try_guard_regex "$dir" 4 \
        "authorizationList + envelope type (0x04 vs 0x4)" \
        '(\w+)&&\1!==(\w+)\.TransactionEnvelopeType\.setCode' \
        'false&&$1!==$2.TransactionEnvelopeType.setCode' \
        'false&&'; then
        passed=$((passed + 1))
    fi

    # ── Guard 5: maxFeePerGas + envelope type ───────────────
    # Bug: "0x04" not in ["0x2","0x4"] due to leading zero
    # Pattern: if(VAR&&!VAR.includes(VAR))throw
    # This is too generic — use a context-aware regex near "maxFeePerGas"
    total=$((total + 1))
    if try_guard_regex "$dir" 5 \
        "maxFeePerGas + envelope type (0x04 vs 0x4)" \
        'if\((\w+)&&!(\w+)\.includes\(\1\)\)throw' \
        'if(false&&!$2.includes($1))throw' \
        'if(false&&!'; then
        passed=$((passed + 1))
    fi

    # ── Guard 6: EIP-7702 batch gas estimation fallback ────────
    # When wallet_sendCalls batched tx simulation fails, MetaMask falls back
    # to blockGasLimit (huge value like 7881 ETH). Patch: after simulation
    # failure for type-4 txs (A=isUpgradeWithDataToSelf), use 3M gas limit
    # and clear simulationFails flag so MetaMask allows confirmation.
    # Pattern: (0,n.log)("Estimation failed",{...k,fallback:P})
    # Add: if(A){I="0x300000";k=void 0}  (clear simulation fail + set 3M gas)
    total=$((total + 1))
    if try_guard "$dir" 6 "EIP-7702 batch gas estimation fallback" \
        '"Estimation failed",{...k,fallback:P})' \
        '"Estimation failed",{...k,fallback:P});if(A){I="0x300000";k=void 0}'; then
        passed=$((passed + 1))
    fi

    # ── Summary ─────────────────────────────────────────────
    echo ""
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
    if [ "$passed" -eq "$total" ]; then
        echo -e "  ${GREEN}${BOLD}✅ All $passed/$total guards patched!${NC}"
    else
        echo -e "  ${YELLOW}${BOLD}⚠️  $passed/$total guards patched${NC}"
    fi
    echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"

    return $(( total - passed ))
}

# ── Main ────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}${CYAN}  🧲 Magnee – MetaMask EIP-7702 Patch Builder${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

case "${1:-}" in
    --help|-h)
        echo "Usage:"
        echo "  $0                     Download + patch MetaMask v$DEFAULT_VERSION"
        echo "  $0 <version>           Download + patch specific version"
        echo "  $0 <dir>               Patch an existing unpacked extension"
        echo ""
        echo "Output: $OUTPUT_DIR/"
        echo ""
        echo "Load in browser:"
        echo "  1. chrome://extensions → Developer Mode"
        echo "  2. Load unpacked → select output directory"
        exit 0
        ;;
    "")
        echo -e "${BOLD}Step 1:${NC} Download MetaMask v$DEFAULT_VERSION"
        download_metamask "$DEFAULT_VERSION"
        echo ""
        echo -e "${BOLD}Step 2:${NC} Apply EIP-7702 patches"
        apply_patches "$OUTPUT_DIR" || true
        ;;
    *)
        if [ -d "$1" ]; then
            OUTPUT_DIR="$1"
            echo -e "${BOLD}Source:${NC} $1"
            echo ""
            apply_patches "$OUTPUT_DIR" || true
        else
            VERSION="$1"
            echo -e "${BOLD}Step 1:${NC} Download MetaMask v$VERSION"
            download_metamask "$VERSION"
            echo ""
            echo -e "${BOLD}Step 2:${NC} Apply EIP-7702 patches"
            apply_patches "$OUTPUT_DIR" || true
        fi
        ;;
esac

echo ""
echo -e "${BOLD}📂 Output:${NC} $OUTPUT_DIR/"
echo ""
echo "Load in browser:"
echo "  1. chrome://extensions → enable Developer Mode"
echo "  2. Load unpacked → $OUTPUT_DIR"
echo ""

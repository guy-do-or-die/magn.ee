# MetaMask EIP-7702 Patch Builder

> Downloads MetaMask from GitHub, patches it for EIP-7702 delegation, and produces a standalone unpacked extension. **Never touches installed extensions.**

## Quick Start

```bash
./patch.sh            # download + patch MetaMask v13.16.1
./patch.sh 13.17.0    # use a different version
```

Then load in browser:
1. Go to `chrome://extensions` → enable **Developer Mode**
2. Click **Load unpacked** → select the `metamask-patched/` directory
3. Pin the patched MetaMask and use it alongside or instead of the store version

## Why

MetaMask blocks dapp-initiated EIP-7702 (`setCode`) transactions with **5 guards**. Three are bugs (`"0x04" !== "0x4"` string comparison), two are intentional blocks.

## Guards Patched

| # | Description | Root Cause |
|---|-------------|------------|
| 1 | `External EIP-7702 transactions are not supported` | Intentional block |
| 2 | `External signature requests ... not supported` | Intentional block |
| 3 | `Invalid transaction envelope type: "0x04"` | `"0x04" !== "0x4"` bug |
| 4 | `authorizationList requires type: "0x4"` | Same bug |
| 5 | `maxFeePerGas requires type: "0x2, 0x4"` | Same bug |

## How It Works

1. Downloads official Chrome build from [GitHub Releases](https://github.com/MetaMask/metamask-extension/releases)
2. Extracts to `metamask-patched/`
3. Auto-detects which JS file contains each guard (`find_guard_file`)
4. Guards 1–2: fixed-string replacement (error messages)
5. Guards 3–5: regex with perl backreferences (handles minified variable name changes)
6. Downloads cached in `.cache/` — re-runs don't re-download

## Tested

| Version | Guards | Notes |
|---------|--------|-------|
| v13.15.0 | 5/5 ✅ | Guard 2 in `common-3.js` |
| v13.16.1 | 5/5 ✅ | Guard 1 in `common-5.js` |
| v13.17.0 | 5/5 ✅ | Guard 1 moved to `common-6.js` |

## Requirements

`curl`, `unzip`, `perl`

> [!WARNING]
> This disables security checks. Use for development only. MetaMask may enable EIP-7702 natively in a future release.

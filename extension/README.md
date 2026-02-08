# extension

Chrome extension that intercepts payable transactions on any dapp and offers to pay from a different chain/token via Li.Fi bridging and EIP-7702 delegation.

## Architecture

```
content script → injects providerWrapper.ts into page
                       ↓
              wraps window.ethereum (+ EIP-6963 providers)
                       ↓
              intercepts eth_sendTransaction with value > 0
                       ↓
              opens popup UI → user picks source chain/token
                       ↓
              Li.Fi SDK quotes bridge + contract call
                       ↓
              executes via wallet_sendCalls (EIP-5792)
              or EIP-7702 batch with delegate contract
```

### Key modules

| Module | Path | Purpose |
|--------|------|---------|
| Provider wrapper | `src/injected/providerWrapper.ts` | Wraps `window.ethereum`, intercepts payable txs |
| Li.Fi integration | `src/lib/lifi.ts` | SDK init, quoting, route execution, status |
| EIP-7702 utils | `src/lib/eip7702.ts` | Batch encoding, authorization building |
| Wallet bridge | `src/lib/walletBridge.ts` | RPC relay through service worker to dapp tab |
| Settings | `src/lib/settings/` | User prefs with ENS + chrome.storage |
| Token balances | `src/lib/tokenBalances.ts` | Fetches balances via Li.Fi SDK, cached |
| Popup UI | `src/ui/` | React intercept popup + settings page |

### Chain State Isolation

The Li.Fi SDK transport overrides `eth_chainId` and `wallet_switchEthereumChain` to track chain state independently from the dapp. This prevents "chain wars" where dapps (e.g. Aave) fight back against Magnee's chain switches.

## Stack

Vite, React, TypeScript, Tailwind CSS, `@lifi/sdk`, `viem`, `wagmi`

## Development

```bash
bun install
bun run watch    # dev build with HMR
bun run build    # production build
bun test         # run tests
```

Load `dist/` as unpacked extension in `chrome://extensions`.
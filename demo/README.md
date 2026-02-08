# demo

Test dapp for developing and validating the Magnee extension.

## Features

- Wallet connect (wagmi/viem)
- Send ETH transactions (triggers Magnee interception)
- EIP-7702 delegation management (delegate/revoke per chain)
- On-chain delegation status checking via `getCode`
- Magnee extension detection

## Usage

```bash
bun run dev   # starts Vite dev server
```

Open in a browser with the Magnee extension loaded. The dapp sends payable transactions that Magnee intercepts.

## Stack

Vite, React, TypeScript, wagmi

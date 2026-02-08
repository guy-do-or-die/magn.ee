# contracts

EIP-7702 delegate account contract — deployed once per chain, EOAs delegate to it.

## MagneeDelegateAccount.sol

Enables batched execution while preserving `msg.sender` as the user's EOA address.

**Access control:**

| Function | Caller | Use case |
|----------|--------|----------|
| `execute(Call[])` | EOA only (`msg.sender == address(this)`) | Same-chain batching via `wallet_sendCalls` |
| `executeSingle(...)` | EOA only | Gas-optimized single call |
| `executeWithSignature(...)` | Anyone (sig-verified) | Cross-chain via Li.Fi bridge executors |

`executeWithSignature` uses EIP-712 typed data to verify the EOA owner authorized the execution — the caller is a bridge executor, not the EOA.

## PayableDemo.sol

Simple test contract for development (accepts ETH payments).

## Stack

- Solidity 0.8.33, Foundry
- Deployed on: Base, Optimism, Arbitrum

## Commands

```bash
# from repo root
bun run test:contracts     # forge test
bun run delegate:deploy    # deploy delegate to chain
bun run verify:chain       # verify on etherscan
```

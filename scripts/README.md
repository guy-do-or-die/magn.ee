# scripts

CLI utilities for debugging and operations.

## tx-trace.ts

Trace a Magnee transaction across chains from the command line. Decodes source tx, queries Li.Fi bridge status, fetches destination receipt, and prints a full execution timeline.

```bash
bun run tx-trace <tx-hash> [--chain <id>] [--dest <id>]
```

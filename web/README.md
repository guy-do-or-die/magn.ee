# web

Public-facing website — landing page and transaction explorer.

## Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Home` | Landing page with features, download CTA |
| `/explorer` | `Explorer` | Cross-chain transaction tracer |

### Transaction Explorer

Traces Magnee transactions end-to-end across chains:

1. Decodes source chain tx (bridge call, approval, delegation)
2. Queries Li.Fi status API for bridge delivery
3. Fetches destination chain receipt and decoded logs
4. Shows execution timeline with event breakdown

## Stack

Vite, React, TypeScript, Tailwind CSS, shadcn/ui, wagmi, viem

## Development

```bash
bun run dev    # Vite dev server
bun run build  # production build (deployed to Vercel)
```

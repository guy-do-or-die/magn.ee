# @magnee/ui

Shared React component library used by both the extension and the web app.

## Components

- `accordion.tsx` — Collapsible sections (Radix)
- `button.tsx` — Button with variants (CVA)
- `card.tsx` — Card container
- `select.tsx` — Select dropdown (Radix)
- `switch.tsx` — Toggle switch (Radix)

## Assets

- `logo.tsx` — Inline SVG logo (no static asset dependency)

## Usage

```tsx
import { Button } from '@magnee/ui/components/button'
import { MagneeLogo } from '@magnee/ui/assets/logo'
```

## Peer Dependencies

React 18+, Radix UI, CVA, Tailwind Merge, Lucide React

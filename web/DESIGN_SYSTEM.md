# Magnee Design System — Web ↔ Extension Unification

## Shared Tokens (HSL CSS Variables)

Both the extension (`extension/src/ui/global.css`) and the web app (`web/src/index.css`) use the same shadcn-compatible HSL CSS variable structure:

| Token | Extension | Web App | Notes |
|-------|-----------|---------|-------|
| `--primary` | `262.1 83.3% 57.8%` | `263 70% 58%` | Very close — slightly adjusted for web readability |
| `--background` (dark) | `222.2 84% 4.9%` | `0 0% 3.9%` | Web uses pure dark, ext uses navy tint |
| `--foreground` (dark) | `210 40% 98%` | `0 0% 98%` | Both near-white |
| `--border` | `217.2 32.6% 17.5%` | `0 0% 14.9%` | Neutral vs slightly blue-tinted |

### Dark mode strategy
- **Extension**: Uses `.dark` class (toggled via `next-themes` / content scripts)
- **Web App**: Uses `.dark` / `.light` classes (default dark, toggled via custom ThemeProvider with localStorage)

## Components
Both use shadcn/ui components (`button`, `card`, `badge`, `separator`) with CVA + clsx + tailwind-merge.

## Future Unification
To fully unify, extract tokens into a shared `@magnee/tokens` package and import in both apps.

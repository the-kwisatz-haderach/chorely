# CSS Modules and two-layer design tokens

The web app is styled with CSS Modules plus one global `tokens.css` of CSS custom properties. Interactive primitives are built on native elements (`<dialog>` and the Popover API), each wrapped once. We chose this over Tailwind, CSS-in-JS and component kits because plain CSS needs no runtime or build plugin, works with React Server Components unchanged, and keeps the accessible roles and names that the Playwright journeys select by in our own markup. The trade-off is that we write and own a small set of primitives instead of adopting a kit's.

## Token layers

`apps/web/src/ui/tokens.css` has two layers:

1. **Palette** (`--palette-*`): raw colour values. Used only inside `tokens.css`.
2. **Semantic** (`--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-primary`, `--color-on-primary`, `--color-danger`, `--color-border`, `--color-focus`, plus `--shadow-1` and `--shadow-2`): what components use. The dark theme redefines only this layer, under `prefers-color-scheme: dark`. There is no manual theme toggle.

Beside the layers are the shared scales: a 4px spacing scale (`--space-*`), radii 8/12/16 plus fully rounded (`--radius-sm|md|lg|full`) and a 5-step type scale (`--font-size-1` to `--font-size-5`) on the system font stack. `--font-size-input` (16px) is for text inputs and selects, because iOS Safari zooms into anything smaller on focus. Fixed sizes sit beside them: `--target-min` (44px), `--fab-size`, and the focus ring's `--focus-ring-width` and `--focus-ring-offset`, which any custom focus indicator reuses. Lengths in CSS Modules come from these tokens. The only raw lengths are 1px hairline borders, the visually-hidden technique and `letter-spacing` in `em`, which scales with the text it tracks.

The light theme is the prototype palette (`prototype/queue-screen`): a cream background, deep green primary and red danger. The prototype's muted grey failed contrast, so it is darkened. The dark theme keeps the same character: a pine-tinted near-black, the same green fill, a lighter red and an amber focus ring.

`--color-primary` is a fill, under `--color-on-primary` text. The only place it is a text colour is on a `--color-on-primary` fill, such as the Queue's white Complete button, which is the same pair inverted. It is never text on `--color-bg` or `--color-surface`, because the green fails as text on the dark background. On a `--color-primary` fill, such as the Next-up hero, everything is `--color-on-primary`: muted text and danger red both fail contrast on the green, so the hero's Overdue keeps its icon and word but drops the red. Inverted surfaces such as the toast use `--color-text` as the background and `--color-bg` as the text, which reuses the text/background pair.

## Checked contrast pairs (WCAG 2.2 AA)

Text needs 4.5:1. The focus ring is a non-text indicator and needs 3:1 against everything it can sit on. `--color-border` is decorative and is not used as the only boundary that identifies a control.

| Pair | Light | Dark |
| --- | --- | --- |
| `text` on `bg` (and inverted, toast) | 14.10 | 14.70 |
| `text` on `surface` | 15.91 | 12.90 |
| `text-muted` on `bg` | 5.99 | 7.95 |
| `text-muted` on `surface` | 6.76 | 6.98 |
| `on-primary` on `primary` | 5.99 | 5.99 |
| `primary` on `on-primary` (Complete button) | 5.99 | 5.99 |
| `danger` on `bg` | 5.79 | 8.00 |
| `danger` on `surface` | 6.54 | 7.02 |
| `focus` against `bg` | 16.33 | 10.83 |
| `focus` against `surface` | 18.42 | 9.51 |
| `focus` against `primary` | 3.08 | 3.68 |

Re-check this table when a palette value or a semantic mapping changes, and add a row for any new pair.

## Where things live

- `apps/web/src/ui/`: `tokens.css`, `base.css` (the reset, the `:focus-visible` ring, 44px minimum touch targets, `prefers-reduced-motion` turning motion off, and the single centred column of about 480px) and the shared primitives: Button (primary, secondary, outline, ghost, danger and inverse, in a regular or small size), Dialog (`<dialog>`), Sheet (bottom sheet on `<dialog>`), Menu (Popover API, items optionally led by an icon), SegmentedControl (a radio group in one row), Toast, EmptyState, ErrorBanner, Loading (a muted "Loading…" shown only after about 300 ms) and VisuallyHidden. Each primitive has its own CSS Module. `buttonClassName` gives a link a Button's look. `outline` takes its colour from its surroundings, so it works on any surface. `inverse` is for buttons on a `--color-primary` surface. A small Button keeps a full `--target-min` touch target through an invisible `::after`. `cx` joins class names when a primitive adds a caller's class to its own.
- `apps/web/src/app/`: screens. A screen's styles go in a CSS Module beside it (`queue.tsx` and `queue.module.css`). The app shell's top bar (`top-bar.tsx`) shows the Group name and icon links to `/groups/{groupId}/done` and `/groups/{groupId}/settings`; the Queue at `/` is the home screen. The Queue's add sheet hands off to a full-page add screen at `/groups/{groupId}/chores/new` ("More options"), beside the edit screen at `/groups/{groupId}/chores/{choreId}/edit`. The screens before the Queue (sign-in, code, Display name, first run and the Invite landing) are one centred card under the text wordmark, from `entry.tsx` and `entry.module.css`. The Group screen (`group-settings.tsx`) is one card per section (Group name, Members, Invite link, Account), and the Done list (`done-list.tsx`) is one card of rows.
- Icons come from `lucide-react`. The viewport uses `viewport-fit=cover`, and anything pinned to an edge pads by `env(safe-area-inset-*)`.

## Consequences

- ESLint bans the JSX `style` prop in `apps/web/src`. Stylelint bans hex colours, named colours, colour functions and `var(--palette-*)` outside `tokens.css`. Both run in `pnpm lint`, which PR CI runs. Rule tests are in `tooling/styling-lint.test.ts`.
- Spreading a `style` object into JSX gets past the ESLint rule, so props helpers must not return one. The only imperative style writes are custom properties for values known only at runtime, such as the Menu's position.
- Primitives use semantic tokens only, so a new theme or a palette change touches only `tokens.css`.
- Styling never renames accessible roles or names: Playwright selects by them, and there are no screenshot tests. Each UI PR carries light- and dark-mode screenshots for human review instead.

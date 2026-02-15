

## Production-Ready UI Overhaul

Phased execution plan aligned with architectural stability. No phase mixing -- each phase completes before the next begins.

---

### Phase 1 -- Core Brand and Visual System

Lock the foundation before touching any components.

**Step 1: Brand System**

- Product name: **TradeFlow** (institutional tone, no crypto hype)
- Create `public/favicon.svg` -- minimal geometric brand mark (stylized chart pulse / flow line)
- Create `src/components/BrandLogo.tsx` -- reusable inline SVG component, scalable, two sizes (compact for header, large for auth)
- Update `index.html`:
  - `<title>TradeFlow - Algorithmic Trading Platform</title>`
  - Favicon reference to `/favicon.svg`
  - Updated OG meta tags with new brand name

**Step 2: Design Tokens**

Update `src/index.css` with refined palette (all values per your specification):

| Token | Current | New |
|-------|---------|-----|
| Primary | `189 85% 52%` | `192 72% 46%` |
| Background | `222 47% 11%` | `222 38% 9%` |
| Card | `217 33% 14%` | `222 30% 13%` |
| Border | `217 33% 20%` | `220 20% 18%` |
| Muted foreground | `215 20% 65%` | `215 12% 62%` |
| Warning | `38 92% 50%` | `38 85% 55%` |

Add CSS custom properties for subtle card effects:
- `--card-glow`: top border gradient at 15% primary opacity
- `--shadow-card`: refined `shadow-lg shadow-black/30`
- Skeleton animation keyframe (pulsing brand logo)

No changes to `tailwind.config.ts` beyond adding a `glass` utility if needed for `backdrop-blur-sm` shorthand.

---

### Phase 2 -- Information Architecture

**Step 3: Shared Header Component**

Create `src/components/AppHeader.tsx` -- single header used by ALL pages:

- Left: BrandLogo + "TradeFlow" text
- Center/Right: Labeled navigation links using `NavLink` component:
  - Dashboard (`/`)
  - Performance (`/performance`)
  - Symbols (`/symbols`)
  - Health (`/health`)
  - Settings (`/settings`)
- Active state: underline + soft background fill (not capsule pills -- institutional tone)
- Right edge: connection status dot + user avatar dropdown
- Bottom: 1px divider with low-opacity primary glow for depth
- Mobile: nav items collapse into a hamburger that opens a Sheet/Drawer with full navigation

Files modified:
- `src/components/DashboardHeader.tsx` -- replaced by `AppHeader.tsx` (or refactored in place)
- `src/pages/Index.tsx` -- use shared header, remove inline icon buttons (lines 54-83)
- `src/pages/Health.tsx` -- replace custom back-button header with shared `AppHeader`
- `src/pages/Performance.tsx` -- replace custom back-button header with shared `AppHeader`
- `src/pages/Settings.tsx` -- replace custom back-button header with shared `AppHeader`
- `src/pages/Symbols.tsx` -- replace custom back-button header with shared `AppHeader`

Every page gets the same persistent navigation. No page feels secondary. Consistency equals trust.

**Step 4: Summary Card Styling**

Refine the existing `SignalsOverview` summary cards and all metric cards across Dashboard:
- `backdrop-blur-sm` with semi-transparent background
- Subtle gradient top border (primary at 15% opacity, 1px)
- Shadow: `shadow-lg shadow-black/30`
- Hover: slight elevation shift for interactive cards
- Keep glass subtle -- avoid SaaS template appearance

---

### Phase 3 -- UX Professionalization

**Step 5: Tab Styling**

Update tab indicators across all pages (Dashboard main tabs, Settings tabs, Performance tabs, Positions sub-tabs):
- Style: underline + soft background fill on active state (not full capsule pills)
- Smooth transition on state change
- Mobile scroll indicator gradient retained

Implementation in `src/index.css` via scoped styles on `[data-state=active]` selectors.

**Step 6: Loading States**

Replace all loading fallbacks with proper skeletons:

- `src/App.tsx` `PageFallback`: Replace "Loading..." text with pulsing BrandLogo icon centered on screen
- `src/pages/Index.tsx` `TabFallback`: Already uses `Skeleton` -- keep as is
- `src/pages/Symbols.tsx`: Replace `Loader2` spinner with BrandLogo pulse
- `src/pages/Performance.tsx`: Replace "Loading performance data..." with skeleton cards matching the 4-stat grid + chart placeholder

**Step 7: Auth Page Polish**

Update `src/pages/Auth.tsx`:
- Replace `TrendingUp` icon with `BrandLogo` component (large variant)
- Title: "TradeFlow"
- Tagline: "Professional Algorithmic Trading"
- Background: slow animated CSS gradient (15-20s loop), defined in `src/index.css`
- Clean input spacing improvements
- No particles, no heavy animation

---

### Phase 4 -- Consistency and System Integrity

**Step 8: Shared Header Verification**

After all pages use `AppHeader`, verify:
- Active route highlighting works on every page
- Mobile hamburger menu opens and navigates correctly
- User avatar dropdown and sign-out work from every page
- Connection status indicator visible on desktop

**Step 9: Optional Footer**

Add lightweight `src/components/AppFooter.tsx`:
- Muted text, small font
- Content: `v1.0.0 -- Powered by TradeFlow`
- Shown on sub-pages (Health, Performance, Settings, Symbols)
- No marketing copy

---

### Technical Summary

**Files to create:**
- `public/favicon.svg`
- `src/components/BrandLogo.tsx`
- `src/components/AppHeader.tsx`
- `src/components/AppFooter.tsx` (optional)

**Files to modify:**
- `index.html` -- favicon, title, OG tags
- `src/index.css` -- design tokens, card effects, tab styles, auth gradient animation, skeleton keyframes
- `src/App.tsx` -- branded loading fallback
- `src/pages/Index.tsx` -- use AppHeader, remove icon nav buttons
- `src/pages/Health.tsx` -- use AppHeader
- `src/pages/Performance.tsx` -- use AppHeader, skeleton loading
- `src/pages/Settings.tsx` -- use AppHeader
- `src/pages/Symbols.tsx` -- use AppHeader, branded loading
- `src/pages/Auth.tsx` -- brand logo, tagline, animated background
- `src/components/SignalsOverview.tsx` -- card glass styling
- `src/components/DashboardHeader.tsx` -- may be deprecated or merged into AppHeader

**No database changes. No new dependencies.**


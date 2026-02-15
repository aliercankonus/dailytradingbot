

# Mobile-Friendly Dashboard Overhaul

## Problems Identified

Looking at the app on a 390px mobile screen, I found these issues:

1. **Tab navigation is unreadable** -- 7 tabs ("Dashboard", "Signals", "Positions", "History", "Analytics", "Risk", "Monitor") are crammed into one row. Text overlaps and gets cut off.

2. **Dashboard grid stacks poorly** -- BotStatus, PortfolioMetrics, and TodayPerformanceWidget are in a `lg:grid-cols-4` layout that drops to single column, making BotStatus take full width unnecessarily while PortfolioMetrics metrics values appear cramped.

3. **PortfolioMetrics values overlap labels** -- The `grid-cols-2 md:grid-cols-3` grid with `text-2xl` values causes labels and numbers to collide on narrow screens.

4. **Trade History table overflows** -- A 10-column table (Pair, Strategy, Type, Entry, Exit, Stop Loss, Take Profit, Quantity, P&L, Status) requires horizontal scrolling that's hard to use on mobile.

5. **Header icons overlap the title** -- Navigation icons (Performance, Symbols, Settings) crowd against "Daily Trading Bot" text.

6. **"Close All Trades" button floats awkwardly** -- Positioned with `flex justify-end`, it sits alone occupying full width.

## Solution

### 1. Scrollable Tab Navigation

Replace the `grid-cols-7` TabsList with a horizontally scrollable strip on mobile:
- Use `flex overflow-x-auto` instead of `grid` on small screens
- Each tab gets a minimum width so text doesn't truncate
- Use shorter labels on mobile: "Dash", "Sigs", "Pos", "Hist", "Risk", "Mon"
- Keep grid layout on `md:` and above

### 2. Mobile-Optimized Dashboard Grid (Index.tsx)

- Stack BotStatus, PortfolioMetrics, and TodayPerformanceWidget vertically on mobile (already single-col, but reorder so BotStatus is compact)
- Move "Close All Trades" button into the header area on mobile to save vertical space

### 3. PortfolioMetrics Responsive Layout

- Use `grid-cols-2` on mobile with smaller text: `text-lg` instead of `text-2xl` for values
- Truncate long labels on very small screens
- Reduce padding from `p-6` to `p-4` on mobile

### 4. Trade History: Card View on Mobile

- Below `md:` breakpoint, render trades as stacked cards instead of a table
- Each card shows: Symbol, Side badge, Entry/Exit prices, P&L
- Hide less critical columns (Stop Loss, Take Profit, Quantity) behind a tap-to-expand

### 5. Header Compact Layout

- On mobile, shrink the logo and hide the subtitle "Algorithmic Trading System"
- Navigation icons stay but tighter spacing

### 6. LivePriceCard Compact Mode

- Already looks reasonable but tighten padding on mobile

## Technical Details

### Files to modify:

1. **`src/pages/Index.tsx`**
   - Change TabsList from `grid grid-cols-7` to `flex overflow-x-auto scrollbar-hide` on mobile, `md:grid md:grid-cols-7` on desktop
   - Add shorter mobile tab labels
   - Move CloseAllTradesButton positioning

2. **`src/components/PortfolioMetrics.tsx`**
   - Change value font size: `text-lg sm:text-2xl`
   - Reduce card padding: `p-4 sm:p-6`

3. **`src/components/TradeHistory.tsx`**
   - Add a mobile card view that renders below `md:` breakpoint
   - Keep existing table for desktop behind `hidden md:block`
   - Mobile cards show key fields only

4. **`src/components/DashboardHeader.tsx`**
   - Hide subtitle on mobile: `hidden sm:block` on the description paragraph
   - Reduce logo size on mobile

5. **`src/index.css`**
   - Add `scrollbar-hide` utility class for the tab strip

6. **`src/components/BotStatus.tsx`**
   - Reduce padding on mobile for tighter layout

No new dependencies required. All changes use existing Tailwind responsive prefixes (`sm:`, `md:`, `lg:`).


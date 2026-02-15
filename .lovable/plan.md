

# Fix Mobile Layout Issues: Signal Rejections, Closed Positions & Main Tabs

## Problems Found

### 1. Signal Rejection Reasons -- No Mobile Layout (Critical)
The `SignalRejectionReasons.tsx` component renders a 5-6 column `<Table>` (Symbol, Rejection Reason, Signal Diagnostics, Details, AI Analysis, Checked) with no mobile alternative. This causes severe horizontal overflow and left-right scrolling on mobile.

### 2. Closed Positions History -- Overflow in Stats/Distribution Grids
While the positions table already has a mobile card view, the **Closure Distribution** section uses `grid-cols-2 md:grid-cols-4 lg:grid-cols-7` with `text-2xl` numbers and long labels that cause overflow. The **Summary Stats** cards with `text-3xl` values also overflow on narrow screens. The pagination "Previous/Next" buttons crowd against the page text.

### 3. Main Tab Strip -- Labels Still Hard to Read
The main TabsList has `flex overflow-x-auto scrollbar-hide` and short labels, but the `min-w-[4.5rem]` / `min-w-[3rem]` values may cause tabs to appear cramped. The scroll indicator is invisible so users don't realize they can scroll.

---

## Solution

### 1. Signal Rejection Reasons: Mobile Card View
- Add a `md:hidden` card layout that renders each rejection as a stacked card showing: Symbol + Severity badge, Rejection Reason badge, and Checked time
- Hide the diagnostics/details columns on mobile (they're too complex) -- show them behind a tap-to-expand collapsible
- Keep the existing `<Table>` behind `hidden md:block`

### 2. Closed Positions: Tighten Mobile Layout
- Reduce Summary Stats card title from `text-3xl` to `text-xl sm:text-3xl`
- Reduce Closure Distribution from `text-2xl` to `text-lg sm:text-2xl` and label from `text-sm` to `text-xs sm:text-sm`
- Simplify pagination on mobile: hide "Previous"/"Next" text, show only chevron icons

### 3. Main Tabs: Improve Visibility
- Slightly increase `min-w` on the tab triggers so text doesn't appear squished
- Add a subtle gradient fade on the right edge of the tab strip to hint at scrollability

---

## Technical Details

### Files to modify:

1. **`src/components/SignalRejectionReasons.tsx`** (lines ~8421-8553)
   - Wrap existing `<Table>` in `hidden md:block`
   - Add a `md:hidden` section above it that maps rejections to stacked cards
   - Each card: symbol + severity badge on top row, rejection reason badge below, checked time at bottom
   - Add a `<Collapsible>` for diagnostics detail per card

2. **`src/components/ClosedPositionsDashboard.tsx`**
   - Lines ~376-422: Change `text-3xl` to `text-xl sm:text-3xl` on summary stat CardTitles
   - Lines ~431-461: Change closure distribution `text-2xl` to `text-lg sm:text-2xl`, and label `text-sm` to `text-xs sm:text-sm`
   - Lines ~586-616: On mobile, simplify pagination to icon-only buttons

3. **`src/pages/Index.tsx`** (line 87)
   - Adjust `min-w` values on tab triggers for better readability
   - Wrap TabsList in a container with a right-edge gradient overlay on mobile to hint scrollability

4. **`src/index.css`**
   - Add a `.tab-scroll-hint` utility with a pseudo-element gradient fade on the right side

No new dependencies required. All changes use existing Tailwind responsive prefixes.


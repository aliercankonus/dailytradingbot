

## Problem

The top-level navigation tabs use **controlled state** (`value={activeTab}, onValueChange={setActiveTab}`), but all nested sub-tabs (Positions, Analytics, Risk, Monitor) use **uncontrolled state** (`defaultValue="active"`). This creates two issues:

1. **Sub-tab state resets** when you navigate away from a parent tab and come back -- your selected sub-tab reverts to the default.
2. **Potential click conflicts** between the two nested `Tabs` components sharing similar Radix context.

## Solution

Convert all nested sub-tabs to controlled state by adding dedicated state variables for each.

## Technical Details

**File: `src/pages/Index.tsx`**

1. Add state variables for each nested tab group:
   - `const [positionsSubTab, setPositionsSubTab] = useState("active");`
   - `const [analyticsSubTab, setAnalyticsSubTab] = useState("performance");`
   - `const [riskSubTab, setRiskSubTab] = useState("sizing");`
   - `const [monitorSubTab, setMonitorSubTab] = useState("momentum");`

2. Replace `defaultValue` with `value` and `onValueChange` on all four nested `<Tabs>` components:
   - Positions: `<Tabs value={positionsSubTab} onValueChange={setPositionsSubTab}>`
   - Analytics: `<Tabs value={analyticsSubTab} onValueChange={setAnalyticsSubTab}>`
   - Risk: `<Tabs value={riskSubTab} onValueChange={setRiskSubTab}>`
   - Monitor: `<Tabs value={monitorSubTab} onValueChange={setMonitorSubTab}>`

This ensures React owns all tab state, preventing resets and eliminating conflicts between parent and child tab scopes.


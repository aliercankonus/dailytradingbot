

## Plan: Health Page with Error Details and WebSocket Monitor

### Problem Analysis
The WebSocket Connection Monitor shows "13 errors" but there's no way to see error details because:
- The `WebSocketMonitorContext` only stores a counter (`errorCount`) and the last error string (`lastError`)
- No error history/log is maintained
- These errors are normal WebSocket reconnection events from the price feed and market data streams

### What Will Be Built

#### 1. Add Error History to WebSocket Monitor Context
Extend `WebSocketMonitorContext` to store a rolling log of the last 50 errors per connection, each with:
- Timestamp
- Error message
- Connection name

This enables the "click to see details" feature.

#### 2. Clickable Error Count with Details Dialog
In `WebSocketHealthDashboard`, make the error count clickable. Clicking it opens a Dialog showing:
- Chronological list of errors with timestamps
- Which connection produced each error
- A "Clear" button to reset the log

#### 3. New Health Page (`/health`)
Create a dedicated `/health` route with comprehensive system health info:

**Section 1 — System Status Overview**
- Bot heartbeat status (last heartbeat time, current no-trade state, symbols scanned, rejections logged)
- Health state history from `bot_health_state` table (OPERATIONAL_CONCERN, EXTREME_OVERBOUGHT, MIXED_BLOCK events with durations and resolution times)

**Section 2 — WebSocket Connection Monitor**
- Move `WebSocketHealthDashboard` from the Monitor tab to this page
- Includes the new clickable error details

**Section 3 — Heartbeat Timeline**
- Recent heartbeat entries showing scanner activity over time
- Visual indicator of no-trade state transitions

**Section 4 — Health Alerts History**
- Past health state entries from `bot_health_state` showing when alerts were triggered and resolved

#### 4. Navigation Update
- Add a Health icon button in the header (next to Performance, Symbols, Settings)
- Remove `WebSocketHealthDashboard` from the Monitor tab in Index.tsx

### Technical Details

**Files to create:**
- `src/pages/Health.tsx` — New health page with all sections
- `src/hooks/useBotHealth.ts` — Hook to fetch `bot_heartbeat` and `bot_health_state` data

**Files to modify:**
- `src/contexts/WebSocketMonitorContext.tsx` — Add `errorLog` array to each connection's metrics, and expose it; add `clearErrors` method
- `src/components/WebSocketHealthDashboard.tsx` — Make error count clickable, show Dialog with error history
- `src/pages/Index.tsx` — Remove `WebSocketHealthDashboard` from Monitor tab, add Health nav button in header
- `src/App.tsx` — Add `/health` route (lazy loaded, protected)

**Data sources:**
- `bot_heartbeat` table: `recorded_at`, `no_trade_state`, `symbols_scanned`, `signals_generated`, `rejections_logged`, `details`
- `bot_health_state` table: `state`, `state_type`, `started_at`, `resolved_at`, `alert_sent`, `details`
- `WebSocketMonitorContext`: live connection metrics + new error log


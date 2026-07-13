# Quality Score Decomposition (Phase 2)

**Status:** ACTIVE — quality gate now emits interpretable sub-scores.
**File:** `supabase/functions/_shared/quality-score.ts`
**Consumer:** `supabase/functions/_shared/gate-pipeline.ts` (GATE 5).

## Purpose
Replace the opaque `qualityScore` (0-100 aggregate) with three named sub-scores so
rejections say WHICH dimension failed instead of "VERY_LOW_QUALITY".

## Sub-Scores (each 0-100)

| Sub-Score | Components (raw)      | Meaning                                       |
| --------- | --------------------- | --------------------------------------------- |
| entryQ    | momentum + technical  | Entry timing / oscillator quality             |
| trendQ    | adx + alignment       | Trend structural strength + HTF agreement     |
| contextQ  | volume + confidence   | Market context validity (participation)       |

Normalization: `sum(components) / sum(caps) * 100`, clamped [0, 100].

## Sizing Model
- Each floor breach → multiply position by `0.75`.
- All three ≥ 70 → multiply by `1.10` (all-strong bonus).
- Final range: 0.30 – 1.15x.

## Default Floors (0-100)
- entryQ ≥ 25
- trendQ ≥ 25
- contextQ ≥ 15

## Strategy-Specific Floors
Applied AFTER strategy classification (extra soft penalty of `0.80` on breach):

| Strategy            | entryQ | trendQ | contextQ |
| ------------------- | ------ | ------ | -------- |
| STRONG_TREND        | 35     | 40     | 15       |
| SQUEEZE_BREAKOUT    | 30     | 20     | 20       |
| TREND_CONTINUATION  | 30     | 25     | 15       |
| MEAN_REVERSION      | 25     | 15     | 20       |

## Hard Block Unchanged
`VERY_LOW_QUALITY` (aggregate < 35) still hard-blocks. Sub-scores drive only
soft sizing to preserve backwards behaviour.

## GateResult Extensions
```ts
GateResult {
  ...existing,
  entryQ?: number;
  trendQ?: number;
  contextQ?: number;
  breachedFloors?: string[];  // e.g. ['entryQ','contextQ']
}
```

## Log Format
```
✅ GATE PASS: BTCUSDT LONG | strategy=STRONG_TREND | ADX=32.1 slope=0.85 | K=42.3 | mom=17 | Q=68(e75/t80/c40) | pos=85%
⚠️ QUALITY SUB-SCORE: ETHUSDT SHORT | sub-score floor breach: entryQ=18 < 25 → sizing x0.75
⚠️ STRATEGY FLOOR (STRONG_TREND): trendQ=32 < 40 → extra x0.80
```

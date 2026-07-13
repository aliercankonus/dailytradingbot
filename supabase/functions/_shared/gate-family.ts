// ============= GATE FAMILY CLASSIFIER =============
// Maps a rejection_reason string to a coarse family bucket for analytics.
// Keep in sync with SQL function `public.classify_gate_family`.

export type GateFamily =
  | 'QUALITY'
  | 'ADX'
  | 'STOCH'
  | 'DIRECTION'
  | 'MOMENTUM'
  | 'REGIME'
  | 'STRATEGY'
  | 'PORTFOLIO'
  | 'EXECUTION'
  | 'ERROR'
  | 'OTHER';

export function classifyGateFamily(reason: string | null | undefined): GateFamily {
  if (!reason) return 'OTHER';
  const r = reason.toUpperCase();

  if (r.startsWith('ANALYZER_ERROR')) return 'ERROR';
  if (r.startsWith('EXECUTION')) return 'EXECUTION';
  if (r.includes('QUALITY') || r.includes('VERY_LOW_QUALITY') || r.includes('LOW_QUALITY')) return 'QUALITY';
  if (r.startsWith('NO_DIRECTION') || r.includes('DIRECTION')) return 'DIRECTION';
  if (r.includes('ADX') || r.includes('NO_ENERGY') || r.includes('DECAY')) return 'ADX';
  if (r.includes('STOCH') || r.includes('OVERBOUGHT') || r.includes('OVERSOLD') || r.includes('EXTREME')) return 'STOCH';
  if (r.includes('MOMENTUM')) return 'MOMENTUM';
  if (r.includes('RANGE_COMPRESSION') || r.includes('EXPANSION') || r.includes('EXHAUSTION') || r.includes('REGIME')) return 'REGIME';
  if (r.includes('PORTFOLIO') || r.includes('DAILY_LIMIT') || r.includes('POSITION_LIMIT') || r.includes('CORRELATION') || r.includes('DAILY_LOSS')) return 'PORTFOLIO';
  if (r.startsWith('SQUEEZE') || r.startsWith('STRONG_TREND') || r.startsWith('TC_') || r.startsWith('BTC_') || r.startsWith('ST_') || r.startsWith('MR_')) return 'STRATEGY';

  return 'OTHER';
}

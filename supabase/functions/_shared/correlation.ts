// Correlation analysis for portfolio risk management

interface CorrelationResult {
  symbol1: string;
  symbol2: string;
  correlation: number;
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  direction: 'positive' | 'negative';
}

interface PositionCorrelationCheck {
  canOpen: boolean;
  reason: string;
  correlatedPositions: Array<{
    symbol: string;
    correlation: number;
    side: string;
  }>;
  riskScore: number; // 0-100, higher = more correlated risk
}

// Known crypto correlations (empirically derived)
const KNOWN_CORRELATIONS: Record<string, Record<string, number>> = {
  'BTCUSDT': {
    'ETHUSDT': 0.85,
    'BNBUSDT': 0.78,
    'SOLUSDT': 0.82,
    'ADAUSDT': 0.75,
    'XRPUSDT': 0.70,
    'DOGEUSDT': 0.72,
    'DOTUSDT': 0.80,
    'MATICUSDT': 0.77,
    'AVAXUSDT': 0.81,
  },
  'ETHUSDT': {
    'BTCUSDT': 0.85,
    'BNBUSDT': 0.75,
    'SOLUSDT': 0.88,
    'ADAUSDT': 0.72,
    'XRPUSDT': 0.65,
    'DOGEUSDT': 0.68,
    'DOTUSDT': 0.83,
    'MATICUSDT': 0.85,
    'AVAXUSDT': 0.86,
  },
  'SOLUSDT': {
    'BTCUSDT': 0.82,
    'ETHUSDT': 0.88,
    'AVAXUSDT': 0.90,
    'MATICUSDT': 0.84,
    'DOTUSDT': 0.82,
  },
  'AVAXUSDT': {
    'BTCUSDT': 0.81,
    'ETHUSDT': 0.86,
    'SOLUSDT': 0.90,
    'MATICUSDT': 0.85,
  },
  'MATICUSDT': {
    'BTCUSDT': 0.77,
    'ETHUSDT': 0.85,
    'SOLUSDT': 0.84,
    'AVAXUSDT': 0.85,
  },
};

// Calculate correlation between two price series using Pearson correlation
export function calculatePearsonCorrelation(prices1: number[], prices2: number[]): number {
  if (prices1.length !== prices2.length || prices1.length < 10) {
    return 0;
  }

  const n = prices1.length;
  
  // Calculate returns (percent changes)
  const returns1: number[] = [];
  const returns2: number[] = [];
  
  for (let i = 1; i < n; i++) {
    returns1.push((prices1[i] - prices1[i-1]) / prices1[i-1]);
    returns2.push((prices2[i] - prices2[i-1]) / prices2[i-1]);
  }

  const mean1 = returns1.reduce((a, b) => a + b, 0) / returns1.length;
  const mean2 = returns2.reduce((a, b) => a + b, 0) / returns2.length;

  let numerator = 0;
  let sum1Sq = 0;
  let sum2Sq = 0;

  for (let i = 0; i < returns1.length; i++) {
    const diff1 = returns1[i] - mean1;
    const diff2 = returns2[i] - mean2;
    numerator += diff1 * diff2;
    sum1Sq += diff1 * diff1;
    sum2Sq += diff2 * diff2;
  }

  const denominator = Math.sqrt(sum1Sq * sum2Sq);
  if (denominator === 0) return 0;

  return numerator / denominator;
}

// Get correlation strength classification
function getCorrelationStrength(correlation: number): 'strong' | 'moderate' | 'weak' | 'none' {
  const absCorr = Math.abs(correlation);
  if (absCorr >= 0.7) return 'strong';
  if (absCorr >= 0.5) return 'moderate';
  if (absCorr >= 0.3) return 'weak';
  return 'none';
}

// Get known correlation between two symbols
export function getKnownCorrelation(symbol1: string, symbol2: string): number {
  if (symbol1 === symbol2) return 1.0;
  
  // Check direct mapping
  if (KNOWN_CORRELATIONS[symbol1]?.[symbol2] !== undefined) {
    return KNOWN_CORRELATIONS[symbol1][symbol2];
  }
  
  // Check reverse mapping
  if (KNOWN_CORRELATIONS[symbol2]?.[symbol1] !== undefined) {
    return KNOWN_CORRELATIONS[symbol2][symbol1];
  }
  
  // Default moderate correlation for unknown pairs
  return 0.6;
}

// Analyze correlation between two symbols
export function analyzeCorrelation(
  symbol1: string,
  symbol2: string,
  prices1?: number[],
  prices2?: number[]
): CorrelationResult {
  let correlation: number;
  
  // Use calculated correlation if price data available, otherwise use known correlations
  if (prices1 && prices2 && prices1.length >= 20 && prices2.length >= 20) {
    correlation = calculatePearsonCorrelation(prices1, prices2);
  } else {
    correlation = getKnownCorrelation(symbol1, symbol2);
  }

  return {
    symbol1,
    symbol2,
    correlation,
    strength: getCorrelationStrength(correlation),
    direction: correlation >= 0 ? 'positive' : 'negative',
  };
}

// Check if a new position would increase correlated risk
export function checkPositionCorrelation(
  newSymbol: string,
  newSide: 'long' | 'short',
  activePositions: Array<{ symbol: string; side: string; quantity: number; entry_price: number }>,
  maxCorrelationThreshold: number = 0.75,
  maxCorrelatedPositions: number = 2
): PositionCorrelationCheck {
  const correlatedPositions: Array<{ symbol: string; correlation: number; side: string }> = [];
  let totalCorrelatedRisk = 0;
  
  for (const position of activePositions) {
    if (position.symbol === newSymbol) continue;
    
    const correlation = getKnownCorrelation(newSymbol, position.symbol);
    const positionSide = position.side === 'buy' ? 'long' : 'short';
    
    // Check if positions are in the same direction with high correlation
    const sameDirection = positionSide === newSide;
    const effectiveCorrelation = sameDirection ? correlation : -correlation;
    
    if (Math.abs(correlation) >= 0.5) {
      correlatedPositions.push({
        symbol: position.symbol,
        correlation,
        side: positionSide,
      });
      
      // Risk increases when:
      // 1. Same direction on positively correlated assets (both go up/down together)
      // 2. Opposite direction on negatively correlated assets
      if (effectiveCorrelation > 0) {
        totalCorrelatedRisk += effectiveCorrelation * 100;
      }
    }
  }

  const avgRisk = correlatedPositions.length > 0 
    ? totalCorrelatedRisk / correlatedPositions.length 
    : 0;

  // Count strongly correlated same-direction positions
  const stronglyCorrelatedSameDir = correlatedPositions.filter(p => {
    const sameDir = p.side === newSide;
    return p.correlation >= maxCorrelationThreshold && sameDir;
  });

  // Determine if we should block this position
  let canOpen = true;
  let reason = '';

  if (stronglyCorrelatedSameDir.length >= maxCorrelatedPositions) {
    canOpen = false;
    reason = `Too many correlated positions (${stronglyCorrelatedSameDir.length}) in same direction. ` +
      `Symbols: ${stronglyCorrelatedSameDir.map(p => `${p.symbol} (${(p.correlation * 100).toFixed(0)}%)`).join(', ')}`;
  } else if (avgRisk > 70) {
    canOpen = false;
    reason = `High correlation risk score (${avgRisk.toFixed(0)}). Consider diversifying.`;
  }

  return {
    canOpen,
    reason,
    correlatedPositions,
    riskScore: Math.min(100, avgRisk),
  };
}

// Calculate portfolio correlation matrix
export function calculatePortfolioCorrelationMatrix(
  symbols: string[],
  priceData?: Record<string, number[]>
): Record<string, Record<string, number>> {
  const matrix: Record<string, Record<string, number>> = {};

  for (const symbol1 of symbols) {
    matrix[symbol1] = {};
    for (const symbol2 of symbols) {
      if (symbol1 === symbol2) {
        matrix[symbol1][symbol2] = 1.0;
      } else if (priceData?.[symbol1] && priceData?.[symbol2]) {
        matrix[symbol1][symbol2] = calculatePearsonCorrelation(
          priceData[symbol1],
          priceData[symbol2]
        );
      } else {
        matrix[symbol1][symbol2] = getKnownCorrelation(symbol1, symbol2);
      }
    }
  }

  return matrix;
}

// Get correlation-adjusted position size
export function getCorrelationAdjustedSize(
  baseSize: number,
  correlationRiskScore: number
): number {
  // Reduce position size based on correlation risk
  // 0% risk = 100% size, 100% risk = 50% size
  const reductionFactor = 1 - (correlationRiskScore / 200);
  return baseSize * Math.max(0.5, reductionFactor);
}

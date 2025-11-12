export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'momentum' | 'reversal' | 'trend' | 'breakout';
  entry_conditions: Array<{
    indicator: string;
    operator: string;
    value: string;
  }>;
  exit_conditions: Array<{
    indicator: string;
    operator: string;
    value: string;
  }>;
  indicators: Array<{
    type: string;
    name: string;
    period?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalPeriod?: number;
  }>;
  risk_settings: {
    stopLossPercent: number;
    takeProfitPercent: number;
    positionSizePercent: number;
  };
}

export const strategyTemplates: StrategyTemplate[] = [
  {
    id: 'rsi-oversold',
    name: 'RSI Oversold/Overbought',
    description: 'Buy when RSI drops below 30 (oversold), sell when RSI rises above 70 (overbought). Classic mean reversion strategy.',
    category: 'reversal',
    entry_conditions: [
      { indicator: 'RSI', operator: 'below', value: '30' }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'above', value: '70' }
    ],
    indicators: [
      { type: 'RSI', name: 'RSI', period: 14 }
    ],
    risk_settings: {
      stopLossPercent: 3,
      takeProfitPercent: 6,
      positionSizePercent: 2
    }
  },
  {
    id: 'macd-crossover',
    name: 'MACD Crossover',
    description: 'Enter when MACD line crosses above signal line, exit when it crosses below. Popular momentum indicator.',
    category: 'momentum',
    entry_conditions: [
      { indicator: 'MACD', operator: 'above', value: '0' }
    ],
    exit_conditions: [
      { indicator: 'MACD', operator: 'below', value: '0' }
    ],
    indicators: [
      { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    ],
    risk_settings: {
      stopLossPercent: 2,
      takeProfitPercent: 4,
      positionSizePercent: 1.5
    }
  },
  {
    id: 'ema-crossover',
    name: 'EMA Crossover',
    description: 'Buy when fast EMA (12) crosses above slow EMA (26), sell on reverse crossover. Trend following strategy.',
    category: 'trend',
    entry_conditions: [
      { indicator: 'EMA_Fast', operator: 'above', value: '0' }
    ],
    exit_conditions: [
      { indicator: 'EMA_Fast', operator: 'below', value: '0' }
    ],
    indicators: [
      { type: 'EMA', name: 'EMA_Fast', period: 12 },
      { type: 'EMA', name: 'EMA_Slow', period: 26 }
    ],
    risk_settings: {
      stopLossPercent: 2.5,
      takeProfitPercent: 5,
      positionSizePercent: 2
    }
  },
  {
    id: 'momentum-breakout',
    name: 'Momentum Breakout',
    description: 'Enter when RSI is strong (>50) and MACD is positive. Ride momentum until RSI weakens.',
    category: 'momentum',
    entry_conditions: [
      { indicator: 'RSI', operator: 'above', value: '50' },
      { indicator: 'MACD', operator: 'above', value: '0' }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'below', value: '40' }
    ],
    indicators: [
      { type: 'RSI', name: 'RSI', period: 14 },
      { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    ],
    risk_settings: {
      stopLossPercent: 3,
      takeProfitPercent: 6,
      positionSizePercent: 1.5
    }
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion',
    description: 'Buy extreme dips (RSI < 25) and sell when price returns to normal levels (RSI > 50). Conservative approach.',
    category: 'reversal',
    entry_conditions: [
      { indicator: 'RSI', operator: 'below', value: '25' }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'above', value: '50' }
    ],
    indicators: [
      { type: 'RSI', name: 'RSI', period: 14 },
      { type: 'EMA', name: 'EMA', period: 20 }
    ],
    risk_settings: {
      stopLossPercent: 4,
      takeProfitPercent: 8,
      positionSizePercent: 2.5
    }
  },
  {
    id: 'trend-following',
    name: 'Strong Trend Following',
    description: 'Enter when price is above EMA and RSI confirms strength. Exit when trend weakens.',
    category: 'trend',
    entry_conditions: [
      { indicator: 'EMA', operator: 'below', value: '0' },
      { indicator: 'RSI', operator: 'above', value: '55' }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'below', value: '45' }
    ],
    indicators: [
      { type: 'EMA', name: 'EMA', period: 20 },
      { type: 'RSI', name: 'RSI', period: 14 }
    ],
    risk_settings: {
      stopLossPercent: 2,
      takeProfitPercent: 5,
      positionSizePercent: 2
    }
  },
  {
    id: 'conservative-swing',
    name: 'Conservative Swing',
    description: 'Low-risk strategy with tight stops. Enter on moderate oversold (RSI < 35), exit at neutral (RSI > 55).',
    category: 'reversal',
    entry_conditions: [
      { indicator: 'RSI', operator: 'below', value: '35' }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'above', value: '55' }
    ],
    indicators: [
      { type: 'RSI', name: 'RSI', period: 14 }
    ],
    risk_settings: {
      stopLossPercent: 1.5,
      takeProfitPercent: 3,
      positionSizePercent: 1
    }
  },
  {
    id: 'aggressive-momentum',
    name: 'Aggressive Momentum',
    description: 'High-risk, high-reward. Enter on strong momentum signals, wider stops for volatility.',
    category: 'momentum',
    entry_conditions: [
      { indicator: 'RSI', operator: 'above', value: '60' },
      { indicator: 'MACD', operator: 'above', value: '0' }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'below', value: '50' }
    ],
    indicators: [
      { type: 'RSI', name: 'RSI', period: 14 },
      { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    ],
    risk_settings: {
      stopLossPercent: 5,
      takeProfitPercent: 10,
      positionSizePercent: 3
    }
  }
];
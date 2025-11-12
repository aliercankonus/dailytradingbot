export interface StrategyTemplate {
  id: string;
  name: string;
  description: string;
  category: 'momentum' | 'reversal' | 'trend' | 'breakout';
  entry_conditions: Array<{
    indicator: string;
    operator: string;
    value: string;
    compareToIndicator?: boolean;
    targetIndicator?: string;
  }>;
  exit_conditions: Array<{
    indicator: string;
    operator: string;
    value: string;
    compareToIndicator?: boolean;
    targetIndicator?: string;
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
      { indicator: 'RSI', operator: 'below', value: '30', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'above', value: '70', compareToIndicator: false }
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
    description: 'Enter when MACD line crosses above zero (bullish crossover), exit when MACD crosses below zero. Classic momentum strategy.',
    category: 'momentum',
    entry_conditions: [
      { indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'MACD', operator: 'below', value: '0', compareToIndicator: false }
    ],
    indicators: [
      { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      { type: 'RSI', name: 'RSI', period: 14 }
    ],
    risk_settings: {
      stopLossPercent: 2,
      takeProfitPercent: 4,
      positionSizePercent: 1.5
    }
  },
  {
    id: 'ema-crossover',
    name: 'EMA Golden Cross',
    description: 'Enter when fast EMA crosses above slow EMA (golden cross), exit when fast EMA crosses below (death cross). Trend following.',
    category: 'trend',
    entry_conditions: [
      { indicator: 'EMA_Fast', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }
    ],
    exit_conditions: [
      { indicator: 'EMA_Fast', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }
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
      { indicator: 'RSI', operator: 'above', value: '50', compareToIndicator: false },
      { indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'below', value: '40', compareToIndicator: false }
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
      { indicator: 'RSI', operator: 'below', value: '25', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'above', value: '50', compareToIndicator: false }
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
      { indicator: 'EMA', operator: 'below', value: '0', compareToIndicator: false },
      { indicator: 'RSI', operator: 'above', value: '55', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'below', value: '45', compareToIndicator: false }
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
      { indicator: 'RSI', operator: 'below', value: '35', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'above', value: '55', compareToIndicator: false }
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
      { indicator: 'RSI', operator: 'above', value: '60', compareToIndicator: false },
      { indicator: 'MACD', operator: 'above', value: '0', compareToIndicator: false }
    ],
    exit_conditions: [
      { indicator: 'RSI', operator: 'below', value: '50', compareToIndicator: false }
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
  },
  {
    id: 'ema-death-cross',
    name: 'EMA Death Cross',
    description: 'Short when fast EMA crosses below slow EMA (death cross), cover when fast EMA crosses back above. Bearish trend following.',
    category: 'trend',
    entry_conditions: [
      { indicator: 'EMA_Fast', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }
    ],
    exit_conditions: [
      { indicator: 'EMA_Fast', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'EMA_Slow' }
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
    id: 'macd-signal-cross',
    name: 'MACD Signal Cross',
    description: 'Enter when MACD crosses above signal line (bullish), exit when MACD crosses below signal. Momentum crossover strategy.',
    category: 'momentum',
    entry_conditions: [
      { indicator: 'MACD', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'MACD_Signal' }
    ],
    exit_conditions: [
      { indicator: 'MACD', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'MACD_Signal' }
    ],
    indicators: [
      { type: 'MACD', name: 'MACD', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      { type: 'MACD_Signal', name: 'MACD_Signal', fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }
    ],
    risk_settings: {
      stopLossPercent: 2,
      takeProfitPercent: 4,
      positionSizePercent: 1.5
    }
  },
  {
    id: 'bollinger-breakout',
    name: 'Bollinger Band Breakout',
    description: 'Enter when price breaks above upper Bollinger Band (strong momentum), exit when price crosses below middle band.',
    category: 'breakout',
    entry_conditions: [
      { indicator: 'Price', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'BB_Upper' }
    ],
    exit_conditions: [
      { indicator: 'Price', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'BB_Middle' }
    ],
    indicators: [
      { type: 'BB', name: 'BB_Upper', period: 20 },
      { type: 'BB', name: 'BB_Middle', period: 20 },
      { type: 'BB', name: 'BB_Lower', period: 20 }
    ],
    risk_settings: {
      stopLossPercent: 3,
      takeProfitPercent: 6,
      positionSizePercent: 2
    }
  },
  {
    id: 'bollinger-reversal',
    name: 'Bollinger Band Reversal',
    description: 'Buy when price touches lower Bollinger Band (oversold), sell when price reaches upper band. Mean reversion strategy.',
    category: 'reversal',
    entry_conditions: [
      { indicator: 'Price', operator: 'below', value: '', compareToIndicator: true, targetIndicator: 'BB_Lower' }
    ],
    exit_conditions: [
      { indicator: 'Price', operator: 'above', value: '', compareToIndicator: true, targetIndicator: 'BB_Upper' }
    ],
    indicators: [
      { type: 'BB', name: 'BB_Upper', period: 20 },
      { type: 'BB', name: 'BB_Middle', period: 20 },
      { type: 'BB', name: 'BB_Lower', period: 20 }
    ],
    risk_settings: {
      stopLossPercent: 2.5,
      takeProfitPercent: 5,
      positionSizePercent: 2
    }
  }
];
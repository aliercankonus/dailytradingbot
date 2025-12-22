// ============= SHARED BINANCE UTILITIES =============
// Centralized helpers for Binance API interactions
// Used by: execute-trade, close-trade, monitor-positions

import { createLogger } from "./logging.ts";

const logger = createLogger('binance-utils');

// ============= SYMBOL FILTERS & PRECISION =============

export interface SymbolFilters {
  tickSize: number;      // Price precision (e.g., 0.01 for BTCUSDT)
  stepSize: number;      // Quantity precision (e.g., 0.00001 for BTCUSDT)
  minQty: number;        // Minimum quantity
  maxQty: number;        // Maximum quantity
  minNotional: number;   // Minimum order value in USDT
  pricePrecision: number; // Number of decimal places for price
  quantityPrecision: number; // Number of decimal places for quantity
}

// Cache for exchange info to avoid repeated API calls
const symbolFiltersCache = new Map<string, { filters: SymbolFilters; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetch symbol trading rules from Binance exchange info
 * Results are cached for 5 minutes to reduce API calls
 */
export async function getSymbolFilters(symbol: string): Promise<SymbolFilters> {
  const now = Date.now();
  const cached = symbolFiltersCache.get(symbol);
  
  // Return cached if still valid
  if (cached && cached.expiry > now) {
    return cached.filters;
  }

  try {
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch exchange info: ${response.status}`);
    }

    const data = await response.json();
    const symbolInfo = data.symbols?.[0];
    
    if (!symbolInfo) {
      throw new Error(`Symbol ${symbol} not found in exchange info`);
    }

    const filters: SymbolFilters = {
      tickSize: 0.01,
      stepSize: 0.001,
      minQty: 0.001,
      maxQty: 9999999,
      minNotional: 10,
      pricePrecision: symbolInfo.quotePrecision || 8,
      quantityPrecision: symbolInfo.baseAssetPrecision || 8,
    };

    for (const filter of symbolInfo.filters) {
      switch (filter.filterType) {
        case 'PRICE_FILTER':
          filters.tickSize = parseFloat(filter.tickSize);
          break;
        case 'LOT_SIZE':
          filters.stepSize = parseFloat(filter.stepSize);
          filters.minQty = parseFloat(filter.minQty);
          filters.maxQty = parseFloat(filter.maxQty);
          break;
        case 'NOTIONAL':
        case 'MIN_NOTIONAL':
          filters.minNotional = parseFloat(filter.minNotional || filter.notional || '10');
          break;
      }
    }

    // Cache with expiry
    symbolFiltersCache.set(symbol, { filters, expiry: now + CACHE_TTL_MS });
    logger.info(`📐 Loaded filters for ${symbol}: tick=${filters.tickSize}, step=${filters.stepSize}, minQty=${filters.minQty}, minNotional=${filters.minNotional}`);
    
    return filters;
  } catch (error) {
    logger.warn(`Failed to fetch symbol filters for ${symbol}, using defaults: ${error}`);
    // Return safe defaults
    return {
      tickSize: 0.01,
      stepSize: 0.001,
      minQty: 0.001,
      maxQty: 9999999,
      minNotional: 10,
      pricePrecision: 8,
      quantityPrecision: 8,
    };
  }
}

/**
 * Round value DOWN to the nearest step (for quantities)
 * Always rounds down to ensure we don't exceed available balance
 */
export function roundToStepSize(value: number, stepSize: number): number {
  if (stepSize <= 0 || !Number.isFinite(value)) return value;
  const precision = Math.max(0, Math.ceil(-Math.log10(stepSize)));
  const factor = Math.pow(10, precision);
  return Math.floor(value * factor) / factor;
}

/**
 * Round price to the nearest tick size
 * Uses standard rounding for prices
 */
export function roundToTickSize(price: number, tickSize: number): number {
  if (tickSize <= 0 || !Number.isFinite(price)) return price;
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Format a number to a specific precision for Binance API
 */
export function formatForBinance(value: number, precision: number): string {
  return value.toFixed(precision).replace(/\.?0+$/, '');
}

// ============= ORDER VALIDATION =============

export interface OrderValidation {
  valid: boolean;
  errors: string[];
  adjustedQuantity?: number;
  adjustedPrice?: number;
}

/**
 * Validate and adjust order parameters to meet Binance requirements
 */
export function validateOrder(
  symbol: string,
  quantity: number,
  price: number,
  filters: SymbolFilters
): OrderValidation {
  const errors: string[] = [];
  
  // Adjust quantity to step size
  const adjustedQuantity = roundToStepSize(quantity, filters.stepSize);
  
  // Adjust price to tick size
  const adjustedPrice = roundToTickSize(price, filters.tickSize);
  
  // Validate minimum quantity
  if (adjustedQuantity < filters.minQty) {
    errors.push(`Quantity ${adjustedQuantity} below minimum ${filters.minQty}`);
  }
  
  // Validate maximum quantity
  if (adjustedQuantity > filters.maxQty) {
    errors.push(`Quantity ${adjustedQuantity} above maximum ${filters.maxQty}`);
  }
  
  // Validate minimum notional
  const notional = adjustedQuantity * adjustedPrice;
  if (notional < filters.minNotional) {
    errors.push(`Order value $${notional.toFixed(2)} below minimum $${filters.minNotional}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    adjustedQuantity,
    adjustedPrice,
  };
}

// ============= HMAC SIGNING =============

/**
 * Create HMAC-SHA256 signature for Binance API requests
 */
export async function createBinanceSignature(queryString: string, apiSecret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(queryString);
  const key = encoder.encode(apiSecret);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============= API HELPERS =============

/**
 * Fetch current price for a symbol
 */
export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!response.ok) {
      logger.warn(`Failed to fetch price for ${symbol}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    logger.error(`Error fetching price for ${symbol}: ${error}`);
    return null;
  }
}

/**
 * Fetch order book depth for spread analysis
 */
export async function getOrderBookSpread(symbol: string): Promise<{ bid: number; ask: number; spread: number } | null> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=5`);
    if (!response.ok) {
      return null;
    }
    const depth = await response.json();
    const bestBid = parseFloat(depth.bids[0][0]);
    const bestAsk = parseFloat(depth.asks[0][0]);
    const spread = ((bestAsk - bestBid) / bestBid) * 100;
    
    return { bid: bestBid, ask: bestAsk, spread };
  } catch (error) {
    logger.error(`Error fetching order book for ${symbol}: ${error}`);
    return null;
  }
}

/**
 * Fetch klines (candlestick data) from Binance
 */
export async function fetchKlines(
  symbol: string, 
  interval: string = '1h', 
  limit: number = 100,
  retries: number = 2
): Promise<any[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Binance API error: ${response.status} - ${response.statusText}`);
        }
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const klines = await response.json();
      return Array.isArray(klines) ? klines : [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn(`Failed to fetch ${interval} klines for ${symbol} (attempt ${attempt + 1}/${retries + 1}): ${lastError.message}`);
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error(`Failed to fetch klines for ${symbol}`);
}

/**
 * Parse klines into price arrays
 */
export function parseKlinePrices(klines: any[]): {
  opens: number[];
  highs: number[];
  lows: number[];
  closes: number[];
  volumes: number[];
} {
  const opens: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const closes: number[] = [];
  const volumes: number[] = [];
  
  for (const k of klines) {
    opens.push(parseFloat(k[1]));
    highs.push(parseFloat(k[2]));
    lows.push(parseFloat(k[3]));
    closes.push(parseFloat(k[4]));
    volumes.push(parseFloat(k[5]));
  }
  
  return { opens, highs, lows, closes, volumes };
}

// ============= SLIPPAGE HELPERS =============

/**
 * Calculate slippage between expected and actual price
 */
export function calculateSlippage(expectedPrice: number, actualPrice: number): number {
  if (expectedPrice <= 0) return 0;
  return Math.abs((actualPrice - expectedPrice) / expectedPrice) * 100;
}

/**
 * Check if slippage is within acceptable limits
 */
export function isSlippageAcceptable(
  expectedPrice: number, 
  actualPrice: number, 
  maxSlippagePercent: number = 0.5
): boolean {
  return calculateSlippage(expectedPrice, actualPrice) <= maxSlippagePercent;
}

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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`https://api.binance.com/api/v3/exchangeInfo?symbol=${symbol}`, { signal: controller.signal });
    clearTimeout(timeoutId);
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

// ============= FETCH TIMEOUT & CACHE =============

/** Timeouts by endpoint type */
const FETCH_TIMEOUTS = {
  klines: 5000,    // 5s for kline data
  ticker: 3000,    // 3s for ticker/price
  depth: 3000,     // 3s for order book
  exchangeInfo: 5000,
} as const;

/**
 * Fetch with AbortController timeout — prevents 30-50s hangs from Binance throttling
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`BINANCE_TIMEOUT after ${timeoutMs}ms: ${url.split('?')[0]}`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
}

/**
 * In-memory kline cache — prevents redundant Binance calls within the same cycle.
 * TTL is 80% of the timeframe duration (e.g., 48s for 1m, 720s for 15m).
 */
const klineCache = new Map<string, { data: any[]; ts: number }>();

function getKlineCacheTTL(interval: string): number {
  const intervalSeconds: Record<string, number> = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900,
    '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400,
    '1d': 86400,
  };
  const seconds = intervalSeconds[interval] || 3600;
  return seconds * 0.8 * 1000; // 80% of timeframe in ms
}

/**
 * Bounded concurrency limiter for Binance API calls.
 * Prevents overwhelming Binance with parallel requests.
 */
const MAX_CONCURRENT_BINANCE_FETCHES = 3;
let activeFetches = 0;
const fetchQueue: Array<{ resolve: () => void }> = [];

async function acquireFetchSlot(): Promise<void> {
  if (activeFetches < MAX_CONCURRENT_BINANCE_FETCHES) {
    activeFetches++;
    return;
  }
  return new Promise<void>((resolve) => {
    fetchQueue.push({ resolve });
  });
}

function releaseFetchSlot(): void {
  activeFetches--;
  if (fetchQueue.length > 0) {
    const next = fetchQueue.shift()!;
    activeFetches++;
    next.resolve();
  }
}

// ============= API HELPERS =============

/**
 * Fetch current price for a symbol
 */
export async function getCurrentPrice(symbol: string): Promise<number | null> {
  try {
    await acquireFetchSlot();
    const response = await fetchWithTimeout(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`,
      FETCH_TIMEOUTS.ticker
    );
    releaseFetchSlot();
    if (!response.ok) {
      logger.warn(`Failed to fetch price for ${symbol}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    releaseFetchSlot();
    logger.error(`Error fetching price for ${symbol}: ${error}`);
    return null;
  }
}

/**
 * Fetch 24hr ticker data for a symbol
 */
export async function get24hrTicker(symbol: string): Promise<any | null> {
  try {
    await acquireFetchSlot();
    const response = await fetchWithTimeout(
      `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`,
      FETCH_TIMEOUTS.ticker
    );
    releaseFetchSlot();
    if (!response.ok) {
      logger.warn(`Failed to fetch 24hr ticker for ${symbol}: ${response.status}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    releaseFetchSlot();
    logger.error(`Error fetching 24hr ticker for ${symbol}: ${error}`);
    return null;
  }
}

/**
 * Fetch order book depth for spread analysis
 */
export async function getOrderBookSpread(symbol: string): Promise<{ bid: number; ask: number; spread: number } | null> {
  try {
    await acquireFetchSlot();
    const response = await fetchWithTimeout(
      `https://api.binance.com/api/v3/depth?symbol=${symbol}&limit=5`,
      FETCH_TIMEOUTS.depth
    );
    releaseFetchSlot();
    if (!response.ok) {
      return null;
    }
    const depth = await response.json();
    const bestBid = parseFloat(depth.bids[0][0]);
    const bestAsk = parseFloat(depth.asks[0][0]);
    const spread = ((bestAsk - bestBid) / bestBid) * 100;
    
    return { bid: bestBid, ask: bestAsk, spread };
  } catch (error) {
    releaseFetchSlot();
    logger.error(`Error fetching order book for ${symbol}: ${error}`);
    return null;
  }
}

/**
 * Fetch klines (candlestick data) from Binance
 * Features: 5s timeout, in-memory cache, bounded concurrency, exponential backoff retry
 * @alias getKlines - Preferred name for consistency
 */
export async function fetchKlines(
  symbol: string, 
  interval: string = '1h', 
  limit: number = 100,
  retries: number = 2
): Promise<any[]> {
  // Check cache first
  const cacheKey = `${symbol}_${interval}_${limit}`;
  const cached = klineCache.get(cacheKey);
  const ttl = getKlineCacheTTL(interval);
  
  if (cached && Date.now() - cached.ts < ttl) {
    return cached.data;
  }

  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await acquireFetchSlot();
      const response = await fetchWithTimeout(
        `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
        FETCH_TIMEOUTS.klines
      );
      releaseFetchSlot();
      
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new Error(`Binance API error: ${response.status} - ${response.statusText}`);
        }
        throw new Error(`Binance API error: ${response.status}`);
      }
      
      const klines = await response.json();
      const result = Array.isArray(klines) ? klines : [];
      
      // Store in cache
      klineCache.set(cacheKey, { data: result, ts: Date.now() });
      
      return result;
    } catch (error) {
      releaseFetchSlot();
      lastError = error instanceof Error ? error : new Error(String(error));
      const isTimeout = lastError.message.includes('BINANCE_TIMEOUT');
      logger.warn(`${isTimeout ? '⏰' : '❌'} Failed to fetch ${interval} klines for ${symbol} (attempt ${attempt + 1}/${retries + 1}): ${lastError.message}`);
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError || new Error(`Failed to fetch klines for ${symbol}`);
}

// Alias for consistency with other naming conventions
export const getKlines = fetchKlines;

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

// ============= WEBSOCKET UTILITIES =============

export const BINANCE_WS_BASE_URL = 'wss://stream.binance.com/stream';

export interface BinanceWebSocketConfig {
  symbols: string[];
  streamType?: 'ticker' | 'trade' | 'kline' | 'depth';
  interval?: string; // For kline streams (e.g., '1m', '5m', '1h')
  maxReconnectAttempts?: number;
  baseReconnectDelay?: number;
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: Event) => void;
  onReconnect?: (attempt: number) => void;
}

export interface BinanceTickerData {
  symbol: string;
  price: string;
  priceChange: string;
  priceChangePercent: string;
  high: string;
  low: string;
  volume: string;
  timestamp: number;
}

/**
 * Build Binance WebSocket stream URL for multiple symbols
 */
export function buildStreamUrl(symbols: string[], streamType: string = 'ticker', interval?: string): string {
  const streams = symbols.map(s => {
    const symbol = s.toLowerCase();
    switch (streamType) {
      case 'trade':
        return `${symbol}@trade`;
      case 'kline':
        return `${symbol}@kline_${interval || '1m'}`;
      case 'depth':
        return `${symbol}@depth@100ms`;
      case 'ticker':
      default:
        return `${symbol}@ticker`;
    }
  }).join('/');
  
  return `${BINANCE_WS_BASE_URL}?streams=${streams}`;
}

/**
 * Parse raw Binance ticker message into formatted data
 */
export function parseTickerMessage(data: any): BinanceTickerData | null {
  if (!data.stream || !data.data) return null;
  
  const ticker = data.data;
  return {
    symbol: ticker.s,
    price: ticker.c,
    priceChange: ticker.p,
    priceChangePercent: ticker.P,
    high: ticker.h,
    low: ticker.l,
    volume: ticker.v,
    timestamp: ticker.E,
  };
}

/**
 * Managed Binance WebSocket connection with reconnection logic
 */
export class BinanceWebSocketManager {
  private socket: WebSocket | null = null;
  private config: Required<BinanceWebSocketConfig>;
  private reconnectAttempts = 0;
  private reconnectTimeout: number | null = null;
  private isIntentionallyClosed = false;
  
  constructor(config: BinanceWebSocketConfig) {
    this.config = {
      symbols: config.symbols,
      streamType: config.streamType || 'ticker',
      interval: config.interval || '1m',
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
      baseReconnectDelay: config.baseReconnectDelay ?? 1000,
      onMessage: config.onMessage || (() => {}),
      onOpen: config.onOpen || (() => {}),
      onClose: config.onClose || (() => {}),
      onError: config.onError || (() => {}),
      onReconnect: config.onReconnect || (() => {}),
    };
  }
  
  /**
   * Connect to Binance WebSocket stream
   */
  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      logger.warn('WebSocket already connected');
      return;
    }
    
    this.isIntentionallyClosed = false;
    const url = buildStreamUrl(this.config.symbols, this.config.streamType, this.config.interval);
    logger.info(`Connecting to Binance WebSocket: ${url}`);
    
    try {
      this.socket = new WebSocket(url);
      this.setupEventHandlers();
    } catch (error) {
      logger.error(`Failed to create WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }
  
  private setupEventHandlers(): void {
    if (!this.socket) return;
    
    this.socket.onopen = () => {
      logger.info('Binance WebSocket connected');
      this.reconnectAttempts = 0;
      this.config.onOpen();
    };
    
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.config.onMessage(data);
      } catch (error) {
        logger.error(`Error parsing WebSocket message: ${error}`);
      }
    };
    
    this.socket.onerror = (error) => {
      logger.error(`Binance WebSocket error: ${error}`);
      this.config.onError(error);
    };
    
    this.socket.onclose = (event) => {
      logger.info(`Binance WebSocket closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
      this.config.onClose(event.code, event.reason);
      
      if (!this.isIntentionallyClosed) {
        this.scheduleReconnect();
      }
    };
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(`Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
      return;
    }
    
    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s... up to 60s max
    const delay = Math.min(
      this.config.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      60000
    );
    
    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay / 1000}s`);
    this.config.onReconnect(this.reconnectAttempts);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }
  
  /**
   * Update the symbols being streamed (requires reconnection)
   */
  updateSymbols(symbols: string[]): void {
    this.config.symbols = symbols;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.close();
      // Will reconnect automatically with new symbols
    }
  }
  
  /**
   * Send a message through the WebSocket
   */
  send(data: any): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      logger.warn('Cannot send message: WebSocket not connected');
      return false;
    }
    
    try {
      this.socket.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error(`Error sending WebSocket message: ${error}`);
      return false;
    }
  }
  
  /**
   * Close the WebSocket connection
   */
  close(): void {
    this.isIntentionallyClosed = true;
    
    if (this.reconnectTimeout !== null) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.socket) {
      if (this.socket.readyState === WebSocket.OPEN || 
          this.socket.readyState === WebSocket.CONNECTING) {
        this.socket.close();
      }
      this.socket = null;
    }
    
    logger.info('Binance WebSocket closed intentionally');
  }
  
  /**
   * Get current connection state
   */
  get readyState(): number {
    return this.socket?.readyState ?? WebSocket.CLOSED;
  }
  
  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get current reconnection attempt count
   */
  get currentReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

// ============= BINANCE API ERROR NOTIFICATION HELPER =============

export interface BinanceApiErrorDetails {
  operation: string;           // e.g., 'execute_trade', 'close_position', 'fetch_price'
  symbol?: string;
  positionId?: string;
  binanceErrorCode?: number;   // Binance error code (e.g., -2010)
  binanceErrorMsg?: string;    // Binance error message
  httpStatus?: number;         // HTTP status code
  context?: string;            // Additional context
}

/**
 * Send email notification for Binance API errors
 * Call this when critical Binance API operations fail
 */
export async function sendBinanceApiErrorNotification(
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  error: BinanceApiErrorDetails
): Promise<boolean> {
  try {
    // Get user email from risk_parameters
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.81.1");
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: riskParams } = await supabase
      .from('risk_parameters')
      .select('notification_email, email_notifications_enabled')
      .eq('user_id', userId)
      .maybeSingle();
    
    // Only send if email notifications are enabled
    if (!riskParams?.email_notifications_enabled || !riskParams?.notification_email) {
      logger.info(`Skipping Binance API error notification - email not configured or disabled`);
      return false;
    }
    
    // Call send-notification function
    const response = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'binance_api_error',
        email: riskParams.notification_email,
        userId,
        operation: error.operation,
        symbol: error.symbol,
        positionId: error.positionId,
        binanceErrorCode: error.binanceErrorCode,
        binanceErrorMsg: error.binanceErrorMsg,
        httpStatus: error.httpStatus,
        context: error.context,
      }),
    });
    
    if (!response.ok) {
      logger.warn(`Failed to send Binance API error notification: ${response.status}`);
      return false;
    }
    
    logger.info(`📧 Sent Binance API error notification for ${error.operation}`);
    return true;
  } catch (notifyError) {
    logger.error(`Error sending Binance API error notification: ${notifyError}`);
    return false;
  }
}

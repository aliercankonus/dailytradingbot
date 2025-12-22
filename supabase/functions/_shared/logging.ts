// ============= CENTRALIZED LOGGING UTILITY =============
// CRITICAL: Single source of truth for all edge function logging
// Provides consistent formatting, log levels, and structured output

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  symbol?: string;
  userId?: string;
  functionName?: string;
  tradeId?: string;
  signalId?: string;
  [key: string]: string | number | boolean | undefined;
}

// Log level configuration - can be adjusted per environment
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Emoji prefixes for quick visual scanning in logs
const LOG_EMOJIS: Record<LogLevel, string> = {
  debug: '🔍',
  info: '📊',
  warn: '⚠️',
  error: '❌',
};

// Category-specific emojis for common operations
export const LOG_CATEGORIES = {
  // Analysis & Signals
  SIGNAL: '📡',
  TREND: '📈',
  MOMENTUM: '🚀',
  REVERSAL: '🔄',
  QUALITY: '⭐',
  
  // Trading
  TRADE: '💹',
  ENTRY: '🎯',
  EXIT: '🚪',
  STOP_LOSS: '🛑',
  TAKE_PROFIT: '💰',
  
  // Risk & Validation
  RISK: '⚡',
  VALIDATION: '✅',
  REJECTION: '🚫',
  GATE: '🚧',
  
  // Technical Indicators
  ADX: '📏',
  RSI: '📉',
  STOCHRSI: '📊',
  BOLLINGER: '📐',
  MACD: '📶',
  
  // Market & Data
  MARKET: '🏛️',
  PRICE: '💵',
  VOLUME: '📊',
  VOLATILITY: '🌊',
  
  // System
  START: '🏁',
  SUCCESS: '✓',
  COMPLETE: '🏆',
  SUMMARY: '📋',
  CONFIG: '⚙️',
  BOOT: '🚀',
  SHUTDOWN: '🔌',
  
  // Database
  DB_READ: '📖',
  DB_WRITE: '✏️',
  DB_ERROR: '💾',
  
  // External APIs
  API_CALL: '🌐',
  BINANCE: '🔶',
  
  // Timing
  TIMER: '⏱️',
  DELAY: '⏳',
} as const;

// Get minimum log level from environment (default: info)
function getMinLogLevel(): LogLevel {
  const envLevel = Deno.env.get('LOG_LEVEL')?.toLowerCase() as LogLevel | undefined;
  return envLevel && LOG_LEVELS[envLevel] !== undefined ? envLevel : 'info';
}

// Format context object for logging
function formatContext(context?: LogContext): string {
  if (!context || Object.keys(context).length === 0) return '';
  
  const parts: string[] = [];
  
  // Priority fields first
  if (context.functionName) parts.push(`fn=${context.functionName}`);
  if (context.symbol) parts.push(`sym=${context.symbol}`);
  if (context.userId) parts.push(`user=${context.userId.substring(0, 8)}...`);
  if (context.tradeId) parts.push(`trade=${context.tradeId.substring(0, 8)}...`);
  if (context.signalId) parts.push(`signal=${context.signalId.substring(0, 8)}...`);
  
  // Other fields
  for (const [key, value] of Object.entries(context)) {
    if (['functionName', 'symbol', 'userId', 'tradeId', 'signalId'].includes(key)) continue;
    if (value !== undefined) {
      parts.push(`${key}=${value}`);
    }
  }
  
  return parts.length > 0 ? `[${parts.join(' ')}]` : '';
}

// Core logging function
function log(level: LogLevel, message: string, context?: LogContext): void {
  const minLevel = getMinLogLevel();
  if (LOG_LEVELS[level] < LOG_LEVELS[minLevel]) return;
  
  const emoji = LOG_EMOJIS[level];
  const contextStr = formatContext(context);
  const formattedMessage = contextStr ? `${emoji} ${contextStr} ${message}` : `${emoji} ${message}`;
  
  switch (level) {
    case 'debug':
      console.debug(formattedMessage);
      break;
    case 'info':
      console.info(formattedMessage);
      break;
    case 'warn':
      console.warn(formattedMessage);
      break;
    case 'error':
      console.error(formattedMessage);
      break;
  }
}

// Main logger class with fluent API
export class Logger {
  private context: LogContext;
  
  constructor(functionName: string, initialContext?: Omit<LogContext, 'functionName'>) {
    this.context = { functionName, ...initialContext };
  }
  
  // Create a child logger with additional context
  withContext(additionalContext: LogContext): Logger {
    const childLogger = new Logger(this.context.functionName || 'unknown');
    childLogger.context = { ...this.context, ...additionalContext };
    return childLogger;
  }
  
  // Create a symbol-specific logger
  forSymbol(symbol: string): Logger {
    return this.withContext({ symbol });
  }
  
  // Create a user-specific logger
  forUser(userId: string): Logger {
    return this.withContext({ userId });
  }
  
  // Log methods
  debug(message: string, extraContext?: LogContext): void {
    log('debug', message, { ...this.context, ...extraContext });
  }
  
  info(message: string, extraContext?: LogContext): void {
    log('info', message, { ...this.context, ...extraContext });
  }
  
  warn(message: string, extraContext?: LogContext): void {
    log('warn', message, { ...this.context, ...extraContext });
  }
  
  error(message: string, extraContext?: LogContext): void {
    log('error', message, { ...this.context, ...extraContext });
  }
  
  // Category-prefixed logging methods
  signal(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.SIGNAL} ${message}`, extraContext);
  }
  
  trend(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.TREND} ${message}`, extraContext);
  }
  
  momentum(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.MOMENTUM} ${message}`, extraContext);
  }
  
  trade(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.TRADE} ${message}`, extraContext);
  }
  
  risk(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.RISK} ${message}`, extraContext);
  }
  
  validation(message: string, passed: boolean, extraContext?: LogContext): void {
    const prefix = passed ? LOG_CATEGORIES.VALIDATION : LOG_CATEGORIES.REJECTION;
    this.info(`${prefix} ${message}`, extraContext);
  }
  
  gate(message: string, passed: boolean, extraContext?: LogContext): void {
    const prefix = passed ? LOG_CATEGORIES.SUCCESS : LOG_CATEGORIES.GATE;
    this.info(`${prefix} ${message}`, extraContext);
  }
  
  summary(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.SUMMARY} ${message}`, extraContext);
  }
  
  // Timing utilities
  startTimer(label: string): () => void {
    const start = performance.now();
    this.debug(`${LOG_CATEGORIES.TIMER} Starting: ${label}`);
    
    return () => {
      const duration = (performance.now() - start).toFixed(2);
      this.info(`${LOG_CATEGORIES.TIMER} ${label} completed in ${duration}ms`);
    };
  }
  
  // Boot/shutdown logging
  boot(): void {
    this.info(`${LOG_CATEGORIES.BOOT} Function started`);
  }
  
  shutdown(): void {
    this.info(`${LOG_CATEGORIES.SHUTDOWN} Function completed`);
  }
  
  // Success/failure logging
  success(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.SUCCESS} ${message}`, extraContext);
  }
  
  complete(message: string, extraContext?: LogContext): void {
    this.info(`${LOG_CATEGORIES.COMPLETE} ${message}`, extraContext);
  }
}

// Factory function for creating loggers
export function createLogger(functionName: string, initialContext?: Omit<LogContext, 'functionName'>): Logger {
  return new Logger(functionName, initialContext);
}

// Quick logging functions for simple use cases
export const quickLog = {
  debug: (message: string, context?: LogContext) => log('debug', message, context),
  info: (message: string, context?: LogContext) => log('info', message, context),
  warn: (message: string, context?: LogContext) => log('warn', message, context),
  error: (message: string, context?: LogContext) => log('error', message, context),
};

// Formatted table logging for structured data
export function logTable(
  logger: Logger,
  title: string,
  data: Record<string, string | number | boolean | undefined>[],
  columns: string[]
): void {
  logger.info(`${LOG_CATEGORIES.SUMMARY} ${title}:`);
  
  // Calculate column widths
  const widths = columns.map(col => 
    Math.max(col.length, ...data.map(row => String(row[col] ?? '').length))
  );
  
  // Header
  const header = columns.map((col, i) => col.padEnd(widths[i])).join(' | ');
  console.info(`  ${header}`);
  console.info(`  ${widths.map(w => '-'.repeat(w)).join('-+-')}`);
  
  // Rows
  for (const row of data) {
    const rowStr = columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i])).join(' | ');
    console.info(`  ${rowStr}`);
  }
}

// Metric logging with consistent formatting
export function logMetrics(
  logger: Logger,
  title: string,
  metrics: Record<string, number | string | boolean>
): void {
  const parts = Object.entries(metrics)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        return `${key}=${value.toFixed(2)}`;
      }
      return `${key}=${value}`;
    })
    .join(' ');
  
  logger.info(`${title}: ${parts}`);
}

// Error logging with stack trace
export function logError(logger: Logger, error: unknown, context?: string): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  
  logger.error(`${context ? `${context}: ` : ''}${errorMessage}`);
  if (stack) {
    console.error(stack);
  }
}

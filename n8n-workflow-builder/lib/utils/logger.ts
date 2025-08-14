/**
 * Centralized logging utility for n8n Workflow Builder
 * Provides configurable verbosity levels and formatted output
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  showTimestamp?: boolean;
  format?: 'simple' | 'detailed';
  category?: string;
}

interface LogEntry {
  level: LogLevel;
  category?: string;
  message: string;
  data?: any;
  timestamp: Date;
}

// Map string levels to enum
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'error': LogLevel.ERROR,
  'warn': LogLevel.WARN,
  'info': LogLevel.INFO,
  'debug': LogLevel.DEBUG,
  'verbose': LogLevel.VERBOSE
};

// Default log level based on environment
const getDefaultLogLevel = (): LogLevel => {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && LOG_LEVEL_MAP[envLevel] !== undefined) {
    return LOG_LEVEL_MAP[envLevel];
  }
  
  // Test environment defaults to INFO unless TEST_VERBOSE is set
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_VERBOSE === 'true' ? LogLevel.VERBOSE : LogLevel.INFO;
  }
  
  // Default to INFO for cleaner logs (can override with LOG_LEVEL env var)
  return LogLevel.INFO;
};

export class Logger {
  private config: LoggerConfig;
  private static instance: Logger;
  
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: getDefaultLogLevel(),
      showTimestamp: process.env.NODE_ENV !== 'test' && !process.env.BUILD_WORKFLOW,
      format: (process.env.NODE_ENV === 'test' || process.env.BUILD_WORKFLOW) ? 'simple' : 'detailed',
      ...config
    };
  }
  
  // Singleton instance for global logger
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }
  
  // Create a logger with a specific category/prefix
  static create(category: string, config: Partial<LoggerConfig> = {}): Logger {
    return new Logger({ ...config, category });
  }
  
  private shouldLog(level: LogLevel): boolean {
    // Check log level dynamically to respect environment changes
    const currentLevel = getDefaultLogLevel();
    return level <= currentLevel;
  }
  
  private formatMessage(entry: LogEntry): string {
    const { level, category, message, timestamp } = entry;
    
    // Check format dynamically to respect BUILD_WORKFLOW environment variable
    const format = (process.env.NODE_ENV === 'test' || process.env.BUILD_WORKFLOW) ? 'simple' : (this.config.format || 'detailed');
    
    if (format === 'simple') {
      // Simple format for tests
      const prefix = category ? `[${category}] ` : '';
      return `${prefix}${message}`;
    }
    
    // Detailed format
    const parts: string[] = [];
    
    const showTimestamp = process.env.BUILD_WORKFLOW ? false : this.config.showTimestamp;
    if (showTimestamp) {
      parts.push(`[${timestamp.toISOString()}]`);
    }
    
    const levelStr = LogLevel[level].padEnd(7);
    parts.push(`[${levelStr}]`);
    
    if (category || this.config.category) {
      parts.push(`[${category || this.config.category}]`);
    }
    
    if (this.config.prefix) {
      parts.push(this.config.prefix);
    }
    
    parts.push(message);
    
    return parts.join(' ');
  }
  
  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }
    
    const entry: LogEntry = {
      level,
      category: this.config.category,
      message,
      data,
      timestamp: new Date()
    };
    
    const formattedMessage = this.formatMessage(entry);
    
    // Output based on level
    switch (level) {
      case LogLevel.ERROR:
        console.error(formattedMessage, data ? data : '');
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, data ? data : '');
        break;
      default:
        console.log(formattedMessage, data ? data : '');
    }
  }
  
  error(message: string, error?: Error | any): void {
    this.log(LogLevel.ERROR, message, error);
  }
  
  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }
  
  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }
  
  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }
  
  verbose(message: string, data?: any): void {
    this.log(LogLevel.VERBOSE, message, data);
  }
  
  // Test summary helpers
  success(message: string): void {
    if (this.config.format === 'simple') {
      this.info(`✓ ${message}`);
    } else {
      this.info(message);
    }
  }
  
  // Phase summary for orchestrator
  phase(phase: string, summary: string): void {
    if (this.config.format === 'simple') {
      this.info(`✓ ${phase}: ${summary}`);
    } else {
      this.info(`[${phase}] ${summary}`);
    }
  }
  
  // Update configuration
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }
  
  setFormat(format: 'simple' | 'detailed'): void {
    this.config.format = format;
  }
}

// Convenience functions for category-based loggers
export const createLogger = (category: string, config?: Partial<LoggerConfig>): Logger => {
  return Logger.create(category, config);
};

// Pre-configured loggers for common components
export const loggers = {
  mcp: createLogger('MCP'),
  claude: createLogger('Claude'),
  orchestrator: createLogger('Orchestrator'),
  test: createLogger('Test', { format: 'simple' }),
  tools: createLogger('Tools'), // Logger for tool execution
  discovery: createLogger('Discovery'),
  configuration: createLogger('Configuration'),
  building: createLogger('Building'),
  validation: createLogger('Validation'),
  documentation: createLogger('Documentation'),
  session: createLogger('Session'),
  seo: createLogger('SEO')
};


// Global logger instance
export const logger = Logger.getInstance();
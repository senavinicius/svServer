/**
 * Logger implementation using @vinicius/logger
 * Sends logs to central logger server via HTTP
 * Maintains backward compatibility with old logger API
 */
import { createLogger, HTTPTransport } from '@vinicius/logger';

// Re-export old types for backward compatibility
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  operation: string;
  message: string;
  data?: any;
}

// Get central logger URL from environment
const LOGGER_URL = process.env.LOGGER_URL || 'http://localhost:3005/api/logs/ingest';

// Create logger with HTTP transport to send logs to central server
export const internalLogger = createLogger({
  level: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
  pretty: process.env.NODE_ENV !== 'production',
  sanitize: ['password', 'token', 'secret'],
  transports: [
    new HTTPTransport({
      url: LOGGER_URL,
      retry: true,
      maxRetries: 3,
      timeout: 5000,
    }),
  ],
});

/**
 * Logger com API compatível com versão antiga
 */
export const logger = {
  debug(operation: string, message: string, data?: any): void {
    internalLogger.debug(operation, message, data);
  },

  info(operation: string, message: string, data?: any): void {
    internalLogger.info(operation, message, data);
  },

  warn(operation: string, message: string, data?: any): void {
    internalLogger.warn(operation, message, data);
  },

  error(operation: string, message: string, data?: any): void {
    internalLogger.error(operation, message, data);
  },

  /**
   * Log de operações que modificam arquivos - MUITO IMPORTANTE
   */
  fileOperation(operation: string, filePath: string, before: string, after: string): void {
    internalLogger.info(operation, `Modificando arquivo: ${filePath}`, {
      filePath,
      beforeLength: before.length,
      afterLength: after.length,
      diff: {
        removed: before.length - after.length,
        beforePreview: before.substring(0, 500) + '...',
        afterPreview: after.substring(0, 500) + '...',
      },
    });
  },
};

// Log de inicialização
logger.info('SYSTEM', 'Logger inicializado - enviando logs para servidor central', { loggerUrl: LOGGER_URL });

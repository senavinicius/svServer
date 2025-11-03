/**
 * New logger implementation using @vinicius/logger
 * Maintains backward compatibility with old logger API
 */
import { createLogger, SSETransport } from '@vinicius/logger';
import type { LogEntry as NewLogEntry } from '@vinicius/logger';

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

// In-memory storage for backward compatibility
const MAX_LOGS = 500;
const logs: LogEntry[] = [];

// Listeners for SSE
type LogListener = (entry: LogEntry) => void;
const listeners: Set<LogListener> = new Set();

// Create SSE transport
const sseTransport = new SSETransport();

// Custom transport for in-memory storage + listeners
class MemoryAndListenerTransport {
  write(entry: NewLogEntry): void {
    // Convert new format to old format
    const oldEntry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      timestamp: entry.time,
      level: entry.level.toUpperCase() as LogLevel,
      operation: entry.category || 'SYSTEM',
      message: entry.msg,
      data: entry.data,
    };

    // Store in memory
    logs.push(oldEntry);
    if (logs.length > MAX_LOGS) {
      logs.shift();
    }

    // Notify listeners
    listeners.forEach(listener => {
      try {
        listener(oldEntry);
      } catch (error) {
        console.error('Erro ao notificar listener:', error);
      }
    });
  }
}

// Create logger with both transports
const memoryTransport = new MemoryAndListenerTransport();

export const internalLogger = createLogger({
  level: process.env.LOG_LEVEL === 'debug' ? 'debug' : 'info',
  pretty: process.env.NODE_ENV !== 'production',
  sanitize: ['password', 'token', 'secret'],
  transports: [memoryTransport, sseTransport],
});

// Export SSE transport for route setup
export { sseTransport };

/**
 * Adiciona um listener para receber logs em tempo real
 */
export function addLogListener(listener: LogListener): void {
  listeners.add(listener);
}

/**
 * Remove um listener
 */
export function removeLogListener(listener: LogListener): void {
  listeners.delete(listener);
}

/**
 * Retorna todos os logs armazenados
 */
export function getAllLogs(): LogEntry[] {
  return [...logs];
}

/**
 * Limpa todos os logs
 */
export function clearLogs(): void {
  logs.length = 0;
}

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
logger.info('SYSTEM', 'Logger inicializado com @vinicius/logger - logs em memória + SSE streaming');

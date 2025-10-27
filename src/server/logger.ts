import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

// Diretório de logs
const LOG_DIR = '/var/log/ec2-manager';
const LOG_FILE = join(LOG_DIR, 'operations.log');

// Níveis de log
export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  operation: string;
  message: string;
  data?: any;
}

/**
 * Garante que o diretório de logs existe
 */
function ensureLogDir(): void {
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true, mode: 0o755 });
    }
  } catch (error) {
    console.error('Erro ao criar diretório de logs:', error);
  }
}

/**
 * Formata uma entrada de log
 */
function formatLogEntry(entry: LogEntry): string {
  const dataStr = entry.data ? `\n  Data: ${JSON.stringify(entry.data, null, 2)}` : '';
  return `[${entry.timestamp}] [${entry.level}] [${entry.operation}] ${entry.message}${dataStr}\n`;
}

/**
 * Escreve log no arquivo e no console
 */
function writeLog(level: LogLevel, operation: string, message: string, data?: any): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    operation,
    message,
    data,
  };

  const formattedLog = formatLogEntry(entry);

  // Log no console (sempre)
  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedLog);
      break;
    case LogLevel.WARN:
      console.warn(formattedLog);
      break;
    case LogLevel.DEBUG:
      console.debug(formattedLog);
      break;
    default:
      console.log(formattedLog);
  }

  // Log no arquivo
  try {
    ensureLogDir();
    appendFileSync(LOG_FILE, formattedLog, { encoding: 'utf-8', mode: 0o644 });
  } catch (error) {
    console.error('Erro ao escrever no arquivo de log:', error);
  }
}

/**
 * Logger principal
 */
export const logger = {
  debug(operation: string, message: string, data?: any): void {
    writeLog(LogLevel.DEBUG, operation, message, data);
  },

  info(operation: string, message: string, data?: any): void {
    writeLog(LogLevel.INFO, operation, message, data);
  },

  warn(operation: string, message: string, data?: any): void {
    writeLog(LogLevel.WARN, operation, message, data);
  },

  error(operation: string, message: string, data?: any): void {
    writeLog(LogLevel.ERROR, operation, message, data);
  },

  /**
   * Log de operações que modificam arquivos - MUITO IMPORTANTE
   */
  fileOperation(operation: string, filePath: string, before: string, after: string): void {
    writeLog(LogLevel.INFO, operation, `Modificando arquivo: ${filePath}`, {
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

// Criar diretório de logs na inicialização
ensureLogDir();
logger.info('SYSTEM', 'Logger inicializado', { logFile: LOG_FILE });

// Níveis de log
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

// Armazenar logs em memória (últimos 500)
const MAX_LOGS = 500;
const logs: LogEntry[] = [];

// Listeners para logs em tempo real
type LogListener = (entry: LogEntry) => void;
const listeners: Set<LogListener> = new Set();

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
 * Formata uma entrada de log para console
 */
function formatLogEntry(entry: LogEntry): string {
  let dataStr = '';

  if (entry.data) {
    // Se tem uma chave 'blocoCompleto', exibir de forma legível
    if (entry.data.blocoCompleto && typeof entry.data.blocoCompleto === 'string') {
      dataStr = `\n${'='.repeat(80)}\n${entry.data.blocoCompleto}\n${'='.repeat(80)}`;
    } else {
      dataStr = `\n  Data: ${JSON.stringify(entry.data, null, 2)}`;
    }
  }

  return `[${entry.timestamp}] [${entry.level}] [${entry.operation}] ${entry.message}${dataStr}`;
}

/**
 * Escreve log e notifica listeners
 */
function writeLog(level: LogLevel, operation: string, message: string, data?: any): void {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
    timestamp: new Date().toISOString(),
    level,
    operation,
    message,
    data,
  };

  // Adicionar aos logs em memória
  logs.push(entry);

  // Manter apenas os últimos MAX_LOGS
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }

  // Log no console
  const formattedLog = formatLogEntry(entry);
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

  // Notificar todos os listeners (frontend ao vivo)
  listeners.forEach(listener => {
    try {
      listener(entry);
    } catch (error) {
      console.error('Erro ao notificar listener:', error);
    }
  });
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

// Log de inicialização
logger.info('SYSTEM', 'Logger inicializado - logs em memória para streaming ao vivo');

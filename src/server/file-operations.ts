/**
 * Operações de arquivo e execução de comandos do sistema
 */

import { writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from './logger.js';
import { escapeShellArg } from './validation.js';

const execAsync = promisify(exec);

interface ExecResult {
  stdout: string;
  stderr: string;
}

/**
 * Executa um comando shell com logging detalhado
 */
export async function execCommand(command: string): Promise<ExecResult> {
  logger.debug('execCommand', `Executando comando: ${command}`);

  try {
    const result = await execAsync(command, { maxBuffer: 1024 * 1024 });
    logger.debug('execCommand', 'Comando executado com sucesso', {
      command,
      stdout: result.stdout.substring(0, 500),
      stderr: result.stderr.substring(0, 500),
    });
    return result;
  } catch (error: any) {
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    const exitCode = error.code ?? 'unknown';

    logger.error('execCommand', 'Comando falhou', {
      command,
      exitCode,
      stdout: stdout.substring(0, 500),
      stderr: stderr.substring(0, 500),
    });

    const messageParts = [
      `Comando falhou: ${command}`,
      `Exit code: ${exitCode}`,
      stdout.trim() ? `STDOUT:\n${stdout.trim()}` : null,
      stderr.trim() ? `STDERR:\n${stderr.trim()}` : null,
    ].filter(Boolean);

    const wrapped = new Error(messageParts.join('\n\n') || `Comando falhou: ${command}`);
    (wrapped as any).stdout = stdout;
    (wrapped as any).stderr = stderr;
    (wrapped as any).exitCode = exitCode;
    throw wrapped;
  }
}

/**
 * Escreve conteúdo em arquivo protegido usando sudo
 */
export async function writeProtectedFile(filePath: string, content: string): Promise<void> {
  const tempPath = `/tmp/vhost-write-${Date.now()}.conf`;

  // Escrever em arquivo temporário
  writeFileSync(tempPath, content, 'utf-8');

  try {
    // Copiar para destino final com sudo
    await execCommand(`sudo cp ${escapeShellArg(tempPath)} ${escapeShellArg(filePath)}`);
    await execCommand(`sudo chmod 644 ${escapeShellArg(filePath)}`);
  } finally {
    // Limpar arquivo temporário
    try {
      await execCommand(`rm -f ${escapeShellArg(tempPath)}`);
    } catch (error) {
      console.warn('Aviso: não foi possível remover arquivo temporário:', tempPath);
    }
  }
}

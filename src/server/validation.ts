/**
 * Funções de validação e sanitização para operações de domínios
 */

/**
 * Valida um nome de domínio
 */
export function validateDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return domainRegex.test(domain);
}

/**
 * Valida um caminho de diretório (documentRoot)
 * - Deve ser caminho absoluto
 * - Não pode conter path traversal (..)
 * - Não pode acessar diretórios sensíveis do sistema
 */
export function validateDocumentRoot(path: string): boolean {
  // Deve ser caminho absoluto
  if (!path.startsWith('/')) {
    return false;
  }

  // Não pode conter path traversal
  if (path.includes('..')) {
    return false;
  }

  // Lista de diretórios proibidos (sistema sensível)
  const forbiddenPaths = [
    '/etc',
    '/root',
    '/sys',
    '/proc',
    '/dev',
    '/boot',
    '/bin',
    '/sbin',
    '/usr/bin',
    '/usr/sbin',
  ];

  // Verificar se o path começa com algum diretório proibido
  for (const forbidden of forbiddenPaths) {
    if (path === forbidden || path.startsWith(forbidden + '/')) {
      return false;
    }
  }

  // Path válido
  return true;
}

/**
 * Escapa caracteres especiais para uso seguro em comandos shell
 */
export function escapeShellArg(arg: string): string {
  // Envolve em aspas simples e escapa aspas simples existentes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

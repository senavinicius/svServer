import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CreateDomainDTO, UpdateDomainDto } from '../shared/types.js';
import { logger } from './logger.js';

const execAsync = promisify(exec);

const VHOST_HTTP_PATH = '/etc/httpd/conf.d/vhost.conf';
const VHOST_HTTPS_PATH = '/etc/httpd/conf.d/vhost-le-ssl.conf';

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function execCommand(command: string): Promise<ExecResult> {
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
function escapeShellArg(arg: string): string {
  // Envolve em aspas simples e escapa aspas simples existentes
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Escreve conteúdo em arquivo protegido usando sudo
 */
async function writeProtectedFile(filePath: string, content: string): Promise<void> {
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

/**
 * Gera configuração VirtualHost para domínio Node
 */
function generateNodeVirtualHost(serverName: string, port: number): string {
  return `
<VirtualHost *:80>
    ServerName ${serverName}
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:${port}/
    ProxyPassReverse / http://127.0.0.1:${port}/
    ErrorLog /var/log/httpd/${serverName}-error.log
    CustomLog /var/log/httpd/${serverName}-access.log combined
</VirtualHost>
`;
}

/**
 * Gera configuração VirtualHost para domínio Static
 */
function generateStaticVirtualHost(serverName: string, documentRoot: string): string {
  return `
<VirtualHost *:80>
    ServerName ${serverName}
    DocumentRoot ${documentRoot}
    <Directory "${documentRoot}">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    DirectoryIndex index.html
    ErrorLog /var/log/httpd/${serverName}-error.log
    CustomLog /var/log/httpd/${serverName}-access.log combined
</VirtualHost>
`;
}

/**
 * Adiciona um novo domínio ao Apache
 */
export async function addDomain(dto: CreateDomainDTO): Promise<void> {
  logger.info('addDomain', `Iniciando adição de domínio`, { dto });

  // Validar domínio
  if (!validateDomain(dto.serverName)) {
    logger.error('addDomain', 'Domínio inválido', { serverName: dto.serverName });
    throw new Error('Domínio inválido');
  }

  // Validar parâmetros por tipo
  if (dto.type === 'node' && !dto.port) {
    logger.error('addDomain', 'Porta obrigatória para domínios Node', { dto });
    throw new Error('Porta é obrigatória para domínios Node');
  }

  if (dto.type === 'static' && !dto.documentRoot) {
    logger.error('addDomain', 'DocumentRoot obrigatório para domínios Static', { dto });
    throw new Error('DocumentRoot é obrigatório para domínios Static');
  }

  // Validar documentRoot se fornecido
  if (dto.type === 'static' && dto.documentRoot && !validateDocumentRoot(dto.documentRoot)) {
    logger.error('addDomain', 'DocumentRoot inválido', { documentRoot: dto.documentRoot });
    throw new Error('DocumentRoot inválido: deve ser um caminho absoluto e não pode acessar diretórios sensíveis do sistema');
  }

  // Validar porta se fornecida
  if (dto.type === 'node' && dto.port) {
    if (dto.port < 1 || dto.port > 65535) {
      logger.error('addDomain', 'Porta fora do range válido', { port: dto.port });
      throw new Error('Porta inválida: deve estar entre 1 e 65535');
    }
    // Portas reservadas do sistema
    if (dto.port < 1024) {
      logger.error('addDomain', 'Porta reservada', { port: dto.port });
      throw new Error('Porta inválida: portas abaixo de 1024 são reservadas');
    }
  }

  // Gerar configuração
  logger.debug('addDomain', 'Gerando configuração VirtualHost');
  let vhostConfig: string;
  if (dto.type === 'node') {
    vhostConfig = generateNodeVirtualHost(dto.serverName, dto.port!);
  } else {
    vhostConfig = generateStaticVirtualHost(dto.serverName, dto.documentRoot!);
  }
  logger.debug('addDomain', 'Configuração gerada', { configLength: vhostConfig.length });

  // Adicionar ao arquivo de configuração
  const currentConfig = existsSync(VHOST_HTTP_PATH) ? readFileSync(VHOST_HTTP_PATH, 'utf-8') : '';
  const newConfig = currentConfig + '\n' + vhostConfig;

  logger.fileOperation('addDomain', VHOST_HTTP_PATH, currentConfig, newConfig);
  await writeProtectedFile(VHOST_HTTP_PATH, newConfig);
  logger.info('addDomain', 'Domínio adicionado ao arquivo de configuração');

  // Testar configuração
  logger.debug('addDomain', 'Testando configuração Apache');
  await execCommand('apachectl configtest');
  logger.info('addDomain', 'Configuração Apache válida');

  // Recarregar Apache
  logger.debug('addDomain', 'Recarregando Apache');
  await execCommand('sudo systemctl reload httpd');
  logger.info('addDomain', 'Apache recarregado');

  // Obter SSL automaticamente
  logger.info('addDomain', 'Obtendo certificado SSL');
  await obtainSSL(dto.serverName);
  logger.info('addDomain', `Domínio adicionado com sucesso: ${dto.serverName}`);
}

/**
 * Remove um domínio do Apache
 * Mantém certificados emitidos; use `sudo certbot delete --cert-name <domínio>` manualmente se desejar removê-los.
 */
export async function removeDomain(serverName: string): Promise<void> {
  logger.info('removeDomain', `Iniciando remoção de domínio: ${serverName}`);

  // Log do usuário que está executando
  try {
    const whoami = await execCommand('whoami');
    const canSudo = await execCommand('sudo -n true 2>&1 && echo "yes" || echo "no"');
    logger.info('removeDomain', 'Informações do usuário', {
      user: whoami.stdout.trim(),
      canSudoWithoutPassword: canSudo.stdout.trim(),
    });
  } catch (error) {
    logger.warn('removeDomain', 'Não foi possível verificar usuário/sudo', { error });
  }

  // Validar domínio antes de processar
  if (!validateDomain(serverName)) {
    logger.error('removeDomain', 'Domínio inválido', { serverName });
    throw new Error('Domínio inválido');
  }

  // Escapar todos os caracteres especiais de regex, não apenas pontos
  const sanitizedName = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let removed = false;
  const removedFiles: string[] = [];

  const removeFromFile = async (filePath: string) => {
    if (!existsSync(filePath)) {
      logger.debug('removeFromFile', `Arquivo não existe: ${filePath}`);
      return;
    }

    // Verificar permissões do arquivo
    try {
      const stats = await execCommand(`ls -la ${escapeShellArg(filePath)}`);
      logger.debug('removeFromFile', 'Permissões do arquivo', {
        filePath,
        permissions: stats.stdout.trim(),
      });
    } catch (error) {
      logger.warn('removeFromFile', 'Não foi possível verificar permissões', { filePath, error });
    }

    const content = readFileSync(filePath, 'utf-8');
    logger.debug('removeFromFile', `Lendo arquivo: ${filePath}`, { contentLength: content.length });

    const blockRegex = /<VirtualHost[^>]*>[\s\S]*?<\/VirtualHost>/gi;
    const serverNameRegex = new RegExp(`^\\s*ServerName\\s+${sanitizedName}(?:\\s|$)`, 'im');

    logger.debug('removeFromFile', 'Regex pattern', {
      blockPattern: blockRegex.source,
      serverNamePattern: serverNameRegex.source,
    });

    const blocksToRemove: Array<{ block: string; start: number; end: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(content)) !== null) {
      const block = match[0];
      if (serverNameRegex.test(block)) {
        blocksToRemove.push({
          block,
          start: match.index,
          end: match.index + block.length,
        });
      }
    }

    if (blocksToRemove.length > 0) {
      logger.info('removeFromFile', `Encontrado ${blocksToRemove.length} bloco(s) VirtualHost para remover`, {
        filePath,
        matches: blocksToRemove.map(({ block }) => ({
          preview: block.substring(0, 200) + '...',
          length: block.length,
        })),
      });
    }

    let cursor = 0;
    const newContentParts: string[] = [];

    for (const { start, end } of blocksToRemove) {
      newContentParts.push(content.slice(cursor, start));
      cursor = end;
    }
    newContentParts.push(content.slice(cursor));

    const newContent = newContentParts.join('');

    if (newContent !== content) {
      // Log da operação de arquivo
      logger.fileOperation('removeFromFile', filePath, content, newContent);

      await writeProtectedFile(filePath, newContent);
      removed = true;
      removedFiles.push(filePath);
      logger.info('removeFromFile', `Domínio removido de: ${filePath}`, {
        bytesRemoved: content.length - newContent.length,
      });
    } else {
      logger.warn('removeFromFile', `Domínio não encontrado em: ${filePath}`);
    }
  };

  // Remover de ambos os arquivos primeiro
  await removeFromFile(VHOST_HTTP_PATH);
  await removeFromFile(VHOST_HTTPS_PATH);

  if (!removed) {
    logger.error('removeDomain', 'Domínio não encontrado em nenhum arquivo', { serverName });
    throw new Error('Domínio não encontrado');
  }

  logger.info('removeDomain', 'Domínio removido dos arquivos', { removedFiles });

  // Testar configuração após remover de AMBOS os arquivos
  logger.info('removeDomain', 'Testando configuração Apache...');

  // Primeiro, verificar se apachectl tem permissão para ler os arquivos
  try {
    const httpCheck = await execCommand(`sudo test -r ${VHOST_HTTP_PATH} && echo "readable" || echo "not readable"`);
    const httpsCheck = await execCommand(`sudo test -r ${VHOST_HTTPS_PATH} && echo "readable" || echo "not readable"`);
    logger.debug('removeDomain', 'Verificação de leitura dos arquivos', {
      http: httpCheck.stdout.trim(),
      https: httpsCheck.stdout.trim(),
    });
  } catch (error) {
    logger.warn('removeDomain', 'Não foi possível verificar leitura dos arquivos', { error });
  }

  try {
    logger.debug('removeDomain', 'Executando apachectl configtest');
    await execCommand('apachectl configtest');
    logger.info('removeDomain', 'Configuração Apache válida');
  } catch (error: any) {
    // Verificar se o erro é apenas sobre certificado SSL ausente
    const errorMsg = error.message || '';
    const stdout = error.stdout || '';
    const stderr = error.stderr || '';

    logger.warn('removeDomain', 'apachectl configtest falhou', {
      errorMsg,
      stdout,
      stderr,
      exitCode: error.exitCode,
    });

    const isSSLCertError = errorMsg.includes('SSLCertificateFile') ||
                          errorMsg.includes('does not exist or is empty') ||
                          errorMsg.includes('/etc/letsencrypt/') ||
                          stderr.includes('SSLCertificateFile');

    if (isSSLCertError) {
      // Erro de certificado SSL - pode ser ignorado durante remoção
      logger.warn('removeDomain', 'Erro de certificado SSL detectado (será ignorado)', {
        error: errorMsg,
        reason: 'Certificado pode ter sido removido mas bloco ainda existe em outro arquivo',
      });
    } else {
      // Erro crítico de sintaxe - propagar
      logger.error('removeDomain', 'Erro crítico na configuração Apache', { error: errorMsg });
      throw error;
    }
  }

  // Recarregar Apache
  logger.debug('removeDomain', 'Recarregando Apache');
  await execCommand('sudo systemctl reload httpd');
  logger.info('removeDomain', `Remoção concluída com sucesso: ${serverName}`);
}

/**
 * Atualiza um domínio existente
 */
export async function updateDomain(serverName: string, dto: UpdateDomainDto): Promise<void> {
  // Validar domínio
  if (!validateDomain(serverName)) {
    throw new Error('Domínio inválido');
  }

  // Validar porta se fornecida
  if (dto.port !== undefined) {
    if (dto.port < 1 || dto.port > 65535) {
      throw new Error('Porta inválida: deve estar entre 1 e 65535');
    }
    if (dto.port < 1024) {
      throw new Error('Porta inválida: portas abaixo de 1024 são reservadas');
    }
  }

  // Validar documentRoot se fornecido
  if (dto.documentRoot !== undefined && !validateDocumentRoot(dto.documentRoot)) {
    throw new Error('DocumentRoot inválido: deve ser um caminho absoluto e não pode acessar diretórios sensíveis do sistema');
  }

  if (!existsSync(VHOST_HTTP_PATH)) {
    throw new Error('Arquivo de configuração não encontrado');
  }

  const content = readFileSync(VHOST_HTTP_PATH, 'utf-8');

  let newContent = content;

  // Escapar caracteres especiais de regex no serverName
  const sanitizedName = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  if (dto.port !== undefined) {
    // Atualizar porta (domínio Node)
    newContent = newContent.replace(
      new RegExp(`(ServerName ${sanitizedName}[\\s\\S]*?ProxyPass \\/[^:]+:)(\\d+)`, 'i'),
      `$1${dto.port}`
    );
    newContent = newContent.replace(
      new RegExp(`(ServerName ${sanitizedName}[\\s\\S]*?ProxyPassReverse \\/[^:]+:)(\\d+)`, 'i'),
      `$1${dto.port}`
    );
  }

  if (dto.documentRoot !== undefined) {
    // Atualizar DocumentRoot (domínio Static)
    newContent = newContent.replace(
      new RegExp(`(ServerName ${sanitizedName}[\\s\\S]*?DocumentRoot )([^\\n]+)`, 'i'),
      `$1${dto.documentRoot}`
    );
    newContent = newContent.replace(
      new RegExp(`(ServerName ${sanitizedName}[\\s\\S]*?<Directory ")([^"]+)`, 'i'),
      `$1${dto.documentRoot}`
    );
  }

  if (newContent === content) {
    throw new Error('Nenhuma alteração detectada ou domínio não encontrado');
  }

  await writeProtectedFile(VHOST_HTTP_PATH, newContent);

  // Testar configuração
  await execCommand('apachectl configtest');

  // Recarregar Apache
  await execCommand('sudo systemctl reload httpd');
}

/**
 * Obtém certificado SSL para um domínio
 */
export async function obtainSSL(domain: string): Promise<void> {
  if (!validateDomain(domain)) {
    throw new Error('Domínio inválido');
  }

  // Executar certbot com escape seguro
  const escapedDomain = escapeShellArg(domain);
  await execCommand(`sudo certbot --apache -d ${escapedDomain} --non-interactive --agree-tos --redirect`);
}

/**
 * Renova certificado SSL para um domínio
 */
export async function renewSSL(domain: string): Promise<void> {
  if (!validateDomain(domain)) {
    throw new Error('Domínio inválido');
  }

  // Renovar certificado específico com escape seguro
  const escapedDomain = escapeShellArg(domain);
  await execCommand(`sudo certbot renew --cert-name ${escapedDomain}`);
}

/**
 * Substitui arquivo de configuração com validação
 */
export async function replaceConfigFile(type: 'http' | 'https', content: string): Promise<{ message: string; validationOutput: string }> {
  const filePath = type === 'http' ? VHOST_HTTP_PATH : VHOST_HTTPS_PATH;
  const backupPath = `${filePath}.backup.${Date.now()}`;
  const tempPath = `/tmp/vhost-upload-${Date.now()}.conf`;
  const normalizedIncoming = content.replace(/\r\n/g, '\n');
  let previousContent: string | null = null;
  let normalizedPrevious: string | null = null;

  // Se o arquivo atual já existe, compara conteúdo para evitar trabalho desnecessário
  if (existsSync(filePath)) {
    try {
      previousContent = readFileSync(filePath, 'utf-8');
      normalizedPrevious = previousContent.replace(/\r\n/g, '\n');

      if (normalizedPrevious === normalizedIncoming) {
        logger.info('replaceConfigFile', 'Upload ignorado: conteúdo idêntico ao arquivo existente', { filePath });
        return {
          message: 'Nenhuma alteração detectada; arquivo mantido como está.',
          validationOutput: 'Upload ignorado porque o conteúdo é idêntico ao arquivo atual.',
        };
      }
    } catch (error) {
      logger.warn('replaceConfigFile', 'Não foi possível ler arquivo atual para comparação', { error });
    }
  }

  // Validação básica: verificar se contém tags VirtualHost
  if (!content.includes('<VirtualHost') || !content.includes('</VirtualHost>')) {
    throw new Error('Arquivo inválido: deve conter pelo menos um bloco <VirtualHost>');
  }

  // Escrever conteúdo em arquivo temporário (não precisa de sudo)
  try {
    writeFileSync(tempPath, content, 'utf-8');
    logger.debug('replaceConfigFile', `Arquivo temporário criado: ${tempPath}`);
  } catch (error) {
    logger.error('replaceConfigFile', 'Falha ao criar arquivo temporário', { error });
    throw new Error(`Falha ao criar arquivo temporário: ${error}`);
  }

  // Fazer backup do arquivo atual se existir
  if (existsSync(filePath)) {
    try {
      await execCommand(`sudo cp ${filePath} ${backupPath}`);
      logger.info('replaceConfigFile', `Backup criado: ${backupPath}`);
    } catch (error) {
      // Limpar arquivo temporário
      try { await execCommand(`rm -f ${tempPath}`); } catch {}
      logger.error('replaceConfigFile', 'Falha ao criar backup', { error });
      throw new Error(`Falha ao criar backup: ${error}`);
    }
  }

  // Copiar arquivo temporário para o destino final (com sudo)
  try {
    await execCommand(`sudo cp ${tempPath} ${filePath}`);
    await execCommand(`sudo chmod 644 ${filePath}`);
    logger.info('replaceConfigFile', `Arquivo copiado para: ${filePath}`);
    logger.fileOperation('replaceConfigFile', filePath, previousContent ?? '', content);
  } catch (error) {
    // Limpar arquivo temporário
    try { await execCommand(`rm -f ${tempPath}`); } catch {}
    logger.error('replaceConfigFile', 'Falha ao copiar arquivo', { error });
    throw new Error(`Falha ao copiar arquivo: ${error}`);
  }

  // Validar configuração com apachectl configtest
  let validationOutput = '';
  let isValid = false;

  try {
    const result = await execCommand('apachectl configtest 2>&1');
    validationOutput = result.stdout + result.stderr;
  } catch (error: any) {
    // apachectl configtest pode retornar exit code != 0 mesmo com warnings
    // O importante é verificar se tem "Syntax OK" na saída
    const stdout = error?.stdout || '';
    const stderr = error?.stderr || '';
    validationOutput = stdout + stderr;
  }

  logger.debug('replaceConfigFile', 'apachectl configtest output', { validationOutput });

  // Verificar se a saída contém "Syntax OK"
  isValid = validationOutput.includes('Syntax OK');

  if (!isValid) {
    // Salvar arquivo com erro para inspeção
    const errorPath = `${filePath}.error`;
    try {
      await execCommand(`sudo cp ${filePath} ${errorPath}`);
      logger.warn('replaceConfigFile', `Arquivo com erro salvo em: ${errorPath}`);
    } catch (saveError) {
      logger.error('replaceConfigFile', 'Erro ao salvar arquivo com erro', { saveError });
    }

    // Restaurar backup em caso de erro
    if (existsSync(backupPath)) {
      try {
        await execCommand(`sudo cp ${backupPath} ${filePath}`);
        logger.info('replaceConfigFile', 'Backup restaurado devido a erro de validação');
      } catch (restoreError) {
        logger.error('replaceConfigFile', 'Erro ao restaurar backup', { restoreError });
      }
    }
    // Limpar arquivo temporário
    try { await execCommand(`rm -f ${tempPath}`); } catch {}
    logger.error('replaceConfigFile', 'Validação falhou', { validationOutput, errorPath });
    throw new Error(`Validação falhou: ${validationOutput}\n\nArquivo com erro salvo em: ${errorPath}`);
  }

  // Se chegou aqui, validação passou - recarregar Apache
  try {
    await execCommand('sudo systemctl reload httpd');
    logger.info('replaceConfigFile', 'Apache recarregado com sucesso');
  } catch (error: any) {
    // Restaurar backup se reload falhar
    if (existsSync(backupPath)) {
      try {
        await execCommand(`sudo cp ${backupPath} ${filePath}`);
        await execCommand('sudo systemctl reload httpd'); // tentar recarregar com backup
        logger.info('replaceConfigFile', 'Backup restaurado devido a erro no reload');
      } catch (restoreError) {
        logger.error('replaceConfigFile', 'Erro ao restaurar backup', { restoreError });
      }
    }
    // Limpar arquivo temporário
    try { await execCommand(`rm -f ${tempPath}`); } catch {}
    logger.error('replaceConfigFile', 'Falha ao recarregar Apache', { error: error.message || error });
    throw new Error(`Falha ao recarregar Apache: ${error.message || error}`);
  }

  // Limpar arquivo temporário
  try {
    await execCommand(`rm -f ${tempPath}`);
    logger.debug('replaceConfigFile', 'Arquivo temporário removido');
  } catch (error) {
    logger.warn('replaceConfigFile', 'Não foi possível remover arquivo temporário', { tempPath });
  }

  // Retornar sucesso com output da validação
  return {
    message: 'Arquivo substituído e Apache recarregado com sucesso',
    validationOutput: validationOutput
  };
}

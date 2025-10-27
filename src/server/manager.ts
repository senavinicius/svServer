import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CreateDomainDTO, UpdateDomainDto } from '../shared/types.js';

const execAsync = promisify(exec);

const VHOST_HTTP_PATH = '/etc/httpd/conf.d/vhost.conf';
const VHOST_HTTPS_PATH = '/etc/httpd/conf.d/vhost-le-ssl.conf';

interface ExecResult {
  stdout: string;
  stderr: string;
}

async function execCommand(command: string): Promise<ExecResult> {
  try {
    return await execAsync(command, { maxBuffer: 1024 * 1024 });
  } catch (error: any) {
    const stdout = error.stdout ?? '';
    const stderr = error.stderr ?? '';
    const messageParts = [
      `Comando falhou: ${command}`,
      stdout.trim() ? `STDOUT:\n${stdout.trim()}` : null,
      stderr.trim() ? `STDERR:\n${stderr.trim()}` : null,
    ].filter(Boolean);

    const wrapped = new Error(messageParts.join('\n\n') || `Comando falhou: ${command}`);
    (wrapped as any).stdout = stdout;
    (wrapped as any).stderr = stderr;
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
  // Validar domínio
  if (!validateDomain(dto.serverName)) {
    throw new Error('Domínio inválido');
  }

  // Validar parâmetros por tipo
  if (dto.type === 'node' && !dto.port) {
    throw new Error('Porta é obrigatória para domínios Node');
  }

  if (dto.type === 'static' && !dto.documentRoot) {
    throw new Error('DocumentRoot é obrigatório para domínios Static');
  }

  // Validar documentRoot se fornecido
  if (dto.type === 'static' && dto.documentRoot && !validateDocumentRoot(dto.documentRoot)) {
    throw new Error('DocumentRoot inválido: deve ser um caminho absoluto e não pode acessar diretórios sensíveis do sistema');
  }

  // Validar porta se fornecida
  if (dto.type === 'node' && dto.port) {
    if (dto.port < 1 || dto.port > 65535) {
      throw new Error('Porta inválida: deve estar entre 1 e 65535');
    }
    // Portas reservadas do sistema
    if (dto.port < 1024) {
      throw new Error('Porta inválida: portas abaixo de 1024 são reservadas');
    }
  }

  // Gerar configuração
  let vhostConfig: string;
  if (dto.type === 'node') {
    vhostConfig = generateNodeVirtualHost(dto.serverName, dto.port!);
  } else {
    vhostConfig = generateStaticVirtualHost(dto.serverName, dto.documentRoot!);
  }

  // Adicionar ao arquivo de configuração
  const currentConfig = existsSync(VHOST_HTTP_PATH) ? readFileSync(VHOST_HTTP_PATH, 'utf-8') : '';
  const newConfig = currentConfig + '\n' + vhostConfig;
  await writeProtectedFile(VHOST_HTTP_PATH, newConfig);

  // Testar configuração
  await execCommand('apachectl configtest');

  // Recarregar Apache
  await execCommand('sudo systemctl reload httpd');

  // Obter SSL automaticamente
  await obtainSSL(dto.serverName);
}

/**
 * Remove um domínio do Apache
 * Mantém certificados emitidos; use `sudo certbot delete --cert-name <domínio>` manualmente se desejar removê-los.
 */
export async function removeDomain(serverName: string): Promise<void> {
  // Validar domínio antes de processar
  if (!validateDomain(serverName)) {
    throw new Error('Domínio inválido');
  }

  // Escapar todos os caracteres especiais de regex, não apenas pontos
  const sanitizedName = serverName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let removed = false;

  const removeFromFile = async (filePath: string) => {
    if (!existsSync(filePath)) {
      return;
    }

    const content = readFileSync(filePath, 'utf-8');
    const vhostRegex = new RegExp(
      `<VirtualHost[^>]*>[\\s\\S]*?ServerName ${sanitizedName}[\\s\\S]*?<\\/VirtualHost>`,
      'gi'
    );

    const newContent = content.replace(vhostRegex, '');

    if (newContent !== content) {
      await writeProtectedFile(filePath, newContent);
      removed = true;
    }
  };

  await removeFromFile(VHOST_HTTP_PATH);
  await removeFromFile(VHOST_HTTPS_PATH);

  if (!removed) {
    throw new Error('Domínio não encontrado');
  }

  // Testar configuração
  await execCommand('apachectl configtest');

  // Recarregar Apache
  await execCommand('sudo systemctl reload httpd');
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

  // Validação básica: verificar se contém tags VirtualHost
  if (!content.includes('<VirtualHost') || !content.includes('</VirtualHost>')) {
    throw new Error('Arquivo inválido: deve conter pelo menos um bloco <VirtualHost>');
  }

  // Escrever conteúdo em arquivo temporário (não precisa de sudo)
  try {
    writeFileSync(tempPath, content, 'utf-8');
    console.log(`Arquivo temporário criado: ${tempPath}`);
  } catch (error) {
    throw new Error(`Falha ao criar arquivo temporário: ${error}`);
  }

  // Fazer backup do arquivo atual se existir
  if (existsSync(filePath)) {
    try {
      await execCommand(`sudo cp ${filePath} ${backupPath}`);
      console.log(`Backup criado: ${backupPath}`);
    } catch (error) {
      // Limpar arquivo temporário
      try { await execCommand(`rm -f ${tempPath}`); } catch {}
      throw new Error(`Falha ao criar backup: ${error}`);
    }
  }

  // Copiar arquivo temporário para o destino final (com sudo)
  try {
    await execCommand(`sudo cp ${tempPath} ${filePath}`);
    await execCommand(`sudo chmod 644 ${filePath}`);
    console.log(`Arquivo copiado para: ${filePath}`);
  } catch (error) {
    // Limpar arquivo temporário
    try { await execCommand(`rm -f ${tempPath}`); } catch {}
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

  console.log('apachectl configtest output:', validationOutput);

  // Verificar se a saída contém "Syntax OK"
  isValid = validationOutput.includes('Syntax OK');

  if (!isValid) {
    // Salvar arquivo com erro para inspeção
    const errorPath = `${filePath}.error`;
    try {
      await execCommand(`sudo cp ${filePath} ${errorPath}`);
      console.log(`Arquivo com erro salvo em: ${errorPath}`);
    } catch (saveError) {
      console.error('Erro ao salvar arquivo com erro:', saveError);
    }

    // Restaurar backup em caso de erro
    if (existsSync(backupPath)) {
      try {
        await execCommand(`sudo cp ${backupPath} ${filePath}`);
        console.log(`Backup restaurado devido a erro de validação`);
      } catch (restoreError) {
        console.error('Erro ao restaurar backup:', restoreError);
      }
    }
    // Limpar arquivo temporário
    try { await execCommand(`rm -f ${tempPath}`); } catch {}
    throw new Error(`Validação falhou: ${validationOutput}\n\nArquivo com erro salvo em: ${errorPath}`);
  }

  // Se chegou aqui, validação passou - recarregar Apache
  try {
    await execCommand('sudo systemctl reload httpd');
    console.log('Apache recarregado com sucesso');
  } catch (error: any) {
    // Restaurar backup se reload falhar
    if (existsSync(backupPath)) {
      try {
        await execCommand(`sudo cp ${backupPath} ${filePath}`);
        await execCommand('sudo systemctl reload httpd'); // tentar recarregar com backup
        console.log(`Backup restaurado devido a erro no reload`);
      } catch (restoreError) {
        console.error('Erro ao restaurar backup:', restoreError);
      }
    }
    // Limpar arquivo temporário
    try { await execCommand(`rm -f ${tempPath}`); } catch {}
    throw new Error(`Falha ao recarregar Apache: ${error.message || error}`);
  }

  // Limpar arquivo temporário
  try {
    await execCommand(`rm -f ${tempPath}`);
    console.log('Arquivo temporário removido');
  } catch (error) {
    console.warn('Aviso: não foi possível remover arquivo temporário:', tempPath);
  }

  // Retornar sucesso com output da validação
  return {
    message: 'Arquivo substituído e Apache recarregado com sucesso',
    validationOutput: validationOutput
  };
}

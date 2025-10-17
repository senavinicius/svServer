import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CreateDomainDTO, UpdateDomainDto } from '../shared/types.js';

const execAsync = promisify(exec);

const VHOST_HTTP_PATH = '/etc/httpd/conf.d/vhost.conf';
const VHOST_HTTPS_PATH = '/etc/httpd/conf.d/vhost-le-ssl.conf';

/**
 * Valida um nome de domínio
 */
export function validateDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return domainRegex.test(domain);
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
  writeFileSync(VHOST_HTTP_PATH, newConfig, 'utf-8');

  // Testar configuração
  await execAsync('apachectl configtest');

  // Recarregar Apache
  await execAsync('sudo systemctl reload httpd');
}

/**
 * Remove um domínio do Apache
 */
export async function removeDomain(serverName: string): Promise<void> {
  if (!existsSync(VHOST_HTTP_PATH)) {
    throw new Error('Arquivo de configuração não encontrado');
  }

  const content = readFileSync(VHOST_HTTP_PATH, 'utf-8');

  // Remover o bloco VirtualHost correspondente
  const vhostRegex = new RegExp(
    `<VirtualHost[^>]*>[\\s\\S]*?ServerName ${serverName.replace('.', '\\.')}[\\s\\S]*?<\\/VirtualHost>`,
    'gi'
  );

  const newContent = content.replace(vhostRegex, '');

  if (newContent === content) {
    throw new Error('Domínio não encontrado');
  }

  writeFileSync(VHOST_HTTP_PATH, newContent, 'utf-8');

  // Testar configuração
  await execAsync('apachectl configtest');

  // Recarregar Apache
  await execAsync('sudo systemctl reload httpd');
}

/**
 * Atualiza um domínio existente
 */
export async function updateDomain(serverName: string, dto: UpdateDomainDto): Promise<void> {
  if (!existsSync(VHOST_HTTP_PATH)) {
    throw new Error('Arquivo de configuração não encontrado');
  }

  const content = readFileSync(VHOST_HTTP_PATH, 'utf-8');

  let newContent = content;

  if (dto.port !== undefined) {
    // Atualizar porta (domínio Node)
    newContent = newContent.replace(
      new RegExp(`(ServerName ${serverName.replace('.', '\\.')}[\\s\\S]*?ProxyPass \\/[^:]+:)(\\d+)`, 'i'),
      `$1${dto.port}`
    );
    newContent = newContent.replace(
      new RegExp(`(ServerName ${serverName.replace('.', '\\.')}[\\s\\S]*?ProxyPassReverse \\/[^:]+:)(\\d+)`, 'i'),
      `$1${dto.port}`
    );
  }

  if (dto.documentRoot !== undefined) {
    // Atualizar DocumentRoot (domínio Static)
    newContent = newContent.replace(
      new RegExp(`(ServerName ${serverName.replace('.', '\\.')}[\\s\\S]*?DocumentRoot )([^\\n]+)`, 'i'),
      `$1${dto.documentRoot}`
    );
    newContent = newContent.replace(
      new RegExp(`(ServerName ${serverName.replace('.', '\\.')}[\\s\\S]*?<Directory ")([^"]+)`, 'i'),
      `$1${dto.documentRoot}`
    );
  }

  if (newContent === content) {
    throw new Error('Nenhuma alteração detectada ou domínio não encontrado');
  }

  writeFileSync(VHOST_HTTP_PATH, newContent, 'utf-8');

  // Testar configuração
  await execAsync('apachectl configtest');

  // Recarregar Apache
  await execAsync('sudo systemctl reload httpd');
}

/**
 * Obtém certificado SSL para um domínio
 */
export async function obtainSSL(domain: string): Promise<void> {
  if (!validateDomain(domain)) {
    throw new Error('Domínio inválido');
  }

  // Executar certbot
  await execAsync(`sudo certbot --apache -d ${domain} --non-interactive --agree-tos --redirect`);
}

/**
 * Renova certificado SSL para um domínio
 */
export async function renewSSL(domain: string): Promise<void> {
  if (!validateDomain(domain)) {
    throw new Error('Domínio inválido');
  }

  // Renovar certificado específico
  await execAsync(`sudo certbot renew --cert-name ${domain}`);
}

/**
 * Substitui arquivo de configuração com validação
 */
export async function replaceConfigFile(type: 'http' | 'https', content: string): Promise<void> {
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
      await execAsync(`sudo cp ${filePath} ${backupPath}`);
      console.log(`Backup criado: ${backupPath}`);
    } catch (error) {
      // Limpar arquivo temporário
      try { await execAsync(`rm -f ${tempPath}`); } catch {}
      throw new Error(`Falha ao criar backup: ${error}`);
    }
  }

  // Copiar arquivo temporário para o destino final (com sudo)
  try {
    await execAsync(`sudo cp ${tempPath} ${filePath}`);
    await execAsync(`sudo chmod 644 ${filePath}`);
    console.log(`Arquivo copiado para: ${filePath}`);
  } catch (error) {
    // Limpar arquivo temporário
    try { await execAsync(`rm -f ${tempPath}`); } catch {}
    throw new Error(`Falha ao copiar arquivo: ${error}`);
  }

  // Validar configuração com apachectl configtest
  try {
    const { stdout, stderr } = await execAsync('apachectl configtest 2>&1');
    console.log('apachectl configtest output:', stdout || stderr);

    // Verificar se a saída indica sucesso (Syntax OK)
    const output = stdout + stderr;
    if (!output.includes('Syntax OK')) {
      throw new Error(`Configuração inválida: ${output}`);
    }
  } catch (error: any) {
    // Restaurar backup em caso de erro
    if (existsSync(backupPath)) {
      try {
        await execAsync(`sudo cp ${backupPath} ${filePath}`);
        console.log(`Backup restaurado devido a erro de validação`);
      } catch (restoreError) {
        console.error('Erro ao restaurar backup:', restoreError);
      }
    }
    // Limpar arquivo temporário
    try { await execAsync(`rm -f ${tempPath}`); } catch {}
    throw new Error(`Validação falhou: ${error.message || error}`);
  }

  // Se chegou aqui, tudo OK - recarregar Apache
  try {
    await execAsync('sudo systemctl reload httpd');
    console.log('Apache recarregado com sucesso');
  } catch (error: any) {
    // Restaurar backup se reload falhar
    if (existsSync(backupPath)) {
      try {
        await execAsync(`sudo cp ${backupPath} ${filePath}`);
        await execAsync('sudo systemctl reload httpd'); // tentar recarregar com backup
        console.log(`Backup restaurado devido a erro no reload`);
      } catch (restoreError) {
        console.error('Erro ao restaurar backup:', restoreError);
      }
    }
    // Limpar arquivo temporário
    try { await execAsync(`rm -f ${tempPath}`); } catch {}
    throw new Error(`Falha ao recarregar Apache: ${error.message || error}`);
  }

  // Limpar arquivo temporário
  try {
    await execAsync(`rm -f ${tempPath}`);
    console.log('Arquivo temporário removido');
  } catch (error) {
    console.warn('Aviso: não foi possível remover arquivo temporário:', tempPath);
  }
}

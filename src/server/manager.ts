import { readFileSync, writeFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { CreateDomainDto, UpdateDomainDto } from '../shared/types.js';
import { isDevelopmentMode, mockDelay } from './mock-data.js';

const execAsync = promisify(exec);

const VHOST_HTTP_PATH = '/etc/httpd/conf.d/vhost.conf';

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
export async function addDomain(dto: CreateDomainDto): Promise<void> {
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

  // Modo de desenvolvimento: simula operação
  if (isDevelopmentMode()) {
    console.log('🔧 Development mode: simulando addDomain', dto);
    await mockDelay();
    return;
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
  // Modo de desenvolvimento: simula operação
  if (isDevelopmentMode()) {
    console.log('🔧 Development mode: simulando removeDomain', serverName);
    await mockDelay();
    return;
  }

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
  // Modo de desenvolvimento: simula operação
  if (isDevelopmentMode()) {
    console.log('🔧 Development mode: simulando updateDomain', serverName, dto);
    await mockDelay();
    return;
  }

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

  // Modo de desenvolvimento: simula operação
  if (isDevelopmentMode()) {
    console.log('🔧 Development mode: simulando obtainSSL', domain);
    await mockDelay(1500); // SSL demora mais
    return;
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

  // Modo de desenvolvimento: simula operação
  if (isDevelopmentMode()) {
    console.log('🔧 Development mode: simulando renewSSL', domain);
    await mockDelay(1500); // SSL demora mais
    return;
  }

  // Renovar certificado específico
  await execAsync(`sudo certbot renew --cert-name ${domain}`);
}

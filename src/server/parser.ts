import { readFileSync, existsSync } from 'fs';
import type { VirtualHost, DomainType, SSLInfo } from '../shared/types.js';
import { createHash } from 'crypto';

const VHOST_HTTP_PATH = '/etc/httpd/conf.d/vhost.conf';
const VHOST_HTTPS_PATH = '/etc/httpd/conf.d/vhost-le-ssl.conf';
const LETSENCRYPT_RENEWAL_PATH = '/etc/letsencrypt/renewal';

/**
 * Parseia um arquivo de configuração do Apache e extrai todos os VirtualHosts
 */
export function parseApacheConfig(configPath: string): VirtualHost[] {
  if (!existsSync(configPath)) {
    return [];
  }

  const content = readFileSync(configPath, 'utf-8');
  const vhosts: VirtualHost[] = [];

  // Regex para extrair blocos <VirtualHost>...</VirtualHost>
  const vhostRegex = /<VirtualHost[^>]*>([\s\S]*?)<\/VirtualHost>/gi;
  let match;

  while ((match = vhostRegex.exec(content)) !== null) {
    const vhostBlock = match[1];
    const rawConfig = match[0];

    const serverName = extractDirective(vhostBlock, 'ServerName');
    if (!serverName) continue; // Ignora VirtualHosts sem ServerName

    const vhost = parseVirtualHost(serverName, vhostBlock, rawConfig);
    if (vhost) {
      vhosts.push(vhost);
    }
  }

  return vhosts;
}

/**
 * Parseia um bloco VirtualHost individual
 */
function parseVirtualHost(serverName: string, block: string, rawConfig: string): VirtualHost | null {
  const type = detectDomainType(block);
  const port = extractProxyPort(block);
  const documentRoot = extractDirective(block, 'DocumentRoot');
  const errorLog = extractDirective(block, 'ErrorLog');
  const accessLog = extractDirective(block, 'CustomLog')?.split(' ')[0];

  const { isSubdomain, parentDomain } = analyzeServerName(serverName);

  // Gerar ID único baseado no ServerName
  const id = createHash('md5').update(serverName).digest('hex').substring(0, 8);

  return {
    id,
    serverName,
    type,
    port,
    documentRoot,
    errorLog,
    accessLog,
    isSubdomain,
    parentDomain,
    ssl: { enabled: false, status: 'none' }, // Será atualizado depois
    rawConfig,
  };
}

/**
 * Detecta o tipo de domínio baseado no conteúdo do VirtualHost
 */
function detectDomainType(block: string): DomainType {
  // Node: tem ProxyPass
  if (/ProxyPass/i.test(block)) {
    return 'node';
  }

  // PHP: tem handlers PHP ou módulos PHP
  if (/AddHandler.*php|SetHandler.*php|php_/i.test(block)) {
    return 'php';
  }

  // Static: tem DocumentRoot mas não é PHP
  if (/DocumentRoot/i.test(block)) {
    return 'static';
  }

  return 'static'; // fallback
}

/**
 * Extrai a porta do ProxyPass
 */
function extractProxyPort(block: string): number | undefined {
  const match = block.match(/ProxyPass\s+\/\s+http:\/\/127\.0\.0\.1:(\d+)/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/**
 * Extrai uma diretiva do Apache
 */
function extractDirective(block: string, directive: string): string | undefined {
  const regex = new RegExp(`${directive}\\s+(.+)`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : undefined;
}

/**
 * Analisa se é subdomínio e qual é o domínio pai
 */
function analyzeServerName(serverName: string): { isSubdomain: boolean; parentDomain?: string } {
  const parts = serverName.split('.');

  if (parts.length > 2) {
    // É um subdomínio (ex: api.example.com)
    const parentDomain = parts.slice(-2).join('.');
    return { isSubdomain: true, parentDomain };
  }

  return { isSubdomain: false };
}

/**
 * Lê informações SSL do certbot
 */
export async function loadSSLInfo(): Promise<Map<string, SSLInfo>> {
  const sslMap = new Map<string, SSLInfo>();

  if (!existsSync(LETSENCRYPT_RENEWAL_PATH)) {
    return sslMap;
  }

  // Ler arquivos .conf do diretório renewal
  const { readdirSync } = await import('fs');
  const files = readdirSync(LETSENCRYPT_RENEWAL_PATH).filter(f => f.endsWith('.conf'));

  for (const file of files) {
    const domain = file.replace('.conf', '');
    const filePath = `${LETSENCRYPT_RENEWAL_PATH}/${file}`;
    const content = readFileSync(filePath, 'utf-8');

    // Extrair data de expiração
    const match = content.match(/expiry_date\s*=\s*(.+)/);
    if (match) {
      const expiresAt = new Date(match[1].trim()).toISOString();
      const daysUntilExpiry = Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      let status: SSLInfo['status'] = 'active';
      if (daysUntilExpiry < 0) {
        status = 'expired';
      } else if (daysUntilExpiry <= 7) {
        status = 'expiring';
      }

      sslMap.set(domain, {
        enabled: true,
        expiresAt,
        daysUntilExpiry,
        status,
      });
    }
  }

  return sslMap;
}

/**
 * Combina VirtualHosts HTTP e HTTPS, aplicando informações SSL
 */
export async function getAllVirtualHosts(): Promise<VirtualHost[]> {
  const httpVhosts = parseApacheConfig(VHOST_HTTP_PATH);
  const httpsVhosts = parseApacheConfig(VHOST_HTTPS_PATH);
  const sslInfo = await loadSSLInfo();

  // Criar mapa de domínios
  const vhostMap = new Map<string, VirtualHost>();

  // Adicionar HTTP vhosts
  for (const vhost of httpVhosts) {
    vhostMap.set(vhost.serverName, vhost);
  }

  // Merge com HTTPS vhosts (atualizar SSL info)
  for (const vhost of httpsVhosts) {
    if (vhostMap.has(vhost.serverName)) {
      // Atualizar info SSL
      const existing = vhostMap.get(vhost.serverName)!;
      existing.ssl = sslInfo.get(vhost.serverName) || { enabled: true, status: 'active' };
    } else {
      // Adicionar novo (caso raro: apenas HTTPS sem HTTP)
      vhost.ssl = sslInfo.get(vhost.serverName) || { enabled: true, status: 'active' };
      vhostMap.set(vhost.serverName, vhost);
    }
  }

  return Array.from(vhostMap.values());
}

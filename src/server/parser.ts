import { readFileSync, existsSync } from 'fs';
import type { VirtualHost, DomainType, SSLInfo } from '../shared/types.js';
import { createHash } from 'crypto';

const VHOST_HTTP_PATH = '/etc/httpd/conf.d/vhost.conf';
const VHOST_HTTPS_PATH = '/etc/httpd/conf.d/vhost-le-ssl.conf';
const LETSENCRYPT_RENEWAL_PATH = '/etc/letsencrypt/renewal';

/**
 * Representa um bloco VirtualHost parseado (antes de expandir por domínio)
 */
interface ParsedVHostBlock {
  rawConfig: string;
  domains: string[]; // ServerName + todos ServerAlias
  directives: Map<string, string[]>; // Diretiva -> valores
}

/**
 * Parseia um arquivo de configuração do Apache e extrai todos os VirtualHosts
 * Gera um VirtualHost por domínio (ServerName + cada ServerAlias)
 */
export function parseApacheConfig(configPath: string): VirtualHost[] {
  if (!existsSync(configPath)) {
    return [];
  }

  const content = readFileSync(configPath, 'utf-8');
  const blocks = extractVirtualHostBlocks(content);
  const vhosts: VirtualHost[] = [];

  for (const block of blocks) {
    // Se não há domínios, pula
    if (block.domains.length === 0) continue;

    // Domínio principal (primeiro encontrado, geralmente ServerName)
    const primaryDomain = block.domains[0];

    // Gerar um VirtualHost para cada domínio
    for (const domain of block.domains) {
      const vhost = createVirtualHost(domain, primaryDomain, block);
      if (vhost) {
        vhosts.push(vhost);
      }
    }
  }

  return vhosts;
}

/**
 * Extrai todos os blocos <VirtualHost>...</VirtualHost> do conteúdo
 */
function extractVirtualHostBlocks(content: string): ParsedVHostBlock[] {
  const blocks: ParsedVHostBlock[] = [];
  const vhostRegex = /<\s*VirtualHost\b([^>]*)>([\s\S]*?)<\/\s*VirtualHost\s*>/gi;
  let match;

  while ((match = vhostRegex.exec(content)) !== null) {
    const rawConfig = match[0]; // Bloco completo com tags
    const innerContent = match[2]; // Conteúdo interno (match[1] é o header, match[2] é o body)

    const directives = parseDirectives(innerContent);
    const domains = extractAllDomains(directives);

    blocks.push({
      rawConfig,
      domains,
      directives,
    });
  }

  return blocks;
}

/**
 * Parseia todas as diretivas de um bloco VirtualHost
 * Suporta:
 * - Comentários (#)
 * - Diretivas multi-linha
 * - Tabs e espaços variados
 * - Ordem arbitrária
 */
function parseDirectives(content: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  const lines = content.split('\n');

  let currentDirective: string | null = null;
  let currentValue = '';

  for (let line of lines) {
    // Remove comentários (preserva apenas a parte antes do #)
    const commentIndex = line.indexOf('#');
    if (commentIndex !== -1) {
      line = line.substring(0, commentIndex);
    }

    // Normaliza espaços
    line = line.trim();

    // Pula linhas vazias
    if (!line) {
      if (currentDirective && currentValue) {
        addDirective(directives, currentDirective, currentValue.trim());
        currentDirective = null;
        currentValue = '';
      }
      continue;
    }

    // Detecta início de diretiva (palavra no início da linha, suporta hífen)
    // Permite espaço opcional após o nome da diretiva
    // Ignora linhas que parecem ser continuações (começam com símbolos especiais)
    const directiveMatch = line.match(/^([A-Za-z][A-Za-z0-9_-]*)(?:\s+(.*))?$/);

    if (directiveMatch && !line.match(/^[%$@\[]/)) {
      // Finaliza diretiva anterior se houver
      if (currentDirective && currentValue) {
        addDirective(directives, currentDirective, currentValue.trim());
      }

      // Nova diretiva
      currentDirective = directiveMatch[1];
      currentValue = directiveMatch[2] || ''; // Pode ser undefined se não houver valor

      // Se não há valor ou não termina com \, salva já
      if (!currentValue || !currentValue.endsWith('\\')) {
        addDirective(directives, currentDirective, currentValue.trim());
        currentDirective = null;
        currentValue = '';
      } else {
        // Remove \ e continua
        currentValue = currentValue.slice(0, -1).trim() + ' ';
      }
    } else if (currentDirective) {
      // Continuação de diretiva multi-linha
      if (line.endsWith('\\')) {
        currentValue += line.slice(0, -1).trim() + ' ';
      } else {
        currentValue += line;
        addDirective(directives, currentDirective, currentValue.trim());
        currentDirective = null;
        currentValue = '';
      }
    }
  }

  // Finaliza última diretiva se houver
  if (currentDirective && currentValue) {
    addDirective(directives, currentDirective, currentValue.trim());
  }

  // Parse blocos aninhados (<Directory>, <Location>, <Proxy>, <IfModule>, etc.)
  // Isso garante que não perdemos diretivas importantes que estão dentro de blocos
  const nestedBlockRegex = /<([A-Za-z]+)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi;
  let nestedMatch;
  while ((nestedMatch = nestedBlockRegex.exec(content)) !== null) {
    const innerDirectives = parseDirectives(nestedMatch[2]);
    // Mescla as diretivas encontradas no bloco aninhado
    for (const [key, values] of innerDirectives) {
      for (const value of values) {
        addDirective(directives, key, value);
      }
    }
  }

  return directives;
}

/**
 * Adiciona uma diretiva ao mapa (suporta múltiplos valores)
 */
function addDirective(map: Map<string, string[]>, directive: string, value: string): void {
  const key = directive.toLowerCase();
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key)!.push(value);
}

/**
 * Extrai todos os domínios (ServerName + ServerAlias)
 */
function extractAllDomains(directives: Map<string, string[]>): string[] {
  const domains: string[] = [];

  // ServerName (pode ter apenas 1)
  const serverNames = directives.get('servername') || [];
  if (serverNames.length > 0) {
    domains.push(serverNames[0]);
  }

  // ServerAlias (pode ter múltiplos, separados por espaço)
  const serverAliases = directives.get('serveralias') || [];
  for (const aliasLine of serverAliases) {
    // Cada ServerAlias pode ter múltiplos domínios separados por espaço
    const aliases = aliasLine.split(/\s+/).filter(a => a.length > 0);
    domains.push(...aliases);
  }

  return domains;
}

/**
 * Cria um VirtualHost a partir de um domínio e bloco parseado
 */
function createVirtualHost(
  domain: string,
  primaryDomain: string,
  block: ParsedVHostBlock
): VirtualHost | null {
  const { directives, rawConfig } = block;

  const type = detectDomainType(directives);
  const port = extractProxyPort(directives);
  const documentRoot = getFirstDirective(directives, 'documentroot');
  const errorLog = getFirstDirective(directives, 'errorlog');
  const customLog = getFirstDirective(directives, 'customlog');
  const accessLog = customLog ? customLog.split(/\s+/)[0] : undefined;

  const { isSubdomain, parentDomain } = analyzeServerName(domain);

  // ID único baseado no domínio
  const id = createHash('md5').update(domain).digest('hex').substring(0, 8);

  // Detecta SSL no próprio bloco (certificados manuais ou Let's Encrypt)
  const hasSSL = directives.has('sslengine') ||
                 directives.has('sslcertificatefile') ||
                 directives.has('sslcertificatekeyfile');

  const sslEngine = getFirstDirective(directives, 'sslengine');
  const sslEnabled = hasSSL && (!sslEngine || sslEngine.toLowerCase() === 'on');

  return {
    id,
    serverName: domain,
    type,
    port,
    documentRoot,
    errorLog,
    accessLog,
    isSubdomain,
    parentDomain: parentDomain || (domain !== primaryDomain ? primaryDomain : undefined),
    ssl: sslEnabled ? { enabled: true, status: 'active' } : { enabled: false, status: 'none' },
    rawConfig,
  };
}

/**
 * Obtém o primeiro valor de uma diretiva
 */
function getFirstDirective(directives: Map<string, string[]>, name: string): string | undefined {
  const values = directives.get(name.toLowerCase());
  return values && values.length > 0 ? values[0] : undefined;
}

/**
 * Detecta o tipo de domínio baseado nas diretivas
 */
function detectDomainType(directives: Map<string, string[]>): DomainType {
  // Node: tem ProxyPass ou ProxyPassMatch
  if (directives.has('proxypass') || directives.has('proxypassmatch')) {
    return 'node';
  }

  // PHP: tem AddHandler/SetHandler com php ou diretivas php_*
  for (const [key, values] of directives) {
    if (key.startsWith('php_')) {
      return 'php';
    }
    if ((key === 'addhandler' || key === 'sethandler') &&
        values.some(v => /php/i.test(v))) {
      return 'php';
    }
  }

  // Static: tem DocumentRoot
  if (directives.has('documentroot')) {
    return 'static';
  }

  return 'static'; // fallback
}

/**
 * Extrai a porta do ProxyPass (suporta várias variações)
 */
function extractProxyPort(directives: Map<string, string[]>): number | undefined {
  // Combina ProxyPass e ProxyPassMatch
  const proxyLines = [
    ...(directives.get('proxypass') || []),
    ...(directives.get('proxypassmatch') || [])
  ];

  for (const proxyLine of proxyLines) {
    // Suporta: http://127.0.0.1:3000, http://localhost:3000, ws://..., wss://...
    const match = proxyLine.match(/(?:https?|wss?):\/\/(?:127\.0\.0\.1|localhost):(\d+)/i);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return undefined;
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

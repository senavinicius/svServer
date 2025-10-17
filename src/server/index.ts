import express from 'express';
import { existsSync } from 'fs';
import { getAllVirtualHosts } from './parser.js';
import { addDomain, removeDomain, updateDomain, obtainSSL, renewSSL } from './manager.js';
import type { CreateDomainDto, UpdateDomainDto, ApiResponse, Domain, VirtualHost } from '../shared/types.js';

const app = express();
const PORT = process.env.PORT || 3100;

// Verificar arquivos APENAS UMA VEZ na inicialização
function checkSystemFiles() {
  const httpExists = existsSync('/etc/httpd/conf.d/vhost.conf');
  const httpsExists = existsSync('/etc/httpd/conf.d/vhost-le-ssl.conf');
  const sslDirExists = existsSync('/etc/letsencrypt/renewal');

  return {
    server: {
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
      uptime: process.uptime(),
    },
    apache: {
      httpConfigExists: httpExists,
      httpConfigPath: '/etc/httpd/conf.d/vhost.conf',
      httpsConfigExists: httpsExists,
      httpsConfigPath: '/etc/httpd/conf.d/vhost-le-ssl.conf',
    },
    ssl: {
      renewalDirExists: sslDirExists,
      renewalDirPath: '/etc/letsencrypt/renewal',
    },
    timestamp: new Date().toISOString(),
  };
}

const systemStatus = checkSystemFiles();

// Middleware
app.use(express.json());
app.use(express.static('dist')); // Servir frontend buildado

// CORS para desenvolvimento
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

/**
 * Agrupa VirtualHosts em domínios principais e subdomínios
 */
function groupDomains(vhosts: VirtualHost[]): Domain[] {
  const domainsMap = new Map<string, Domain>();

  for (const vhost of vhosts) {
    if (vhost.isSubdomain && vhost.parentDomain) {
      // É um subdomínio
      if (!domainsMap.has(vhost.parentDomain)) {
        // Criar domínio pai placeholder se não existir
        domainsMap.set(vhost.parentDomain, {
          name: vhost.parentDomain,
          type: 'node',
          mainHost: vhost, // temporário
          subdomains: [],
        });
      }
      const domain = domainsMap.get(vhost.parentDomain)!;
      domain.subdomains.push(vhost);
    } else {
      // É um domínio principal
      if (!domainsMap.has(vhost.serverName)) {
        domainsMap.set(vhost.serverName, {
          name: vhost.serverName,
          type: vhost.type,
          mainHost: vhost,
          subdomains: [],
        });
      }
    }
  }

  // Remover domínios placeholder (que não têm mainHost real)
  const domains = Array.from(domainsMap.values()).filter(d => !d.mainHost.isSubdomain);

  return domains;
}

// ============ ROTAS DA API ============

/**
 * GET /api/diagnostics - Retorna informações de diagnóstico do sistema
 */
app.get('/api/diagnostics', (_req, res) => {
  const response: ApiResponse<typeof systemStatus> = {
    success: true,
    data: {
      ...systemStatus,
      server: {
        ...systemStatus.server,
        uptime: process.uptime(), // Atualizar uptime
      },
    },
  };

  res.json(response);
});

/**
 * GET /api/domains - Lista todos os domínios
 */
app.get('/api/domains', async (_req, res) => {
  try {
    const vhosts = await getAllVirtualHosts();
    const domains = groupDomains(vhosts);

    const response: ApiResponse<Domain[]> = {
      success: true,
      data: domains,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(500).json(response);
  }
});

/**
 * GET /api/vhosts - Lista todos os VirtualHosts (raw)
 */
app.get('/api/vhosts', async (_req, res) => {
  try {
    const vhosts = await getAllVirtualHosts();

    const response: ApiResponse<VirtualHost[]> = {
      success: true,
      data: vhosts,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(500).json(response);
  }
});

/**
 * POST /api/domains - Adiciona um novo domínio
 */
app.post('/api/domains', async (req, res) => {
  try {
    const dto: CreateDomainDto = req.body;

    await addDomain(dto);

    const response: ApiResponse = {
      success: true,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(400).json(response);
  }
});

/**
 * PUT /api/domains/:serverName - Atualiza um domínio
 */
app.put('/api/domains/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;
    const dto: UpdateDomainDto = req.body;

    await updateDomain(serverName, dto);

    const response: ApiResponse = {
      success: true,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(400).json(response);
  }
});

/**
 * DELETE /api/domains/:serverName - Remove um domínio
 */
app.delete('/api/domains/:serverName', async (req, res) => {
  try {
    const { serverName } = req.params;

    await removeDomain(serverName);

    const response: ApiResponse = {
      success: true,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(400).json(response);
  }
});

/**
 * POST /api/ssl/obtain - Obtém certificado SSL
 */
app.post('/api/ssl/obtain', async (req, res) => {
  try {
    const { domain } = req.body;

    await obtainSSL(domain);

    const response: ApiResponse = {
      success: true,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(400).json(response);
  }
});

/**
 * POST /api/ssl/renew - Renova certificado SSL
 */
app.post('/api/ssl/renew', async (req, res) => {
  try {
    const { domain } = req.body;

    await renewSSL(domain);

    const response: ApiResponse = {
      success: true,
    };

    res.json(response);
  } catch (error: any) {
    const response: ApiResponse = {
      success: false,
      error: error.message,
    };
    res.status(400).json(response);
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 EC2 Manager API running on http://localhost:${PORT}`);
  console.log('');

  const { apache, ssl } = systemStatus;

  if (!apache.httpConfigExists && !apache.httpsConfigExists) {
    console.log('⛔ ERRO: Nenhum arquivo de configuração Apache encontrado!');
    console.log(`   Procurado: ${apache.httpConfigPath}`);
    console.log(`   Procurado: ${apache.httpsConfigPath}`);
  } else {
    if (!apache.httpConfigExists) {
      console.log(`⚠️  AVISO: ${apache.httpConfigPath} não encontrado`);
    } else {
      console.log(`✅ ${apache.httpConfigPath} encontrado`);
    }

    if (!apache.httpsConfigExists) {
      console.log(`⚠️  AVISO: ${apache.httpsConfigPath} não encontrado`);
    } else {
      console.log(`✅ ${apache.httpsConfigPath} encontrado`);
    }
  }

  if (!ssl.renewalDirExists) {
    console.log(`⚠️  AVISO: ${ssl.renewalDirPath} não encontrado (SSL não configurado)`);
  } else {
    console.log(`✅ ${ssl.renewalDirPath} encontrado`);
  }

  console.log('');
});

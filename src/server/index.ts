import express from 'express';
import { getAllVirtualHosts } from './parser.js';
import { addDomain, removeDomain, updateDomain, obtainSSL, renewSSL } from './manager.js';
import { isDevelopmentMode } from './mock-data.js';
import type { CreateDomainDto, UpdateDomainDto, ApiResponse, Domain, VirtualHost } from '../shared/types.js';

const app = express();
const PORT = process.env.PORT || 3100;

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
 * GET /api/status - Retorna o status do servidor (dev/prod)
 */
app.get('/api/status', (_req, res) => {
  const isDev = isDevelopmentMode();
  const response: ApiResponse<{
    mode: 'development' | 'production';
    platform: string;
    mockMode: boolean;
    reason?: string;
  }> = {
    success: true,
    data: {
      mode: isDev ? 'development' : 'production',
      platform: process.platform,
      mockMode: process.env.MOCK_MODE === 'true',
      reason: isDev
        ? (process.platform !== 'linux'
            ? `Running on ${process.platform} (not Linux)`
            : 'MOCK_MODE environment variable is set')
        : undefined,
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
  console.log('');
  console.log(`🚀 EC2 Manager API running on http://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Detectar e informar modo de desenvolvimento/produção
  if (isDevelopmentMode()) {
    console.log('⚠️  DEVELOPMENT/TEST MODE ACTIVE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🖥️  Platform: ${process.platform}`);
    console.log(`🔧 MOCK_MODE: ${process.env.MOCK_MODE || 'not set'}`);
    console.log('📝 Using mock data instead of real Apache configuration');
    console.log('💡 To use real Apache: Run on Linux without MOCK_MODE=true');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } else {
    console.log('✅ PRODUCTION MODE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🖥️  Platform: Linux');
    console.log('📝 Using real Apache configuration from /etc/httpd/conf.d/');
    console.log('🔒 Apache commands will be executed with sudo');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
  console.log('');
});

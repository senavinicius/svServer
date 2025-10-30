import express from 'express';
import { existsSync, readFileSync } from 'fs';
import { getAllVirtualHosts } from './parser.js';
import { addDomain, removeDomain, updateDomain, obtainSSL, renewSSL, replaceConfigFile } from './manager.js';
import type { CreateDomainDTO, UpdateDomainDto, ApiResponse, Domain, VirtualHost } from '../shared/types.js';
import { addLogListener, removeLogListener, getAllLogs, clearLogs, type LogEntry } from './logger.js';
import { createAuthRoutes, createAuthMiddleware } from '@vinicius/auth';

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

// Configuração de autenticação
const authConfig = {
	googleClientId: process.env.GOOGLE_CLIENT_ID || '',
	googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
	secret: process.env.AUTH_SECRET || '',
};

// Rotas de autenticação (OBRIGATÓRIO)
if (!authConfig.googleClientId || !authConfig.googleClientSecret || !authConfig.secret) {
	console.error('❌ ERRO: Variáveis de autenticação não configuradas!');
	console.error('Configure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e AUTH_SECRET');
	process.exit(1);
}

app.use('/auth/*', createAuthRoutes(authConfig));
const auth = createAuthMiddleware();
console.log('✅ Autenticação Google OAuth habilitada');

/**
 * Agrupa VirtualHosts em domínios principais e subdomínios
 * Com a nova lógica, apenas subdomínios com pais EXISTENTES têm isSubdomain=true
 */
function groupDomains(vhosts: VirtualHost[]): Domain[] {
	const domainsMap = new Map<string, Domain>();

	// Primeiro, criar todos os domínios principais
	for (const vhost of vhosts) {
		if (!vhost.isSubdomain) {
			domainsMap.set(vhost.serverName, {
				name: vhost.serverName,
				type: vhost.type,
				mainHost: vhost,
				subdomains: [],
			});
		}
	}

	// Depois, adicionar subdomínios aos seus pais
	for (const vhost of vhosts) {
		if (vhost.isSubdomain && vhost.parentDomain) {
			const parentDomain = domainsMap.get(vhost.parentDomain);
			if (parentDomain) {
				parentDomain.subdomains.push(vhost);
			}
		}
	}

	return Array.from(domainsMap.values());
}

// ============ ROTAS DA API ============

/**
 * GET /api/diagnostics - Retorna informações de diagnóstico do sistema
 */
app.get('/api/diagnostics', auth.require(), (_req, res) => {
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

	console.log('[API /api/diagnostics] Retornando:', {
		httpExists: systemStatus.apache.httpConfigExists,
		httpsExists: systemStatus.apache.httpsConfigExists,
		sslExists: systemStatus.ssl.renewalDirExists,
	});

	res.json(response);
});

/**
 * GET /api/domains - Lista todos os domínios
 */
app.get('/api/domains', auth.require(), async (_req, res) => {
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
app.get('/api/vhosts', auth.require(), async (_req, res) => {
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
app.post('/api/domains', auth.require(), async (req, res) => {
	try {
		const dto: CreateDomainDTO = req.body;

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
app.put('/api/domains/:serverName', auth.require(), async (req, res) => {
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
app.delete('/api/domains/:serverName', auth.require(), async (req, res) => {
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
app.post('/api/ssl/obtain', auth.require(), async (req, res) => {
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
app.post('/api/ssl/renew', auth.require(), async (req, res) => {
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

/**
 * GET /api/config/download/:type - Download de arquivos de configuração
 */
app.get('/api/config/download/:type', auth.require(), (req, res) => {
	try {
		const { type } = req.params;

		let filePath: string;
		let fileName: string;

		switch (type) {
			case 'http':
				filePath = '/etc/httpd/conf.d/vhost.conf';
				fileName = 'vhost.conf';
				break;
			case 'https':
				filePath = '/etc/httpd/conf.d/vhost-le-ssl.conf';
				fileName = 'vhost-le-ssl.conf';
				break;
			default:
				return res.status(400).json({ success: false, error: 'Tipo inválido' });
		}

		if (!existsSync(filePath)) {
			return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
		}

		const content = readFileSync(filePath, 'utf-8');

		res.setHeader('Content-Type', 'text/plain');
		res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
		res.send(content);
	} catch (error: any) {
		res.status(500).json({ success: false, error: error.message });
	}
});

/**
 * POST /api/config/upload/:type - Upload de arquivos de configuração com validação
 */
app.post('/api/config/upload/:type', auth.require(), async (req, res) => {
	try {
		const { type } = req.params;
		const { content } = req.body;

		if (!content || typeof content !== 'string') {
			return res.status(400).json({
				success: false,
				error: 'Conteúdo do arquivo é obrigatório'
			});
		}

		if (type !== 'http' && type !== 'https') {
			return res.status(400).json({
				success: false,
				error: 'Tipo inválido. Use "http" ou "https"'
			});
		}

		// Substituir arquivo com validação
		const result = await replaceConfigFile(type as 'http' | 'https', content);

		const response: ApiResponse = {
			success: true,
			data: result,
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
 * GET /api/logs - Retorna todos os logs armazenados
 */
app.get('/api/logs', auth.require(), (_req, res) => {
	const logs = getAllLogs();
	const response: ApiResponse<LogEntry[]> = {
		success: true,
		data: logs,
	};
	res.json(response);
});

/**
 * DELETE /api/logs - Limpa todos os logs
 */
app.delete('/api/logs', auth.require(), (_req, res) => {
	clearLogs();
	const response: ApiResponse = {
		success: true,
	};
	res.json(response);
});

/**
 * GET /api/logs/stream - Server-Sent Events para logs em tempo real
 */
app.get('/api/logs/stream', auth.require(), (req, res) => {
	// Configurar SSE
	res.setHeader('Content-Type', 'text/event-stream');
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('Connection', 'keep-alive');
	res.setHeader('Access-Control-Allow-Origin', '*');

	// Enviar logs existentes imediatamente
	const existingLogs = getAllLogs();
	res.write(`data: ${JSON.stringify({ type: 'init', logs: existingLogs })}\n\n`);

	// Criar listener para novos logs
	const listener = (entry: LogEntry) => {
		res.write(`data: ${JSON.stringify({ type: 'log', log: entry })}\n\n`);
	};

	// Adicionar listener
	addLogListener(listener);

	// Remover listener quando a conexão fechar
	req.on('close', () => {
		removeLogListener(listener);
		res.end();
	});
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

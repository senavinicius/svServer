import 'dotenv/config';
import express from 'express';
import { createAuthRoutes, createAuthMiddleware } from '@vinicius/auth';
import { checkSystemFiles } from './services/system.js';
import { createDiagnosticsRoutes } from './routes/diagnostics.js';
import { createDomainsRoutes } from './routes/domains.js';
import { createSSLRoutes } from './routes/ssl.js';
import { createConfigRoutes } from './routes/config.js';
import { createLogsRoutes } from './routes/logs.js';
import { logger } from './logger.js';

// Error handlers globais
process.on('uncaughtException', (error) => {
	console.error('❌ UNCAUGHT EXCEPTION:', error);
	logger.error('SYSTEM', 'Uncaught exception', { error: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason, promise) => {
	console.error('❌ UNHANDLED REJECTION:', reason);
	logger.error('SYSTEM', 'Unhandled rejection', { reason, promise });
});

const app = express();
const PORT = process.env.PORT || 3100;

// Permite que req.protocol reflita HTTPS quando há proxy (Cloudflare/Nginx)
app.set('trust proxy', true);

// Força HTTPS em produção (Auth.js precisa disso para cookies Secure)
app.use((req, _res, next) => {
	const host = req.get('host') || '';
	const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

	if (!isLocalhost) {
		req.headers['x-forwarded-proto'] = 'https';
		req.headers['x-forwarded-host'] = host;
	}
	next();
});

// Middleware
app.use(express.json());
app.use(express.static('dist'));

// CORS - permite cookies de requisições AJAX
app.use((req, res, next) => {
	const origin = req.headers.origin;
	if (origin) {
		res.header('Access-Control-Allow-Origin', origin);
		res.header('Access-Control-Allow-Credentials', 'true');
	}
	res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	next();
});

/**
 * ===== CONFIGURAÇÃO DE AUTENTICAÇÃO (OPCIONAL) =====
 *
 * O servidor pode subir SEM autenticação configurada.
 * A página inicial será servida normalmente.
 * Apenas as rotas /api/* que exigem auth retornarão 401.
 *
 * Para habilitar autenticação, configure no .env:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 * - AUTH_SECRET
 * - AUTH_GOOGLE_CALLBACK_PATH=/auth
 */
const hasAuthConfig =
	process.env.GOOGLE_CLIENT_ID &&
	process.env.GOOGLE_CLIENT_SECRET &&
	process.env.AUTH_SECRET &&
	process.env.AUTH_GOOGLE_CALLBACK_PATH;

let auth: ReturnType<typeof createAuthMiddleware>;

if (hasAuthConfig) {
	const authConfig = {
		googleClientId: process.env.GOOGLE_CLIENT_ID!,
		googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
		secret: process.env.AUTH_SECRET!,
		googleCallbackPath: process.env.AUTH_GOOGLE_CALLBACK_PATH!,
	};

	// Cria as rotas de autenticação (signin, callback, signout, session, csrf)
	const authRoutes = createAuthRoutes(authConfig);

	// Monta as rotas no caminho especificado (ex: /auth/*)
	app.use(authConfig.googleCallbackPath, authRoutes);

	// Cria middlewares para proteger rotas
	auth = createAuthMiddleware();

	logger.info('AUTH', 'Sistema de autenticação inicializado');
	console.log('✅ Sistema de autenticação inicializado');
	console.log(`   Rotas auth em: ${authConfig.googleCallbackPath}/*`);
} else {
	console.log('⚠️  Autenticação NÃO configurada (servidor funcionando sem login)');
	console.log('   Configure no .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, AUTH_GOOGLE_CALLBACK_PATH');

	// Cria middlewares fake que sempre retornam 401
	auth = {
		require: () => (_req: any, res: any) => res.status(401).json({ error: 'Autenticação não configurada' }),
		optional: () => (_req: any, _res: any, next: any) => next(),
	};
}

// Verificar arquivos do sistema
const systemStatus = checkSystemFiles();

// Registrar rotas
app.use('/api', createDiagnosticsRoutes(auth, systemStatus));
app.use('/api', createDomainsRoutes(auth));
app.use('/api', createSSLRoutes(auth));
app.use('/api', createConfigRoutes(auth));
app.use('/api', createLogsRoutes(auth));

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

import 'dotenv/config';
import express from 'express';
import { createAuthRoutes, createAuthMiddleware } from '@vinicius/auth';
import { checkSystemFiles, validateConfig } from './services/system.js';
import { createDiagnosticsRoutes } from './routes/diagnostics.js';
import { createDomainsRoutes } from './routes/domains.js';
import { createSSLRoutes } from './routes/ssl.js';
import { createConfigRoutes } from './routes/config.js';
import { createLogsRoutes } from './routes/logs.js';
import { logger } from './logger.js';

// Validar configuração obrigatória
validateConfig();

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

// Middleware
app.use(express.json());
app.use(express.static('dist'));

// CORS para desenvolvimento
app.use((_req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	next();
});

/**
 * ===== CONFIGURAÇÃO DE AUTENTICAÇÃO =====
 *
 * Este projeto usa @vinicius/auth (wrapper do Auth.js) para Google OAuth
 *
 * authConfig:
 * - googleClientId: ID do cliente OAuth (obtido no Google Cloud Console)
 * - googleClientSecret: Secret do cliente (obtido no Google Cloud Console)
 * - secret: String aleatória para assinar tokens JWT (mínimo 32 chars)
 * - googleCallbackPath: Caminho onde o Google redireciona após login
 *
 * IMPORTANTE: googleCallbackPath define ONDE as rotas de auth vão responder:
 * - Se googleCallbackPath = '/googleLogin'
 * - Então as rotas serão: /googleLogin/signin, /googleLogin/callback, etc.
 * - Este caminho DEVE estar configurado no Google Cloud Console como URI de redirecionamento
 *
 * Exemplo de URI no Google Console: https://seudominio.com/googleLogin/callback/google
 */
const authConfig = {
	googleClientId: process.env.GOOGLE_CLIENT_ID!,
	googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
	secret: process.env.AUTH_SECRET!,
	googleCallbackPath: process.env.AUTH_GOOGLE_CALLBACK_PATH!,
};

// Cria as rotas de autenticação (signin, callback, signout, session, csrf)
const authRoutes = createAuthRoutes(authConfig);

// Monta as rotas no caminho especificado (ex: /googleLogin/*)
app.use(authConfig.googleCallbackPath, authRoutes);

/**
 * Cria middlewares para proteger rotas:
 * - auth.require(): Bloqueia acesso se não estiver autenticado (401)
 * - auth.optional(): Adiciona user se autenticado, mas não bloqueia
 *
 * Uso nas rotas:
 * - app.get('/api/private', auth.require(), ...)  // Protegida
 * - app.get('/api/public', auth.optional(), ...)  // Pública mas detecta user
 */
const auth = createAuthMiddleware();

logger.info('AUTH', 'Sistema de autenticação inicializado');
console.log('✅ Sistema de autenticação inicializado');

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

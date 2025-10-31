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

// Configurar autenticação
const authConfig = {
	googleClientId: process.env.GOOGLE_CLIENT_ID!,
	googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
	secret: process.env.AUTH_SECRET!,
	googleCallbackPath: process.env.AUTH_GOOGLE_CALLBACK_PATH!,
};

const authRoutes = createAuthRoutes(authConfig);
app.use(authConfig.googleCallbackPath, authRoutes);
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

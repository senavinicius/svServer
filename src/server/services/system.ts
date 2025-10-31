import { existsSync } from 'fs';
import type { Domain, VirtualHost } from '../../shared/types.js';

export interface SystemStatus {
	server: {
		platform: string;
		nodeVersion: string;
		pid: number;
		uptime: number;
	};
	apache: {
		httpConfigExists: boolean;
		httpConfigPath: string;
		httpsConfigExists: boolean;
		httpsConfigPath: string;
	};
	ssl: {
		renewalDirExists: boolean;
		renewalDirPath: string;
	};
	timestamp: string;
}

/**
 * Verifica arquivos do sistema na inicialização
 */
export function checkSystemFiles(): SystemStatus {
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

/**
 * Agrupa VirtualHosts em domínios principais e subdomínios
 */
export function groupDomains(vhosts: VirtualHost[]): Domain[] {
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

/**
 * Valida configuração obrigatória
 */
export function validateConfig() {
	const required = [
		{ name: 'GOOGLE_CLIENT_ID', value: process.env.GOOGLE_CLIENT_ID },
		{ name: 'GOOGLE_CLIENT_SECRET', value: process.env.GOOGLE_CLIENT_SECRET },
		{ name: 'AUTH_SECRET', value: process.env.AUTH_SECRET },
		{ name: 'AUTH_GOOGLE_CALLBACK_PATH', value: process.env.AUTH_GOOGLE_CALLBACK_PATH },
	];

	const missing = required.filter(({ value }) => !value);

	if (missing.length > 0) {
		console.error('❌ ERRO: Variáveis de ambiente obrigatórias não configuradas:');
		missing.forEach(({ name }) => console.error(`   - ${name}`));
		console.error('\nConfigure as variáveis no arquivo .env antes de iniciar o servidor.');
		process.exit(1);
	}
}

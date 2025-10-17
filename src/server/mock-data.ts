import type { VirtualHost } from '../shared/types.js';

let devModeLogged = false;

/**
 * Dados mockados para desenvolvimento local (Mac/Windows)
 */
export const MOCK_VHOSTS: VirtualHost[] = [
  {
    id: 'abc123',
    serverName: 'example.com',
    type: 'node',
    port: 3000,
    ssl: {
      enabled: true,
      expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 dias
      daysUntilExpiry: 60,
      status: 'active',
    },
    errorLog: '/var/log/httpd/example-error.log',
    accessLog: '/var/log/httpd/example-access.log',
    isSubdomain: false,
    rawConfig: '<VirtualHost *:80>...</VirtualHost>',
  },
  {
    id: 'def456',
    serverName: 'api.example.com',
    type: 'node',
    port: 3001,
    ssl: {
      enabled: true,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 dias
      daysUntilExpiry: 5,
      status: 'expiring',
    },
    errorLog: '/var/log/httpd/api-error.log',
    accessLog: '/var/log/httpd/api-access.log',
    isSubdomain: true,
    parentDomain: 'example.com',
    rawConfig: '<VirtualHost *:80>...</VirtualHost>',
  },
  {
    id: 'ghi789',
    serverName: 'game.example.com',
    type: 'static',
    documentRoot: '/webapp/game/dist',
    ssl: {
      enabled: false,
      status: 'none',
    },
    errorLog: '/var/log/httpd/game-error.log',
    accessLog: '/var/log/httpd/game-access.log',
    isSubdomain: true,
    parentDomain: 'example.com',
    rawConfig: '<VirtualHost *:80>...</VirtualHost>',
  },
  {
    id: 'jkl012',
    serverName: 'old.example.com',
    type: 'php',
    documentRoot: '/var/www/php-app',
    ssl: {
      enabled: true,
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // expirado há 2 dias
      daysUntilExpiry: -2,
      status: 'expired',
    },
    errorLog: '/var/log/httpd/old-error.log',
    accessLog: '/var/log/httpd/old-access.log',
    isSubdomain: true,
    parentDomain: 'example.com',
    rawConfig: '<VirtualHost *:80>...</VirtualHost>',
  },
  {
    id: 'mno345',
    serverName: 'another.com',
    type: 'static',
    documentRoot: '/webapp/another/public',
    ssl: {
      enabled: false,
      status: 'none',
    },
    errorLog: '/var/log/httpd/another-error.log',
    accessLog: '/var/log/httpd/another-access.log',
    isSubdomain: false,
    rawConfig: '<VirtualHost *:80>...</VirtualHost>',
  },
];

/**
 * Detecta se estamos em ambiente de desenvolvimento (não é Linux)
 */
export function isDevelopmentMode(): boolean {
  const isDev = process.platform !== 'linux' || process.env.MOCK_MODE === 'true';

  if (isDev && !devModeLogged) {
    console.log('');
    console.log('⚠️  DEVELOPMENT/TEST MODE ACTIVE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🖥️  Platform: ${process.platform}`);
    console.log(`🔧 MOCK_MODE env: ${process.env.MOCK_MODE || 'not set'}`);
    console.log('📝 Using mock data instead of real Apache configuration');
    console.log('💡 To disable: Run on Linux server without MOCK_MODE variable');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    devModeLogged = true;
  }

  return isDev;
}

/**
 * Simula delay de operação
 */
export function mockDelay(ms: number = 500): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Tipos compartilhados entre frontend e backend

export type DomainType = 'node' | 'static' | 'php';

export interface SSLInfo {
  enabled: boolean;
  expiresAt?: string; // ISO date string
  daysUntilExpiry?: number;
  status: 'active' | 'expiring' | 'expired' | 'none';
}

export interface VirtualHost {
  id: string; // hash do ServerName
  serverName: string;
  serverAliases?: string[]; // Aliases do ServerName
  type: DomainType;
  port?: number; // para tipo 'node'
  documentRoot?: string; // para tipo 'static' ou 'php'
  ssl: SSLInfo;
  errorLog?: string;
  accessLog?: string;
  isSubdomain: boolean;
  parentDomain?: string;
  rawConfig: string; // config original do Apache
}

export interface Domain {
  name: string;
  type: DomainType;
  mainHost: VirtualHost;
  subdomains: VirtualHost[];
}

// DTOs para API
export interface CreateDomainDTO {
  serverName: string;
  type: 'node' | 'static';
  port?: number; // obrigatório se type === 'node'
  documentRoot?: string; // obrigatório se type === 'static'
}

export interface UpdateDomainDto {
  port?: number;
  documentRoot?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SSLOperationDto {
  domain: string;
}

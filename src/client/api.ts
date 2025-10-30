import type { Domain, CreateDomainDTO, UpdateDomainDto, ApiResponse, VirtualHost } from '../shared/types.js';

// Usar URL relativa quando em produção (mesma origem do frontend)
const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * Fetch wrapper com tratamento de erros
 */
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  // Se não autenticado, redirecionar para login
  if (response.status === 401) {
    window.location.href = '/auth/signin/google';
    throw new Error('Não autenticado');
  }

  const data: ApiResponse<T> = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Erro desconhecido');
  }

  return data.data as T;
}

/**
 * Lista todos os domínios agrupados
 */
export async function getDomains(): Promise<Domain[]> {
  return apiFetch<Domain[]>('/api/domains');
}

/**
 * Lista todos os VirtualHosts (raw)
 */
export async function getVirtualHosts(): Promise<VirtualHost[]> {
  return apiFetch<VirtualHost[]>('/api/vhosts');
}

/**
 * Adiciona um novo domínio
 */
export async function addDomain(dto: CreateDomainDTO): Promise<void> {
  return apiFetch<void>('/api/domains', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Atualiza um domínio existente
 */
export async function updateDomain(serverName: string, dto: UpdateDomainDto): Promise<void> {
  return apiFetch<void>(`/api/domains/${encodeURIComponent(serverName)}`, {
    method: 'PUT',
    body: JSON.stringify(dto),
  });
}

/**
 * Remove um domínio
 */
export async function deleteDomain(serverName: string): Promise<void> {
  return apiFetch<void>(`/api/domains/${encodeURIComponent(serverName)}`, {
    method: 'DELETE',
  });
}

/**
 * Obtém certificado SSL para um domínio
 */
export async function obtainSSL(domain: string): Promise<void> {
  return apiFetch<void>('/api/ssl/obtain', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

/**
 * Renova certificado SSL de um domínio
 */
export async function renewSSL(domain: string): Promise<void> {
  return apiFetch<void>('/api/ssl/renew', {
    method: 'POST',
    body: JSON.stringify({ domain }),
  });
}

/**
 * Obtém informações de diagnóstico do sistema
 */
export async function getDiagnostics(): Promise<any> {
  return apiFetch<any>('/api/diagnostics');
}

/**
 * Faz upload de arquivo de configuração com validação
 */
export async function uploadConfigFile(type: 'http' | 'https', content: string): Promise<{ message: string; validationOutput: string }> {
  return apiFetch<{ message: string; validationOutput: string }>(`/api/config/upload/${type}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

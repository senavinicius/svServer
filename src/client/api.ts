import type { Domain, CreateDomainDTO, UpdateDomainDto, ApiResponse, VirtualHost } from '../shared/types.js';

/**
 * URL da API
 *
 * SEMPRE usa window.location.origin (domínio sendo acessado)
 * EXCETO se VITE_API_URL estiver configurado (apenas para dev local)
 *
 * Produção: usa domínio automaticamente (https://seudominio.com)
 * Dev local: configure VITE_API_URL=http://localhost:3100 no .env
 */
export const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

/**
 * Fetch wrapper com tratamento de erros
 */
async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  console.log('[API] Chamando:', endpoint, { credentials: 'include' });

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // IMPORTANTE: Envia cookies de autenticação
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  console.log('[API] Response status:', response.status, response.statusText);

  const data: ApiResponse<T> = await response.json();
  console.log('[API] Response data:', data);

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

/**
 * Verifica se há uma sessão ativa de autenticação
 * Retorna os dados do usuário se logado, ou null se não logado
 */
export async function checkAuth(): Promise<{ user?: { id: string; email: string; name?: string; picture?: string } } | null> {
  try {
    const authPath = import.meta.env.VITE_AUTH_CALLBACK_PATH || '/auth';
    console.log('[API] Verificando auth em:', `${API_URL}${authPath}/session`);

    const response = await fetch(`${API_URL}${authPath}/session`, {
      credentials: 'include', // Importante: inclui cookies na requisição
      headers: {
        'accept': 'application/json',
      },
    });

    console.log('[API] Auth response status:', response.status);
    console.log('[API] Auth response headers:', {
      'set-cookie': response.headers.get('set-cookie'),
      'content-type': response.headers.get('content-type'),
    });

    if (!response.ok) {
      console.log('[API] Auth response não OK');
      return null;
    }

    const data = await response.json();
    console.log('[API] Auth session data:', data);

    return data.user ? data : null;
  } catch (error) {
    console.error('[API] Erro ao verificar autenticação:', error);
    return null;
  }
}

/**
 * Faz logout do usuário
 *
 * Auth.js signout requer:
 * 1. POST request
 * 2. Opcionalmente CSRF token
 * 3. Redirect depois do logout
 */
export async function logout(): Promise<void> {
  try {
    const authPath = import.meta.env.VITE_AUTH_CALLBACK_PATH || '/auth';

    console.log('[API] Fazendo logout...');

    // Auth.js geralmente aceita POST para /signout
    // Redireciona para a página após logout
    const response = await fetch(`${API_URL}${authPath}/signout`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log('[API] Logout response:', response.status);

    if (!response.ok) {
      throw new Error(`Logout falhou: ${response.statusText}`);
    }

    // Limpar cookies do lado do cliente também
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

  } catch (error) {
    console.error('[API] Erro ao fazer logout:', error);
    throw error;
  }
}

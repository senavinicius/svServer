import type { Domain, VirtualHost } from '../shared/types.js';

/**
 * Configuração de ícones e labels por tipo
 */
const TYPE_CONFIG = {
  node: { icon: '📡', label: 'NODE' },
  static: { icon: '📁', label: 'STATIC' },
  php: { icon: '🐘', label: 'PHP' }
} as const;

/**
 * Configuração de status SSL
 */
const SSL_STATUS_CONFIG = {
  none: { icon: '❌', text: 'Sem SSL', class: 'none' },
  expired: { icon: '❌', text: () => `Expirado`, class: 'expired' },
  expiring: { icon: '⚠️', text: (days: number) => `${days}d`, class: 'expiring' },
  active: { icon: '✅', text: (days: number) => `${days}d`, class: 'active' }
} as const;

/**
 * Renderiza o status SSL de um VirtualHost
 */
export function renderSSLStatus(vhost: VirtualHost): string {
  const ssl = vhost.ssl;
  const config = SSL_STATUS_CONFIG[ssl.status];

  const text = typeof config.text === 'function'
    ? config.text(ssl.daysUntilExpiry || 0)
    : config.text;

  return `<span class="ssl-status ${config.class}">${config.icon} ${text}</span>`;
}

/**
 * Renderiza os botões de ação de um VirtualHost
 */
export function renderVirtualHostActions(vhost: VirtualHost): string {
  const isPhp = vhost.type === 'php';
  const actions: string[] = [];

  // Editar (não para PHP)
  if (!isPhp) {
    actions.push(renderButton('edit', vhost.serverName, 'Editar', 'secondary'));
  }

  // SSL
  const sslAction = vhost.ssl.status === 'none' ? 'obtain-ssl' : 'renew-ssl';
  const sslLabel = vhost.ssl.status === 'none' ? 'Obter SSL' : 'Renovar SSL';
  actions.push(renderButton(sslAction, vhost.serverName, sslLabel, 'success'));

  // Remover (não para PHP)
  if (!isPhp) {
    actions.push(renderButton('delete', vhost.serverName, 'Remover', 'danger'));
  }

  return actions.join('');
}

/**
 * Helper para renderizar um botão de ação
 */
function renderButton(action: string, domain: string, label: string, variant: string): string {
  return `<button class="btn btn-${variant} btn-small" data-action="${action}" data-domain="${domain}">${label}</button>`;
}

/**
 * Renderiza um VirtualHost individual em formato de linha (estilo planilha)
 */
export function renderVirtualHost(vhost: VirtualHost, isSubdomain = false): string {
  const { icon, label } = TYPE_CONFIG[vhost.type];
  const target = vhost.type === 'node' ? `Port ${vhost.port}` : vhost.documentRoot || 'N/A';
  const subdoClass = isSubdomain ? 'subdomain' : '';
  const subdoIndicator = isSubdomain ? '<span class="subdomain-indicator">↳</span>' : '';

  return `
    <div class="vhost-row ${subdoClass}">
      <div class="vhost-cell vhost-name">
        ${subdoIndicator}<span class="vhost-icon">${icon}</span>${vhost.serverName}
      </div>
      <div class="vhost-cell vhost-type">
        <span class="domain-type ${vhost.type}">${label}</span>
      </div>
      <div class="vhost-cell vhost-target">${target}</div>
      <div class="vhost-cell vhost-ssl">${renderSSLStatus(vhost)}</div>
      <div class="vhost-cell vhost-actions">
        ${renderVirtualHostActions(vhost)}
      </div>
    </div>
  `;
}

/**
 * Renderiza um domínio completo (domínio principal + subdomínios)
 */
export function renderDomain(domain: Domain): string {
  const mainVHost = renderVirtualHost(domain.mainHost);
  const subdomains = domain.subdomains.map(sub => renderVirtualHost(sub, true)).join('');

  return `
    <div class="domain-card">
      ${mainVHost}
      ${subdomains}
    </div>
  `;
}

/**
 * Renderiza a lista completa de domínios
 */
export function renderDomainsList(domains: Domain[], isLoading: boolean, error: string | null): string {
  if (isLoading) {
    return '<div class="loading">⏳ Carregando domínios...</div>';
  }

  if (error) {
    return `<div class="error">❌ Erro: ${error}</div>`;
  }

  if (domains.length === 0) {
    return `
      <div class="empty-state">
        <p>Nenhum domínio configurado. Clique em "Adicionar Domínio" para começar.</p>
      </div>
    `;
  }

  return domains.map(renderDomain).join('');
}

/**
 * Renderiza campos do formulário baseado no modo e tipo
 */
function renderFormFields(modalMode: 'add' | 'edit', editingVHost: VirtualHost | null): string {
  const isNode = editingVHost?.type === 'node' || modalMode === 'add';
  const isStatic = editingVHost?.type === 'static';

  const addModeFields = modalMode === 'add' ? `
    <div class="form-group">
      <label for="serverName">Nome do Domínio</label>
      <input type="text" id="serverName" name="serverName" placeholder="example.com" required>
    </div>
    <div class="form-group">
      <label for="type">Tipo</label>
      <select id="type" name="type" required>
        <option value="node">Node (Proxy)</option>
        <option value="static">Static (DocumentRoot)</option>
      </select>
    </div>
  ` : '';

  return `
    ${addModeFields}
    <div class="form-group ${isNode ? '' : 'hidden'}" id="port-group">
      <label for="port">Porta</label>
      <input type="number" id="port" name="port" placeholder="3000" value="${editingVHost?.port || ''}">
    </div>
    <div class="form-group ${isStatic ? '' : 'hidden'}" id="documentRoot-group">
      <label for="documentRoot">DocumentRoot</label>
      <input type="text" id="documentRoot" name="documentRoot" placeholder="/webapp/example/dist" value="${editingVHost?.documentRoot || ''}">
    </div>
  `;
}

/**
 * Renderiza o modal de adicionar/editar domínio
 */
export function renderModal(
  isModalOpen: boolean,
  modalMode: 'add' | 'edit',
  editingVHost: VirtualHost | null
): string {
  const title = modalMode === 'add' ? 'Adicionar Domínio' : 'Editar Domínio';
  const submitLabel = modalMode === 'add' ? 'Adicionar' : 'Salvar';

  return `
    <div class="modal ${isModalOpen ? 'show' : ''}" id="modal">
      <div class="modal-content">
        <div class="modal-header">${title}</div>
        <form id="domain-form">
          ${renderFormFields(modalMode, editingVHost)}
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="cancel-btn">Cancelar</button>
            <button type="submit" class="btn btn-primary">${submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renderiza o status do sistema (avisos e erros)
 */
export function renderSystemStatus(diagnostics: any): string {
  if (!diagnostics) {
    return '';
  }

  const { apache, ssl } = diagnostics;
  const problems: string[] = [];

  // Verificar problemas do Apache
  if (!apache.httpConfigExists && !apache.httpsConfigExists) {
    problems.push(
      '⛔ ERRO: Nenhum arquivo de configuração Apache encontrado!',
      `   → ${apache.httpConfigPath}`,
      `   → ${apache.httpsConfigPath}`
    );
  } else {
    if (!apache.httpConfigExists) {
      problems.push(`⚠️  ${apache.httpConfigPath} não encontrado`);
    }
    if (!apache.httpsConfigExists) {
      problems.push(`⚠️  ${apache.httpsConfigPath} não encontrado`);
    }
  }

  // Verificar problemas de SSL
  if (!ssl.renewalDirExists) {
    problems.push(`⚠️  ${ssl.renewalDirPath} não encontrado (SSL não configurado)`);
  }

  if (problems.length === 0) {
    return '';
  }

  return `
    <div class="system-status error">
      ${problems.map(p => `<div>${p}</div>`).join('')}
    </div>
  `;
}

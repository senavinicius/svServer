import './style.css';
import { getDomains, addDomain, updateDomain, deleteDomain, obtainSSL, renewSSL, getDiagnostics } from './api.js';
import type { Domain, VirtualHost, CreateDomainDto } from '../shared/types.js';

// ============ STATE ============
let domains: Domain[] = [];
let isLoading = false;
let error: string | null = null;
let diagnostics: any = null;
let showDiagnostics = false;

// ============ MODAL STATE ============
let isModalOpen = false;
let modalMode: 'add' | 'edit' = 'add';
let editingVHost: VirtualHost | null = null;

// ============ RENDER FUNCTIONS ============

function renderSSLStatus(vhost: VirtualHost): string {
  const ssl = vhost.ssl;

  if (ssl.status === 'none') {
    return `<span class="ssl-status none">❌ Sem SSL</span>`;
  }

  if (ssl.status === 'expired') {
    return `<span class="ssl-status expired">❌ Expirado</span>`;
  }

  if (ssl.status === 'expiring') {
    return `<span class="ssl-status expiring">⚠️ Expira em ${ssl.daysUntilExpiry} dias</span>`;
  }

  return `<span class="ssl-status active">✅ SSL Ativo (${ssl.daysUntilExpiry} dias)</span>`;
}

function renderVirtualHostActions(vhost: VirtualHost): string {
  const isPhp = vhost.type === 'php';

  let actions = '';

  // Editar (não para PHP)
  if (!isPhp) {
    actions += `<button class="btn btn-secondary btn-small" data-action="edit" data-domain="${vhost.serverName}">Editar</button>`;
  }

  // SSL
  if (vhost.ssl.status === 'none') {
    actions += `<button class="btn btn-success btn-small" data-action="obtain-ssl" data-domain="${vhost.serverName}">Obter SSL</button>`;
  } else {
    actions += `<button class="btn btn-success btn-small" data-action="renew-ssl" data-domain="${vhost.serverName}">Renovar SSL</button>`;
  }

  // Remover (não para PHP)
  if (!isPhp) {
    actions += `<button class="btn btn-danger btn-small" data-action="delete" data-domain="${vhost.serverName}">Remover</button>`;
  }

  return actions;
}

function renderVirtualHost(vhost: VirtualHost, isSubdomain = false): string {
  const icon = vhost.type === 'node' ? '📡' : vhost.type === 'static' ? '📁' : '🐘';
  const typeLabel = vhost.type.toUpperCase();

  const target = vhost.type === 'node'
    ? `Port ${vhost.port}`
    : vhost.documentRoot || 'N/A';

  const subdoClass = isSubdomain ? 'subdomain' : '';
  const subdoIndicator = isSubdomain ? '<span class="subdomain-indicator">↳</span>' : '';

  return `
    <div class="${subdoClass}">
      <div class="domain-header">
        <div class="domain-name">
          ${subdoIndicator}
          ${icon} ${vhost.serverName}
          <span class="domain-type ${vhost.type}">${typeLabel}</span>
        </div>
      </div>
      <div class="domain-info">
        <span><strong>Target:</strong> ${target}</span>
        ${renderSSLStatus(vhost)}
      </div>
      <div class="domain-actions">
        ${renderVirtualHostActions(vhost)}
      </div>
    </div>
  `;
}

function renderDomain(domain: Domain): string {
  const mainVHost = renderVirtualHost(domain.mainHost);
  const subdomains = domain.subdomains.map(sub => renderVirtualHost(sub, true)).join('');

  return `
    <div class="domain-card">
      ${mainVHost}
      ${subdomains}
    </div>
  `;
}

function renderDomainsList(): string {
  if (isLoading) {
    return '<div class="loading">⏳ Carregando domínios...</div>';
  }

  if (error) {
    return `
      <div class="error">
        <h3>❌ Erro ao carregar domínios</h3>
        <p><strong>Detalhes:</strong> ${error}</p>
        <p><strong>Possíveis causas:</strong></p>
        <ul>
          <li>Arquivos de configuração do Apache não encontrados</li>
          <li>Sem permissão para ler os arquivos</li>
          <li>Servidor Apache não configurado</li>
        </ul>
        <p><strong>Dica:</strong> Clique em "🔍 Diagnóstico" para ver mais detalhes</p>
      </div>
    `;
  }

  if (domains.length === 0) {
    return `
      <div class="empty-state">
        <h3>Nenhum domínio configurado</h3>
        <p>Clique em "Adicionar Domínio" para começar</p>
        <p><strong>Ou:</strong> Clique em "🔍 Diagnóstico" para verificar se os arquivos de configuração existem</p>
      </div>
    `;
  }

  return `
    <div class="domains-count">
      <strong>Total de domínios:</strong> ${domains.length}
    </div>
    ${domains.map(renderDomain).join('')}
  `;
}

function renderModal(): string {
  const title = modalMode === 'add' ? 'Adicionar Domínio' : 'Editar Domínio';
  const isNode = editingVHost?.type === 'node' || modalMode === 'add';
  const isStatic = editingVHost?.type === 'static';

  return `
    <div class="modal ${isModalOpen ? 'show' : ''}" id="modal">
      <div class="modal-content">
        <div class="modal-header">${title}</div>
        <form id="domain-form">
          ${modalMode === 'add' ? `
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
          ` : ''}

          <div class="form-group ${isNode ? '' : 'hidden'}" id="port-group">
            <label for="port">Porta</label>
            <input type="number" id="port" name="port" placeholder="3000" value="${editingVHost?.port || ''}">
          </div>

          <div class="form-group ${isStatic ? '' : 'hidden'}" id="documentRoot-group">
            <label for="documentRoot">DocumentRoot</label>
            <input type="text" id="documentRoot" name="documentRoot" placeholder="/webapp/example/dist" value="${editingVHost?.documentRoot || ''}">
          </div>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" id="cancel-btn">Cancelar</button>
            <button type="submit" class="btn btn-primary">${modalMode === 'add' ? 'Adicionar' : 'Salvar'}</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderDiagnostics(): string {
  if (!showDiagnostics) {
    return '';
  }

  if (!diagnostics) {
    return `
      <div class="diagnostics-panel">
        <h3>🔍 Diagnóstico do Sistema</h3>
        <div class="loading">⏳ Carregando diagnóstico...</div>
      </div>
    `;
  }

  const { server, apache, ssl } = diagnostics;

  // Verificar problemas
  const problems = [];
  if (!apache.httpConfigExists && !apache.httpsConfigExists) {
    problems.push('⛔ NENHUM arquivo de configuração do Apache encontrado!');
  }
  if (!apache.httpConfigExists) {
    problems.push(`❌ Arquivo HTTP não encontrado: ${apache.httpConfigPath}`);
  }
  if (!apache.httpsConfigExists) {
    problems.push(`⚠️ Arquivo HTTPS não encontrado: ${apache.httpsConfigPath}`);
  }
  if (!ssl.renewalDirExists) {
    problems.push(`⚠️ Diretório SSL não encontrado: ${ssl.renewalDirPath}`);
  }

  return `
    <div class="diagnostics-panel">
      <h3>🔍 Diagnóstico do Sistema</h3>

      ${problems.length > 0 ? `
        <div class="diag-problems">
          <h4>⚠️ Problemas Detectados:</h4>
          <ul>
            ${problems.map(p => `<li>${p}</li>`).join('')}
          </ul>
        </div>
      ` : '<div class="diag-success">✅ Todos os arquivos necessários foram encontrados!</div>'}

      <div class="diag-section">
        <h4>Servidor</h4>
        <ul>
          <li><strong>Plataforma:</strong> ${server.platform}</li>
          <li><strong>Node.js:</strong> ${server.nodeVersion}</li>
          <li><strong>PID:</strong> ${server.pid}</li>
          <li><strong>Uptime:</strong> ${Math.floor(server.uptime)}s</li>
        </ul>
      </div>

      <div class="diag-section">
        <h4>Arquivos de Configuração Apache</h4>
        <ul>
          <li>
            ${apache.httpConfigExists ? '✅' : '❌'}
            <strong>HTTP Config:</strong>
            ${apache.httpConfigPath}
          </li>
          <li>
            ${apache.httpsConfigExists ? '✅' : '❌'}
            <strong>HTTPS Config:</strong>
            ${apache.httpsConfigPath}
          </li>
        </ul>
      </div>

      <div class="diag-section">
        <h4>SSL / Let's Encrypt</h4>
        <ul>
          <li>
            ${ssl.renewalDirExists ? '✅' : '❌'}
            <strong>Diretório de Renovação:</strong>
            ${ssl.renewalDirPath}
          </li>
        </ul>
      </div>

      <div class="diag-section">
        <small>Atualizado em: ${new Date(diagnostics.timestamp).toLocaleString('pt-BR')}</small>
      </div>
    </div>
  `;
}

function render() {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="container">
      <div class="header">
        <h1>EC2 Manager</h1>
        <p>Gerenciador de domínios Apache e SSL (Certbot)</p>
      </div>

      <div class="toolbar">
        <button class="btn btn-secondary" id="toggle-diagnostics-btn">
          ${showDiagnostics ? '🔽 Esconder' : '🔍 Diagnóstico'}
        </button>
        <button class="btn btn-primary" id="add-domain-btn">+ Adicionar Domínio</button>
      </div>

      ${renderDiagnostics()}

      <div class="domains-list">
        ${renderDomainsList()}
      </div>
    </div>

    ${renderModal()}
  `;

  attachEventListeners();
}

// ============ EVENT HANDLERS ============

function attachEventListeners() {
  // Botão adicionar domínio
  document.getElementById('add-domain-btn')?.addEventListener('click', openAddModal);

  // Botão toggle diagnóstico
  document.getElementById('toggle-diagnostics-btn')?.addEventListener('click', async () => {
    showDiagnostics = !showDiagnostics;
    if (showDiagnostics && !diagnostics) {
      await loadDiagnostics();
    }
    render();
  });

  // Ações dos domínios
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleDomainAction);
  });

  // Modal
  document.getElementById('cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal')?.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).id === 'modal') {
      closeModal();
    }
  });

  // Form
  document.getElementById('domain-form')?.addEventListener('submit', handleFormSubmit);

  // Toggle campos baseado no tipo
  document.getElementById('type')?.addEventListener('change', (e) => {
    const type = (e.target as HTMLSelectElement).value;
    const portGroup = document.getElementById('port-group')!;
    const docRootGroup = document.getElementById('documentRoot-group')!;

    if (type === 'node') {
      portGroup.classList.remove('hidden');
      docRootGroup.classList.add('hidden');
      document.getElementById('port')?.setAttribute('required', 'required');
      document.getElementById('documentRoot')?.removeAttribute('required');
    } else {
      portGroup.classList.add('hidden');
      docRootGroup.classList.remove('hidden');
      document.getElementById('port')?.removeAttribute('required');
      document.getElementById('documentRoot')?.setAttribute('required', 'required');
    }
  });
}

async function handleDomainAction(e: Event) {
  const btn = e.target as HTMLButtonElement;
  const action = btn.dataset.action;
  const domain = btn.dataset.domain!;

  if (!confirm(`Confirma ação: ${action} em ${domain}?`)) {
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Processando...';

    switch (action) {
      case 'edit':
        openEditModal(domain);
        break;
      case 'delete':
        await deleteDomain(domain);
        await loadDomains();
        break;
      case 'obtain-ssl':
        await obtainSSL(domain);
        await loadDomains();
        alert('SSL obtido com sucesso!');
        break;
      case 'renew-ssl':
        await renewSSL(domain);
        await loadDomains();
        alert('SSL renovado com sucesso!');
        break;
    }
  } catch (err: any) {
    alert(`Erro: ${err.message}`);
  } finally {
    btn.disabled = false;
    render();
  }
}

async function handleFormSubmit(e: Event) {
  e.preventDefault();

  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);

  try {
    if (modalMode === 'add') {
      const dto: CreateDomainDto = {
        serverName: formData.get('serverName') as string,
        type: formData.get('type') as 'node' | 'static',
        port: formData.get('port') ? parseInt(formData.get('port') as string) : undefined,
        documentRoot: formData.get('documentRoot') as string || undefined,
      };

      await addDomain(dto);
    } else {
      const dto = {
        port: formData.get('port') ? parseInt(formData.get('port') as string) : undefined,
        documentRoot: formData.get('documentRoot') as string || undefined,
      };

      await updateDomain(editingVHost!.serverName, dto);
    }

    closeModal();
    await loadDomains();
    alert('Operação concluída com sucesso!');
  } catch (err: any) {
    alert(`Erro: ${err.message}`);
  }
}

function openAddModal() {
  modalMode = 'add';
  editingVHost = null;
  isModalOpen = true;
  render();
}

function openEditModal(serverName: string) {
  // Encontrar VirtualHost
  for (const domain of domains) {
    if (domain.mainHost.serverName === serverName) {
      editingVHost = domain.mainHost;
      break;
    }
    const subdomain = domain.subdomains.find(s => s.serverName === serverName);
    if (subdomain) {
      editingVHost = subdomain;
      break;
    }
  }

  if (!editingVHost) {
    alert('Domínio não encontrado');
    return;
  }

  modalMode = 'edit';
  isModalOpen = true;
  render();
}

function closeModal() {
  isModalOpen = false;
  editingVHost = null;
  render();
}

// ============ DATA LOADING ============

async function loadDomains() {
  isLoading = true;
  error = null;
  render();

  try {
    domains = await getDomains();
  } catch (err: any) {
    error = err.message;
  } finally {
    isLoading = false;
    render();
  }
}

async function loadDiagnostics() {
  try {
    diagnostics = await getDiagnostics();
    render();
  } catch (err: any) {
    console.error('Erro ao carregar diagnóstico:', err);
  }
}

// ============ INIT ============

loadDomains();
loadDiagnostics();

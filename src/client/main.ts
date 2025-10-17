import './style.css';
import { getDomains, addDomain, updateDomain, deleteDomain, obtainSSL, renewSSL, getDiagnostics, uploadConfigFile } from './api.js';
import type { Domain, VirtualHost, CreateDomainDTO } from '../shared/types.js';
import { renderDomainsList, renderModal, renderSystemStatus } from './render.js';

/**
 * Estado global da aplicação
 */
const state = {
  domains: [] as Domain[],
  isLoading: false,
  error: null as string | null,
  diagnostics: null as any,
  modal: {
    isOpen: false,
    mode: 'add' as 'add' | 'edit',
    editingVHost: null as VirtualHost | null,
  }
};

/**
 * Renderiza a aplicação completa
 */
function render() {
  const app = document.getElementById('app')!;

  app.innerHTML = `
    <div class="container">
      <div class="header">
        <h1>EC2 Manager</h1>
        <p>Gerenciador de domínios Apache e SSL (Certbot)</p>
      </div>

      ${renderSystemStatus(state.diagnostics)}

      <div class="toolbar">
        <div class="toolbar-left">
          <button class="btn btn-secondary btn-small" id="download-http-btn">⬇ HTTP Config</button>
          <button class="btn btn-secondary btn-small" id="download-https-btn">⬇ HTTPS Config</button>
          <button class="btn btn-success btn-small" id="upload-http-btn">⬆ Upload HTTP</button>
        </div>
        <button class="btn btn-primary" id="add-domain-btn">+ Adicionar Domínio</button>
      </div>

      <div class="domains-list">
        ${renderDomainsList(state.domains, state.isLoading, state.error)}
      </div>
    </div>

    ${renderModal(state.modal.isOpen, state.modal.mode, state.modal.editingVHost)}
  `;

  attachEventListeners();
}

/**
 * Anexa event listeners aos elementos do DOM
 */
function attachEventListeners() {
  document.getElementById('add-domain-btn')?.addEventListener('click', openAddModal);
  document.getElementById('cancel-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal')?.addEventListener('click', handleModalBackdropClick);
  document.getElementById('domain-form')?.addEventListener('submit', handleFormSubmit);
  document.getElementById('type')?.addEventListener('change', handleTypeChange);
  document.getElementById('download-http-btn')?.addEventListener('click', () => downloadConfig('http'));
  document.getElementById('download-https-btn')?.addEventListener('click', () => downloadConfig('https'));
  document.getElementById('upload-http-btn')?.addEventListener('click', () => uploadConfig('http'));

  // Ações dos domínios (delegação de eventos)
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', handleDomainAction);
  });
}

/**
 * Handler para clique no backdrop do modal
 */
function handleModalBackdropClick(e: Event) {
  if ((e.target as HTMLElement).id === 'modal') {
    closeModal();
  }
}

/**
 * Handler para mudança no tipo de domínio (Node/Static)
 */
function handleTypeChange(e: Event) {
  const type = (e.target as HTMLSelectElement).value;
  toggleFormFields(type === 'node');
}

/**
 * Toggle campos do formulário baseado no tipo
 */
function toggleFormFields(isNode: boolean) {
  const portGroup = document.getElementById('port-group')!;
  const docRootGroup = document.getElementById('documentRoot-group')!;
  const portInput = document.getElementById('port');
  const docRootInput = document.getElementById('documentRoot');

  if (isNode) {
    portGroup.classList.remove('hidden');
    docRootGroup.classList.add('hidden');
    portInput?.setAttribute('required', 'required');
    docRootInput?.removeAttribute('required');
  } else {
    portGroup.classList.add('hidden');
    docRootGroup.classList.remove('hidden');
    portInput?.removeAttribute('required');
    docRootInput?.setAttribute('required', 'required');
  }
}

/**
 * Mapa de ações de domínio
 */
const DOMAIN_ACTIONS = {
  'edit': async (domain: string) => {
    openEditModal(domain);
  },
  'delete': async (domain: string) => {
    await deleteDomain(domain);
    await loadDomains();
  },
  'obtain-ssl': async (domain: string) => {
    await obtainSSL(domain);
    await loadDomains();
    alert('SSL obtido com sucesso!');
  },
  'renew-ssl': async (domain: string) => {
    await renewSSL(domain);
    await loadDomains();
    alert('SSL renovado com sucesso!');
  }
} as const;

/**
 * Handler para ações em domínios (editar, remover, SSL)
 */
async function handleDomainAction(e: Event) {
  const btn = e.target as HTMLButtonElement;
  const action = btn.dataset.action as keyof typeof DOMAIN_ACTIONS;
  const domain = btn.dataset.domain!;

  if (!confirm(`Confirma ação: ${action} em ${domain}?`)) {
    return;
  }

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Processando...';

  try {
    await DOMAIN_ACTIONS[action](domain);
  } catch (err: any) {
    alert(`Erro: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    render();
  }
}

/**
 * Handler para submit do formulário
 */
async function handleFormSubmit(e: Event) {
  e.preventDefault();

  const form = e.target as HTMLFormElement;
  const formData = new FormData(form);

  try {
    if (state.modal.mode === 'add') {
      await handleAddDomain(formData);
    } else {
      await handleUpdateDomain(formData);
    }

    closeModal();
    await loadDomains();
    alert('Operação concluída com sucesso!');
  } catch (err: any) {
    alert(`Erro: ${err.message}`);
  }
}

/**
 * Handler para adicionar domínio
 */
async function handleAddDomain(formData: FormData) {
  const dto: CreateDomainDTO = {
    serverName: formData.get('serverName') as string,
    type: formData.get('type') as 'node' | 'static',
    port: formData.get('port') ? parseInt(formData.get('port') as string) : undefined,
    documentRoot: formData.get('documentRoot') as string || undefined,
  };

  await addDomain(dto);
}

/**
 * Handler para atualizar domínio
 */
async function handleUpdateDomain(formData: FormData) {
  const dto = {
    port: formData.get('port') ? parseInt(formData.get('port') as string) : undefined,
    documentRoot: formData.get('documentRoot') as string || undefined,
  };

  await updateDomain(state.modal.editingVHost!.serverName, dto);
}

/**
 * Abre modal para adicionar domínio
 */
function openAddModal() {
  state.modal.mode = 'add';
  state.modal.editingVHost = null;
  state.modal.isOpen = true;
  render();
}

/**
 * Busca VirtualHost por serverName
 */
function findVirtualHost(serverName: string): VirtualHost | null {
  for (const domain of state.domains) {
    if (domain.mainHost.serverName === serverName) {
      return domain.mainHost;
    }
    const subdomain = domain.subdomains.find(s => s.serverName === serverName);
    if (subdomain) {
      return subdomain;
    }
  }
  return null;
}

/**
 * Abre modal para editar domínio
 */
function openEditModal(serverName: string) {
  const vhost = findVirtualHost(serverName);

  if (!vhost) {
    alert('Domínio não encontrado');
    return;
  }

  state.modal.editingVHost = vhost;
  state.modal.mode = 'edit';
  state.modal.isOpen = true;
  render();
}

/**
 * Fecha modal
 */
function closeModal() {
  state.modal.isOpen = false;
  state.modal.editingVHost = null;
  render();
}

/**
 * Carrega lista de domínios da API
 */
async function loadDomains() {
  state.isLoading = true;
  state.error = null;
  render();

  try {
    state.domains = await getDomains();
  } catch (err: any) {
    state.error = err.message;
  } finally {
    state.isLoading = false;
    render();
  }
}

/**
 * Carrega diagnósticos do sistema
 */
async function loadDiagnostics() {
  try {
    state.diagnostics = await getDiagnostics();
    render();
  } catch (err: any) {
    console.error('Erro ao carregar diagnóstico:', err);
  }
}

/**
 * Download de arquivo de configuração
 */
function downloadConfig(type: 'http' | 'https') {
  const baseUrl = import.meta.env.DEV ? 'http://localhost:3100' : '';
  window.location.href = `${baseUrl}/api/config/download/${type}`;
}

/**
 * Upload de arquivo de configuração com validação
 */
async function uploadConfig(type: 'http' | 'https') {
  // Criar input de arquivo dinamicamente
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.conf,text/plain';

  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    // Confirmar ação
    const fileName = type === 'http' ? 'vhost.conf' : 'vhost-le-ssl.conf';
    if (!confirm(
      `Tem certeza que deseja substituir ${fileName}?\n\n` +
      `⚠️ Esta ação irá:\n` +
      `1. Fazer backup do arquivo atual\n` +
      `2. Validar a configuração com apachectl configtest\n` +
      `3. Substituir apenas se a validação passar\n` +
      `4. Recarregar o Apache automaticamente\n\n` +
      `Continuar?`
    )) {
      return;
    }

    try {
      // Ler conteúdo do arquivo
      const content = await file.text();

      // Mostrar loading
      const btn = document.getElementById(`upload-${type}-btn`) as HTMLButtonElement;
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      // Fazer upload
      await uploadConfigFile(type, content);

      // Recarregar domínios após upload bem-sucedido
      await loadDomains();

      alert(`✅ Arquivo ${fileName} substituído com sucesso!\nApache recarregado.`);

      btn.disabled = false;
      btn.textContent = originalText;
    } catch (err: any) {
      alert(`❌ Erro ao enviar arquivo:\n\n${err.message}\n\nO arquivo anterior foi mantido.`);

      // Restaurar botão
      const btn = document.getElementById(`upload-${type}-btn`) as HTMLButtonElement;
      btn.disabled = false;
      btn.textContent = btn.textContent?.replace('Enviando...', originalText => originalText);
    }
  };

  // Abrir seletor de arquivo
  input.click();
}

/**
 * Inicialização da aplicação
 */
function init() {
  loadDomains();
  loadDiagnostics();
}

// Iniciar aplicação
init();

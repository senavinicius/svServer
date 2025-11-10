import './style.css';
import { getDomains, addDomain, updateDomain, deleteDomain, obtainSSL, renewSSL, getDiagnostics, uploadConfigFile, API_URL, checkAuth, logout } from './api.js';
import type { Domain, VirtualHost, CreateDomainDTO } from '../shared/types.js';
import { renderModal } from './render.js';
import { addEventListener, addDataAttributeListeners, getElement, queryElement, toggleClass } from './dom.js';
import type { LogEntry } from '../server/logger.js';
import { renderHeader } from './views/Header.js';
import { renderLoginView } from './views/LoginView.js';
import { renderDashboardView } from './views/DashboardView.js';

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
	},
	logs: [] as LogEntry[],
	logsVisible: true,
	user: null as { id: string; email: string; name?: string; picture?: string } | null,
	isCheckingAuth: true,
};

/**
 * Renderiza a aplicação completa
 */
function render() {
	const app = getElement('app');

	// Seleciona a view apropriada baseada no estado de autenticação
	const mainContent = state.user
		? renderDashboardView({
			domains: state.domains,
			isLoading: state.isLoading,
			error: state.error,
			diagnostics: state.diagnostics,
			logsVisible: state.logsVisible,
			logs: state.logs,
		})
		: renderLoginView({
			isCheckingAuth: state.isCheckingAuth,
		});

	app.innerHTML = `
    <div class="container">
      ${renderHeader({
				isCheckingAuth: state.isCheckingAuth,
				user: state.user,
			})}

      ${mainContent}
    </div>

    ${renderModal(state.modal.isOpen, state.modal.mode, state.modal.editingVHost)}
  `;

	attachEventListeners();
}

/**
 * Anexa event listeners aos elementos do DOM
 */
function attachEventListeners() {
	addEventListener('add-domain-btn', 'click', openAddModal);
	addEventListener('login-btn', 'click', handleLoginClick);
	addEventListener('logout-btn', 'click', handleLogoutClick);
	addEventListener('cancel-btn', 'click', closeModal);
	addEventListener('modal', 'click', handleModalBackdropClick);
	addEventListener('domain-form', 'submit', handleFormSubmit);
	addEventListener('type', 'change', handleTypeChange);
	addEventListener('download-http-btn', 'click', () => downloadConfig('http'));
	addEventListener('download-https-btn', 'click', () => downloadConfig('https'));
	addEventListener('upload-http-btn', 'click', () => uploadConfig('http'));
	addEventListener('toggle-logs-btn', 'click', toggleLogs);
	addEventListener('clear-logs-btn', 'click', clearLogsUI);

	// Ações dos domínios (delegação de eventos)
	addDataAttributeListeners('data-action', 'click', handleDomainAction);
}

/**
 * Redireciona para a página de seleção de provedores do Auth.js
 *
 * A URL depende de VITE_AUTH_CALLBACK_PATH (configurado no .env)
 *
 * Vai para /auth/signin (ou /googleLogin/signin se configurado)
 * Essa página mostra os provedores disponíveis (botão "Sign in with Google")
 *
 * Fluxo:
 * 1. /auth/signin → página com botão "Sign in with Google"
 * 2. Usuário clica → /auth/signin/google (Auth.js faz isso)
 * 3. Google OAuth → /auth/callback/google
 */
function handleLoginClick() {
	const basePath = import.meta.env.VITE_AUTH_CALLBACK_PATH || '/auth';
	window.location.href = `${basePath}/signin`;
}

/**
 * Faz logout do usuário
 */
async function handleLogoutClick() {
	try {
		console.log('[DEBUG] Iniciando logout...');
		await logout();

		// Limpar estado local
		state.user = null;
		state.domains = [];
		state.diagnostics = null;
		state.logs = [];

		console.log('[DEBUG] Logout concluído, recarregando página...');

		// Recarregar página para garantir limpeza completa
		window.location.reload();
	} catch (err: any) {
		console.error('[DEBUG] Erro no logout:', err);
		alert(`Erro ao fazer logout: ${err.message}`);
	}
}

/**
 * Handler para clique no backdrop do modal
 */
function handleModalBackdropClick(e: MouseEvent) {
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
	const portInput = queryElement<HTMLInputElement>('port');
	const docRootInput = queryElement<HTMLInputElement>('documentRoot');

	toggleClass('port-group', 'hidden', !isNode);
	toggleClass('documentRoot-group', 'hidden', isNode);

	if (isNode) {
		portInput?.setAttribute('required', 'required');
		docRootInput?.removeAttribute('required');
	} else {
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
async function handleDomainAction(e: MouseEvent) {
	const btn = e.currentTarget as HTMLButtonElement;
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
async function handleFormSubmit(e: SubmitEvent) {
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
		console.log('[DEBUG] Carregando domínios...');
		state.domains = await getDomains();
		console.log('[DEBUG] Domínios carregados:', state.domains.length);
	} catch (err: any) {
		console.error('[DEBUG] Erro ao carregar domínios:', err);
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
 * Verifica autenticação do usuário
 */
async function loadAuth() {
	state.isCheckingAuth = true;
	render();

	try {
		const authData = await checkAuth();

		if (authData?.user) {
			state.user = authData.user;
		}
	} catch (err: any) {
		console.error('[Auth] Erro ao verificar autenticação:', err);
	} finally {
		state.isCheckingAuth = false;
		render();
	}
}

/**
 * Download de arquivo de configuração
 */
function downloadConfig(type: 'http' | 'https') {
	window.location.href = `${API_URL}/api/config/download/${type}`;
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

			const buttonId = `upload-${type}-btn`;
			const initialButton = queryElement<HTMLButtonElement>(buttonId);
			const originalText = initialButton?.textContent ?? '';

			if (initialButton) {
				initialButton.disabled = true;
				initialButton.textContent = 'Enviando...';
			}

			try {
				const result = await uploadConfigFile(type, content);

				// Recarregar domínios após upload bem-sucedido
				await loadDomains();

				// Mostrar resultado com output da validação
				console.log('Apache validation output:', result.validationOutput);
				alert(
					`✅ ${result.message}\n\n` +
					`Validação do Apache:\n${result.validationOutput}`
				);
			} catch (err: any) {
				console.error('Upload error:', err);
				alert(`❌ Erro ao enviar arquivo:\n\n${err.message}\n\nO arquivo anterior foi mantido.`);
			} finally {
				const refreshedButton = queryElement<HTMLButtonElement>(buttonId);
				if (refreshedButton) {
					refreshedButton.disabled = false;
					if (originalText) {
						refreshedButton.textContent = originalText;
					}
				}
			}
		} catch (err: any) {
			console.error('Upload error:', err);
			alert(`❌ Erro ao enviar arquivo:\n\n${err.message}\n\nO arquivo anterior foi mantido.`);
		}
	};

	// Abrir seletor de arquivo
	input.click();
}

/**
 * Toggle visibilidade do painel de logs
 */
function toggleLogs() {
	state.logsVisible = !state.logsVisible;
	render();
}

/**
 * Limpar logs
 */
async function clearLogsUI() {
	if (!confirm('Limpar todos os logs?')) return;

	try {
		await fetch(`${API_URL}/api/logs`, { method: 'DELETE' });
		state.logs = [];
		render();
	} catch (err: any) {
		alert(`Erro ao limpar logs: ${err.message}`);
	}
}

/**
 * Conecta ao stream de logs em tempo real via SSE
 */
function connectToLogStream() {
	const eventSource = new EventSource(`${API_URL}/api/logs/stream`);

	eventSource.onmessage = (event) => {
		const data = JSON.parse(event.data);

		if (data.type === 'init') {
			// Logs iniciais
			state.logs = data.logs;
			render();
		} else if (data.type === 'log') {
			// Novo log em tempo real
			state.logs.push(data.log);

			// Manter apenas os últimos 500
			if (state.logs.length > 500) {
				state.logs.shift();
			}

			render();

			// Auto-scroll para o final
			setTimeout(() => {
				const logsContainer = queryElement<HTMLDivElement>('logs-container');
				if (logsContainer) {
					logsContainer.scrollTop = logsContainer.scrollHeight;
				}
			}, 10);
		}
	};

	eventSource.onerror = (error) => {
		console.error('Erro no stream de logs:', error);
		eventSource.close();

		// Tentar reconectar após 5 segundos
		setTimeout(connectToLogStream, 5000);
	};

	return eventSource;
}

/**
 * Inicialização da aplicação
 */
async function init() {
	// Primeiro, verificar autenticação
	await loadAuth();

	// Se autenticado, carregar dados
	if (state.user) {
		console.log('[DEBUG] Usuário autenticado, carregando dados...');

		// Pequeno delay para garantir que cookies estão prontos
		await new Promise(resolve => setTimeout(resolve, 100));

		loadDomains();
		loadDiagnostics();
		connectToLogStream();
	} else {
		console.log('[DEBUG] Usuário não autenticado, mostrando tela de login');
		// Se não autenticado, apenas renderizar (mostrará tela de login)
		render();
	}
}

// Iniciar aplicação
init();

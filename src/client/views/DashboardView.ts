/**
 * DashboardView - Tela principal exibida quando o usuário ESTÁ autenticado
 *
 * Mostra:
 * - Status do sistema (diagnostics)
 * - Toolbar com botões de ação
 * - Lista de domínios
 * - Painel de logs (opcional)
 */

import type { Domain } from '../../shared/types.js';
import type { LogEntry } from '../../server/logger.js';
import { renderDomainsList, renderSystemStatus, renderLogsPanel } from '../render.js';

export interface DashboardViewProps {
	domains: Domain[];
	isLoading: boolean;
	error: string | null;
	diagnostics: any;
	logsVisible: boolean;
	logs: LogEntry[];
}

/**
 * Renderiza a view do dashboard (autenticado)
 */
export function renderDashboardView(props: DashboardViewProps): string {
	const { domains, isLoading, error, diagnostics, logsVisible, logs } = props;

	// Se há erro de autenticação, mostra aviso especial
	if (error && error.includes('Não autenticado')) {
		return `
			<div style="text-align: center; padding: 60px 20px;">
				<h2 style="color: #ef4444; margin-bottom: 12px;">⚠️ Erro de Autenticação</h2>
				<p style="color: #666; margin-bottom: 16px;">Sua sessão pode ter expirado ou há um problema com os cookies.</p>
				<p style="color: #999; font-size: 14px; margin-bottom: 24px;">
					Tente recarregar a página ou fazer login novamente.
				</p>
				<button class="btn btn-primary" onclick="window.location.reload()">🔄 Recarregar Página</button>
			</div>
		`;
	}

	return `
		${renderSystemStatus(diagnostics)}

		<div class="toolbar">
			<div class="toolbar-left">
				<button class="btn btn-secondary btn-small" id="download-http-btn">⬇ HTTP Config</button>
				<button class="btn btn-secondary btn-small" id="download-https-btn">⬇ HTTPS Config</button>
				<button class="btn btn-success btn-small" id="upload-http-btn">⬆ Upload HTTP</button>
			</div>
			<div class="toolbar-right">
				<button class="btn btn-secondary btn-small" id="toggle-logs-btn">
					${logsVisible ? '🔽 Ocultar Logs' : '🔼 Mostrar Logs'}
				</button>
				<button class="btn btn-primary" id="add-domain-btn">+ Adicionar Domínio</button>
			</div>
		</div>

		<div class="domains-list">
			${renderDomainsList(domains, isLoading, error)}
		</div>

		${logsVisible ? renderLogsPanel(logs) : ''}
	`;
}

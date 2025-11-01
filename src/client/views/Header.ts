/**
 * Header - Componente de cabeçalho da aplicação
 *
 * Renderiza:
 * - Título e descrição
 * - Estado de autenticação (loading, botão entrar, ou user info + botão sair)
 */

export interface User {
	id: string;
	email: string;
	name?: string;
	picture?: string;
}

export interface HeaderProps {
	isCheckingAuth: boolean;
	user: User | null;
}

/**
 * Renderiza o botão/informações de autenticação no header
 */
function renderAuthSection(props: HeaderProps): string {
	const { isCheckingAuth, user } = props;

	if (isCheckingAuth) {
		return '<span style="color: #666;">Verificando...</span>';
	}

	if (user) {
		return `
			<div style="display: flex; align-items: center; gap: 12px;">
				${user.picture ? `<img src="${user.picture}" alt="Avatar" style="width: 32px; height: 32px; border-radius: 50%;">` : ''}
				<span style="color: #333;">${user.name || user.email}</span>
				<button class="btn btn-secondary" id="logout-btn" type="button">Sair</button>
			</div>
		`;
	}

	return '<button class="btn btn-primary" id="login-btn" type="button">🔐 Entrar</button>';
}

/**
 * Renderiza o header completo
 */
export function renderHeader(props: HeaderProps): string {
	return `
		<div class="header">
			<div style="display: flex; justify-content: space-between; align-items: center;">
				<div>
					<h1>EC2 Manager</h1>
					<p>Gerenciador de domínios Apache e SSL (Certbot)</p>
				</div>
				${renderAuthSection(props)}
			</div>
		</div>
	`;
}

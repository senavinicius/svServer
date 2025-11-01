/**
 * LoginView - Tela exibida quando o usuário NÃO está autenticado
 *
 * Mostra mensagem de "Acesso Restrito" e botão para fazer login
 */

export interface LoginViewProps {
	isCheckingAuth: boolean;
}

/**
 * Renderiza a view de login (não autenticado)
 */
export function renderLoginView(props: LoginViewProps): string {
	const { isCheckingAuth } = props;

	if (isCheckingAuth) {
		return '<div style="text-align: center; padding: 40px; color: #666;">Carregando...</div>';
	}

	return `
		<div style="text-align: center; padding: 60px 20px;">
			<h2 style="color: #666; margin-bottom: 12px;">Acesso Restrito</h2>
			<p style="color: #999; margin-bottom: 24px;">Faça login para acessar o gerenciador</p>
		</div>
	`;
}

import { Router, type RequestHandler } from 'express';
import { existsSync, readFileSync } from 'fs';
import { replaceConfigFile } from '../manager.js';
import type { ApiResponse } from '../../shared/types.js';

interface AuthMiddleware {
	require: () => RequestHandler;
	optional: () => RequestHandler;
}

export function createConfigRoutes(auth: AuthMiddleware) {
	const router = Router();

	/**
	 * GET /api/config/download/:type - Download de arquivos de configuração
	 */
	router.get('/config/download/:type', auth.require(), (req, res) => {
		try {
			const { type } = req.params;

			let filePath: string;
			let fileName: string;

			switch (type) {
				case 'http':
					filePath = '/etc/httpd/conf.d/vhost.conf';
					fileName = 'vhost.conf';
					break;
				case 'https':
					filePath = '/etc/httpd/conf.d/vhost-le-ssl.conf';
					fileName = 'vhost-le-ssl.conf';
					break;
				default:
					return res.status(400).json({ success: false, error: 'Tipo inválido' });
			}

			if (!existsSync(filePath)) {
				return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
			}

			const content = readFileSync(filePath, 'utf-8');

			res.setHeader('Content-Type', 'text/plain');
			res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
			res.send(content);
		} catch (error: any) {
			res.status(500).json({ success: false, error: error.message });
		}
	});

	/**
	 * POST /api/config/upload/:type - Upload de arquivos de configuração com validação
	 */
	router.post('/config/upload/:type', auth.require(), async (req, res) => {
		try {
			const { type } = req.params;
			const { content } = req.body;

			if (!content || typeof content !== 'string') {
				return res.status(400).json({
					success: false,
					error: 'Conteúdo do arquivo é obrigatório'
				});
			}

			if (type !== 'http' && type !== 'https') {
				return res.status(400).json({
					success: false,
					error: 'Tipo inválido. Use "http" ou "https"'
				});
			}

			const result = await replaceConfigFile(type as 'http' | 'https', content);

			const response: ApiResponse = {
				success: true,
				data: result,
			};

			res.json(response);
		} catch (error: any) {
			const response: ApiResponse = {
				success: false,
				error: error.message,
			};
			res.status(400).json(response);
		}
	});

	return router;
}

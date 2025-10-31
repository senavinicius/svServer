import { Router, type RequestHandler } from 'express';
import { getAllLogs, clearLogs, addLogListener, removeLogListener, type LogEntry } from '../logger.js';
import type { ApiResponse } from '../../shared/types.js';

interface AuthMiddleware {
	require: () => RequestHandler;
	optional: () => RequestHandler;
}

export function createLogsRoutes(auth: AuthMiddleware) {
	const router = Router();

	/**
	 * GET /api/logs - Retorna todos os logs armazenados
	 */
	router.get('/logs', auth.require(), (_req, res) => {
		const logs = getAllLogs();
		const response: ApiResponse<LogEntry[]> = {
			success: true,
			data: logs,
		};
		res.json(response);
	});

	/**
	 * DELETE /api/logs - Limpa todos os logs
	 */
	router.delete('/logs', auth.require(), (_req, res) => {
		clearLogs();
		const response: ApiResponse = {
			success: true,
		};
		res.json(response);
	});

	/**
	 * GET /api/logs/stream - Server-Sent Events para logs em tempo real
	 */
	router.get('/logs/stream', auth.require(), (req, res) => {
		// Configurar SSE
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('Access-Control-Allow-Origin', '*');

		// Enviar logs existentes imediatamente
		const existingLogs = getAllLogs();
		res.write(`data: ${JSON.stringify({ type: 'init', logs: existingLogs })}\n\n`);

		// Criar listener para novos logs
		const listener = (entry: LogEntry) => {
			res.write(`data: ${JSON.stringify({ type: 'log', log: entry })}\n\n`);
		};

		// Adicionar listener
		addLogListener(listener);

		// Remover listener quando a conexão fechar
		req.on('close', () => {
			removeLogListener(listener);
			res.end();
		});
	});

	return router;
}

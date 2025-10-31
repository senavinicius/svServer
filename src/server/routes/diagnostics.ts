import { Router, type RequestHandler } from 'express';
import type { ApiResponse } from '../../shared/types.js';
import type { SystemStatus } from '../services/system.js';

interface AuthMiddleware {
	require: () => RequestHandler;
	optional: () => RequestHandler;
}

export function createDiagnosticsRoutes(auth: AuthMiddleware, systemStatus: SystemStatus) {
	const router = Router();

	/**
	 * GET /api/diagnostics - Retorna informações de diagnóstico do sistema
	 */
	router.get('/diagnostics', auth.require(), (_req, res) => {
		const response: ApiResponse<SystemStatus> = {
			success: true,
			data: {
				...systemStatus,
				server: {
					...systemStatus.server,
					uptime: process.uptime(),
				},
			},
		};

		res.json(response);
	});

	return router;
}

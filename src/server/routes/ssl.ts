import { Router, type RequestHandler } from 'express';
import { obtainSSL, renewSSL } from '../manager.js';
import type { ApiResponse } from '../../shared/types.js';

interface AuthMiddleware {
	require: () => RequestHandler;
	optional: () => RequestHandler;
}

export function createSSLRoutes(auth: AuthMiddleware) {
	const router = Router();

	/**
	 * POST /api/ssl/obtain - Obtém certificado SSL
	 */
	router.post('/ssl/obtain', auth.require(), async (req, res) => {
		try {
			const { domain } = req.body;
			await obtainSSL(domain);

			const response: ApiResponse = {
				success: true,
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

	/**
	 * POST /api/ssl/renew - Renova certificado SSL
	 */
	router.post('/ssl/renew', auth.require(), async (req, res) => {
		try {
			const { domain } = req.body;
			await renewSSL(domain);

			const response: ApiResponse = {
				success: true,
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

import { Router, type RequestHandler } from 'express';
import { getAllVirtualHosts } from '../parser.js';
import { addDomain, removeDomain, updateDomain } from '../manager.js';
import type { CreateDomainDTO, UpdateDomainDto, ApiResponse, Domain, VirtualHost } from '../../shared/types.js';
import { groupDomains } from '../services/system.js';

interface AuthMiddleware {
	require: () => RequestHandler;
	optional: () => RequestHandler;
}

export function createDomainsRoutes(auth: AuthMiddleware) {
	const router = Router();

	/**
	 * GET /api/domains - Lista todos os domínios
	 */
	router.get('/domains', auth.require(), async (_req, res) => {
		try {
			const vhosts = await getAllVirtualHosts();
			const domains = groupDomains(vhosts);

			const response: ApiResponse<Domain[]> = {
				success: true,
				data: domains,
			};

			res.json(response);
		} catch (error: any) {
			const response: ApiResponse = {
				success: false,
				error: error.message,
			};
			res.status(500).json(response);
		}
	});

	/**
	 * GET /api/vhosts - Lista todos os VirtualHosts (raw)
	 */
	router.get('/vhosts', auth.require(), async (_req, res) => {
		try {
			const vhosts = await getAllVirtualHosts();

			const response: ApiResponse<VirtualHost[]> = {
				success: true,
				data: vhosts,
			};

			res.json(response);
		} catch (error: any) {
			const response: ApiResponse = {
				success: false,
				error: error.message,
			};
			res.status(500).json(response);
		}
	});

	/**
	 * POST /api/domains - Adiciona um novo domínio
	 */
	router.post('/domains', auth.require(), async (req, res) => {
		try {
			const dto: CreateDomainDTO = req.body;
			await addDomain(dto);

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
	 * PUT /api/domains/:serverName - Atualiza um domínio
	 */
	router.put('/domains/:serverName', auth.require(), async (req, res) => {
		try {
			const { serverName } = req.params;
			const dto: UpdateDomainDto = req.body;
			await updateDomain(serverName, dto);

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
	 * DELETE /api/domains/:serverName - Remove um domínio
	 */
	router.delete('/domains/:serverName', auth.require(), async (req, res) => {
		try {
			const { serverName } = req.params;
			await removeDomain(serverName);

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

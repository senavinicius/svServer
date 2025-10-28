# Arquitetura

## Stack

- **Frontend**: Vite + TypeScript vanilla + svFramework
- **Backend**: Node.js 18+ + Express 5.x
- **Execução**: Local no EC2 via `child_process`

## Por que Express?

Mais maduro, maior comunidade, simplicidade. Alternativas (Fastify, Hono) são mais novas/menos recursos.

## Fluxo

```
Browser → Express API → child_process → Apache/Certbot
(tudo no mesmo EC2)
```

## Estrutura

```
src/
├── client/          # Frontend
├── server/          # Backend
└── shared/          # Types compartilhados
```

## Comunicação

- **Frontend ↔ Backend**: REST API (fetch)
- **Backend ↔ Sistema**: child_process.exec/spawn + fs

## Observabilidade

- Logger em memória (`src/server/logger.ts`) concentra operações sensíveis com níveis DEBUG/INFO/WARN/ERROR.
- Históricos ficam limitados a 500 entradas e são transmitidos via Server-Sent Events (`/api/logs/stream`).
- UI consome o stream para painel em tempo real; APIs REST permitem listar (`GET /api/logs`) e limpar (`DELETE /api/logs`) o buffer.

## Servidor

- **OS**: Amazon Linux 2023
- **Usuário**: ec2-user
- **Apache**: httpd (comando: `systemctl reload httpd`)
- **Apps**: `/webapp/<domain>/`
- **Sudoers**: Já configurado para certbot, systemctl, etc

## Segurança

- Sanitizar inputs antes de `child_process`
- Validar domínios (regex)
- Sudoers já permite comandos necessários sem senha

## Deploy

- Desenvolvimento: `npm run dev`
- Produção: PM2 ou systemd
- Acesso: Apache reverse proxy ou porta direta

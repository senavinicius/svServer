# Arquitetura

## Stack

- **Frontend**: Vite + TypeScript vanilla + svFramework
- **Backend**: Node.js 18+ + Express 4.x
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

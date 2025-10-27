# Agent Onboarding

## Use These As Entry Points
- `README.md` — estado atual do produto, comandos básicos e fluxo de deploy; sempre confira aqui primeiro ao assumir novas tarefas.
- `docs/SETUP.md` — caminhos reais do Apache, Certbot e permissões no EC2; combine com `SUDOERS_CONFIG.md` para ajustes de sudo.
- `docs/ARCHITECTURE.md` — visão macro da arquitetura; versões atualizadas estão em `package.json` (Express 5.1.0) e devem prevalecer caso haja divergência.
- `docs/CLIENT_ARCHITECTURE.md` — mapa detalhado do frontend em `src/client/`.
- `docs/DECISIONS.md` e `docs/MVP.md` — decisões assumidas e escopo mínimo já implementado.

## Código-Fonte: onde começar
- `src/shared/types.ts` centraliza os DTOs (`Domain`, `VirtualHost`, `CreateDomainDTO`, etc.) usados por cliente e servidor. Ajuste aqui antes de tocar API ou UI.
- `src/server/index.ts` implementa a API Express (5.x) descrita no README: rotas para domínios, SSL, diagnósticos e upload/download de configs. Veja `groupDomains()` para entender a projeção de VirtualHosts.
- `src/server/manager.ts` encapsula operações de escrita/reload Apache e Certbot; toda alteração atinge diretamente o sistema.
- `src/server/parser.ts` faz o parse dos arquivos `vhost.conf`/`vhost-le-ssl.conf` e agrega metadados de subdomínios e SSL.
- `src/client/main.ts`, `render.ts`, `api.ts`, `dom.ts`, `style.css` compõem o frontend Vite. A organização e padrões estão detalhados em `docs/CLIENT_ARCHITECTURE.md`.

## Comandos
- `npm run dev` / `npm run dev:server` / `npm run dev:all` — laços de desenvolvimento (scripts confirmados em `package.json`).
- `npm run build` — `tsc` (noEmit) + `vite build`, gera `dist/`.
- `npm run start` usa `tsx` diretamente em `src/server/index.ts`; `npm run server` roda o bundle de produção.

## Regras Operacionais
- Trabalhe diretamente no EC2 e mantenha cada alteração mínima e objetiva; evite camadas ou fluxos extras.
- Ao criar domínios/subdomínios (`addDomain`), certifique-se de que Certbot seja executado automaticamente e que qualquer falha de Apache ou Certbot chegue integralmente à interface.
- Consulte `docs/DEV_MODE.md` apenas para o fluxo de trabalho no servidor (watcher, build, diagnósticos).
- Ao remover domínios, apenas os VirtualHosts são limpos; certificados emitidos continuam em `/etc/letsencrypt` até que um operador execute `sudo certbot delete --cert-name <domínio>`.

## Infra e Permissões
- `docs/SETUP.md` + `SUDOERS_CONFIG.md` explicam os comandos que precisam de `NOPASSWD` (cp, chmod, systemctl, certbot, etc.). `replaceConfigFile()` em `src/server/manager.ts` depende exatamente dessas permissões.
- Logs/diagnósticos são expostos via `/api/diagnostics` (veja `systemStatus` em `src/server/index.ts` para o payload).

## Estados e Próximos Passos
- Consulte `docs/DECISIONS.md` para premissas vigentes (ex.: PHP legado apenas leitura, padrão `node` para novos domínios).
- Garanta que alterações mantenham `docs/ARCHITECTURE.md` e `package.json` coerentes (Express 5.x).
- Não há testes automatizados configurados; adicionar Vitest/supertest deve seguir as orientações de `docs/GUIDELINES.md`.

## Checklist rápido ao iniciar tarefas
1. Confirmar a forma dos DTOs em `src/shared/types.ts`.
2. Verificar se a alteração exige tocar nas permissões documentadas (`docs/SETUP.md`, `SUDOERS_CONFIG.md`).
3. Validar rotas e efeitos colaterais em `src/server/index.ts`/`manager.ts`.
4. Revisar impactos na UI via `docs/CLIENT_ARCHITECTURE.md` e `src/client/*`.
5. Garanta que mensagens de erro relevantes apareçam para o usuário final.

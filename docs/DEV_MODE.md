# Modo de Trabalho no Servidor

## Ambiente
- Amazon Linux 2023 com Apache httpd e Certbot instalados.
- Usuário `ec2-user` com permissões sudo conforme `SUDOERS_CONFIG.md`.

## Fluxo Diário (objetivo)
1. `npm install` (apenas após atualizações de dependências).
2. `npm run dev:server` para rodar a API em modo watch.
3. `npm run dev` se precisar ajustar o frontend com hot reload.
4. `npm run build` + `npm run server` ao validar o pacote gerado.

Todos os comandos operam diretamente nos arquivos reais (`/etc/httpd/conf.d`, `/etc/letsencrypt`). Trabalhe sempre sabendo que qualquer alteração persiste no servidor.

## Diagnóstico rápido
- Logs em tempo real: saída do `npm run dev:server`.
- Painel de logs no dashboard: `/api/logs/stream` alimenta o SSE usado no frontend para exibir as últimas 500 entradas (toggle e clear disponíveis na UI).
- Endpoint `/api/diagnostics`: mostra estado lido na inicialização (arquivos locais, versão do Node, etc.).
- Após editar configs, confirme com `apachectl configtest` (já executado pelo backend antes de recarregar).

## Notas
- Mantenha as mudanças mínimas e objetivas. Evite criar camadas extras para simulação ou ambientes artificiais.
- Ao tocar Certbot ou Apache, confirme que as permissões descritas em `docs/SETUP.md` e `SUDOERS_CONFIG.md` permanecem válidas.

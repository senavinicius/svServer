# EC2 Manager

Dashboard web para gerenciar Apache e Certbot no próprio servidor EC2 t4g.small.

## Stack

- **Frontend**: Vite + TypeScript vanilla
- **Backend**: Node.js 18+ + Express 5.x
- **Servidor**: Amazon Linux 2023 (ARM64)

## Funcionalidades Implementadas (MVP)

✅ **Listar Domínios**
- Detecta automaticamente tipo: Node (ProxyPass), Static (DocumentRoot), PHP (legado)
- Exibe porta/path e status SSL
- Agrupa subdomínios abaixo do domínio principal

✅ **Adicionar Domínio/Subdomínio**
- Suporte para Node (Proxy) e Static (DocumentRoot)
- Validação automática de domínio
- Reload automático do Apache

✅ **Editar Domínio**
- Alterar porta (Node) ou path (Static)
- Atualização automática do VirtualHost

✅ **Gerenciar SSL**
- Obter certificado SSL via Certbot
- Renovar certificados existentes
- Exibir status e data de expiração

✅ **Remover Domínio**
- Remove VirtualHost e recarrega Apache
- PHP legado apenas listado (sem edição/remoção)
- Certificados existentes permanecem nos diretórios do Certbot; execute `sudo certbot delete --cert-name <domínio>` manualmente se precisar removê-los

✅ **Logs em Tempo Real**
- Consolida todas as operações sensíveis (Apache, Certbot, filesystem)
- Exibe painel ao vivo no frontend com Server-Sent Events
- Permite limpar histórico diretamente pela UI ou endpoint dedicado

## Docs

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Stack e estrutura
- [SETUP.md](./docs/SETUP.md) - Informações do servidor
- [MVP.md](./docs/MVP.md) - Escopo e funcionalidades
- [DECISIONS.md](./docs/DECISIONS.md) - Decisões técnicas

## Instalação e Uso

### 1. Execução no EC2 (Amazon Linux 2023)

```bash
npm install
npm run dev:server   # Backend em modo watch (Express 5 + tsx)
npm run dev          # Opcional: Vite para hot reload do cliente
npm run dev:all      # Opcional: frontend + backend em paralelo
```

📖 Ver [DEV_MODE.md](./docs/DEV_MODE.md) para boas práticas ao trabalhar diretamente na instância.

### 2. Build para Produção

```bash
npm run build
```

### 3. Deploy no EC2

```bash
# No servidor EC2
git clone <repo-url> ec2-manager
cd ec2-manager
npm install
npm run build

# Rodar com PM2 (recomendado)
pm2 start src/server/index.ts --name ec2-manager --interpreter tsx
pm2 save
pm2 startup

# Ou rodar diretamente
npm run server
```

### 4. Configurar Apache Reverse Proxy (opcional)

Para acessar via domínio (ex: `manager.example.com`):

```apache
<VirtualHost *:80>
    ServerName manager.example.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3100/
    ProxyPassReverse / http://127.0.0.1:3100/
</VirtualHost>
```

## Requisitos do Servidor

- **OS**: Amazon Linux 2023
- **Usuário**: ec2-user
- **Apache**: httpd instalado
- **Node.js**: 18+
- **Certbot**: Instalado e configurado
- **Sudoers**: Configurado conforme [SETUP.md](./docs/SETUP.md)

## Estrutura do Projeto

```
src/
├── client/          # Frontend (TypeScript + CSS)
│   ├── main.ts      # Ponto de entrada e gerenciamento de estado
│   ├── render.ts    # Funções de renderização de UI
│   ├── dom.ts       # Utilitários de manipulação DOM
│   ├── api.ts       # Cliente HTTP para comunicação com backend
│   └── style.css    # Estilos CSS (organizado por seções)
├── server/          # Backend (Express)
│   ├── index.ts     # API REST
│   ├── parser.ts    # Parser de VirtualHost
│   └── manager.ts   # Operações Apache/Certbot
└── shared/          # Types compartilhados
    └── types.ts
```

### Arquitetura do Cliente

O código do cliente está organizado em módulos especializados:

- **main.ts**: Gerencia o estado global da aplicação e orquestra a UI
- **render.ts**: Contém todas as funções de renderização (componentes em template strings)
- **dom.ts**: Fornece utilitários type-safe para manipulação do DOM
- **api.ts**: Abstrai toda comunicação HTTP com o backend
- **style.css**: Estilos organizados em seções bem definidas:
  - Reset e Base
  - Layout Principal
  - Botões
  - Lista de Domínios
  - Modal e Formulários
  - Estados e Mensagens
  - Diagnósticos e Status do Sistema

## API Endpoints

### Domínios
- `GET /api/domains` - Lista domínios agrupados
- `GET /api/vhosts` - Lista VirtualHosts raw
- `POST /api/domains` - Adiciona domínio
- `PUT /api/domains/:serverName` - Atualiza domínio
- `DELETE /api/domains/:serverName` - Remove domínio

### SSL
- `POST /api/ssl/obtain` - Obtém certificado SSL
- `POST /api/ssl/renew` - Renova certificado SSL

### Config
- `POST /api/config/upload/:type` - Substitui `vhost.conf` ou `vhost-le-ssl.conf` com validação e reload automático
- `GET /api/config/download/:type` - Download dos arquivos atuais de configuração

### Logs
- `GET /api/logs` - Lista os últimos 500 registros em memória
- `DELETE /api/logs` - Limpa o buffer de logs
- `GET /api/logs/stream` - Stream SSE para acompanhar logs em tempo real no navegador

## Filosofia

1. Usar bibliotecas prontas sempre que possível
2. Criar micro-projetos separados para código reutilizável
3. Este projeto contém APENAS código específico para EC2/Apache/Certbot

## Status

✅ MVP Implementado - Pronto para testes

# EC2 Manager

Dashboard web para gerenciar Apache e Certbot no próprio servidor EC2 t4g.small.

## Stack

- **Frontend**: Vite + TypeScript vanilla
- **Backend**: Node.js 18+ + Express 5.x
- **Servidor**: Amazon Linux 2023 (ARM64)
- **Autenticação**: [@vinicius/auth](https://github.com/senavinicius/svAuth) (Google OAuth via Auth.js)

## Arquitetura Modular

Este projeto segue uma **arquitetura modularizada e profissional**:

- **`@vinicius/auth`** é um projeto separado mantido via GitHub
- Importado como dependência via npm: `"@vinicius/auth": "git+https://github.com/senavinicius/svAuth.git#main"`
- ❌ **Proibido**: Acesso local entre projetos via filesystem
- ✅ **Correto**: Integração via npm/GitHub para reutilização adequada

### Por que essa arquitetura?

1. **Separação de responsabilidades**: Autenticação é uma preocupação transversal reutilizável
2. **Versionamento independente**: Mudanças no auth não afetam o core do EC2 Manager
3. **Reutilização**: Outros projetos podem usar `@vinicius/auth` facilmente
4. **Profissionalismo**: Segue padrões da indústria (microserviços, modularização)

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
├── client/                # Frontend (TypeScript + CSS)
│   ├── views/            # 📂 Views/Páginas separadas por responsabilidade
│   │   ├── Header.ts     # Componente de cabeçalho (auth state + user info)
│   │   ├── LoginView.ts  # Tela para usuários não-autenticados
│   │   └── DashboardView.ts # Tela principal (autenticado)
│   ├── main.ts           # Orquestração e gerenciamento de estado
│   ├── render.ts         # Componentes reutilizáveis (domains, modal, logs)
│   ├── dom.ts            # Utilitários type-safe para manipulação DOM
│   ├── api.ts            # Cliente HTTP (inclui credentials para auth)
│   └── style.css         # Estilos CSS (organizado por seções)
├── server/               # Backend (Express)
│   ├── routes/           # Rotas da API (domains, ssl, config, logs, diagnostics)
│   ├── services/         # Lógica de negócio
│   ├── index.ts          # Entry point + middleware setup
│   ├── parser.ts         # Parser de VirtualHost Apache
│   ├── manager.ts        # Operações Apache/Certbot (via sudo)
│   └── logger.ts         # Sistema de logs em memória
└── shared/               # Types compartilhados (client + server)
    └── types.ts
```

### Arquitetura do Cliente (Frontend)

O frontend segue uma **arquitetura baseada em views separadas**, com responsabilidades bem definidas:

#### 📁 Views (Páginas)
- **`Header.ts`** - Componente de cabeçalho reutilizável
  - Exibe estado de auth (loading, botão "Entrar", ou user info)
  - Renderiza avatar, nome e botão "Sair" quando logado

- **`LoginView.ts`** - Tela para usuários **não-autenticados**
  - Mensagem "Acesso Restrito"
  - Loading state enquanto verifica autenticação

- **`DashboardView.ts`** - Tela principal para usuários **autenticados**
  - Status do sistema (diagnostics)
  - Toolbar com ações (download/upload configs, toggle logs)
  - Lista de domínios
  - Painel de logs (opcional)

#### 🔧 Módulos Core
- **`main.ts`** - Orquestração da aplicação
  - Gerencia estado global
  - Seleciona view apropriada (LoginView vs DashboardView)
  - Coordena lifecycle (init, auth check, data loading)

- **`render.ts`** - Componentes reutilizáveis
  - Lista de domínios (`renderDomainsList`)
  - Modal de add/edit (`renderModal`)
  - Status SSL, botões de ação, logs, etc.

- **`dom.ts`** - Utilitários DOM type-safe
  - Event listeners com null-safety
  - Seletores tipados

- **`api.ts`** - Cliente HTTP
  - Wrapper para fetch com `credentials: 'include'`
  - Tratamento de erros centralizado
  - Funções para todas as rotas da API

#### 🎨 Estilos
- **`style.css`** - Organizado em seções:
  - Reset e Base
  - Layout Principal
  - Botões
  - Lista de Domínios
  - Modal e Formulários
  - Estados e Mensagens
  - Diagnósticos e Status do Sistema

### Separação de Responsabilidades

✅ **Views separadas** - LoginView e DashboardView em arquivos próprios
✅ **Estado centralizado** - Gerenciado no `main.ts`
✅ **Componentes reutilizáveis** - Funções de renderização no `render.ts`
✅ **Type-safety** - TypeScript com interfaces bem definidas
✅ **Autenticação integrada** - Cookies enviados automaticamente em todas as requisições

## API Endpoints

### Autenticação (fornecida por @vinicius/auth)

**Base path**: `/googleLogin` (configurável via `AUTH_GOOGLE_CALLBACK_PATH`)

- `GET /googleLogin/session` - Retorna sessão atual (usado pelo frontend para verificar login)
- `POST /googleLogin/signin/google` - Inicia fluxo OAuth com Google
- `GET /googleLogin/callback/google` - Callback OAuth (registrado no Google Console)
- `POST /googleLogin/signout` - Faz logout
- `GET /googleLogin/csrf` - Retorna token CSRF para login

**Importante**: Todos os endpoints da API abaixo requerem autenticação (exceto `/googleLogin/*`)

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

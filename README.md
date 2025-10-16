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

## Docs

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - Stack e estrutura
- [SETUP.md](./docs/SETUP.md) - Informações do servidor
- [MVP.md](./docs/MVP.md) - Escopo e funcionalidades
- [DECISIONS.md](./docs/DECISIONS.md) - Decisões técnicas

## Instalação e Uso

### 1. Desenvolvimento Local (Mac/Windows)

O sistema detecta automaticamente quando está rodando fora do Linux e usa **dados mockados**. Todas as funcionalidades funcionam com simulação!

```bash
npm install
npm run dev          # Frontend (Vite) na porta 5173
npm run dev:server   # Backend (Express) na porta 3100
npm run dev:all      # Ambos em paralelo
```

📖 Ver [DEV_MODE.md](./docs/DEV_MODE.md) para detalhes sobre desenvolvimento local.

**O que funciona no Mac/Windows:**
- ✅ Listar domínios (mockados)
- ✅ Adicionar/editar/remover (simulado)
- ✅ SSL obter/renovar (simulado)
- ✅ Interface completa testável

### 2. Build para Produção

```bash
npm run build
```

### 3. Deploy no EC2

```bash
# No servidor EC2
git clone <repo-url>
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
│   ├── main.ts
│   ├── api.ts
│   └── style.css
├── server/          # Backend (Express)
│   ├── index.ts     # API REST
│   ├── parser.ts    # Parser de VirtualHost
│   └── manager.ts   # Operações Apache/Certbot
└── shared/          # Types compartilhados
    └── types.ts
```

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

## Filosofia

1. Usar bibliotecas prontas sempre que possível
2. Criar micro-projetos separados para código reutilizável
3. Este projeto contém APENAS código específico para EC2/Apache/Certbot

## Status

✅ MVP Implementado - Pronto para testes

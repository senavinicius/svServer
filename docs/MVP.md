# MVP - Mínimo Viável

## Conceito Principal

**Domínios ≠ Pastas (relação N:1)**

Domínios apontam para pastas/portas via VirtualHost:
- `example.com` → Node port 3000
- `api.example.com` → Node port 3001
- `game.example.com` → Static `/webapp/game/dist/`

## Tipos de Configuração

### Node (Proxy) - PADRÃO para novos
```apache
<VirtualHost *:80>
    ServerName example.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
    ErrorLog /var/log/httpd/example-error.log
    CustomLog /var/log/httpd/example-access.log combined
</VirtualHost>
```

### Static (DocumentRoot)
```apache
<VirtualHost *:80>
    ServerName game.example.com
    DocumentRoot /webapp/game/dist
    <Directory "/webapp/game/dist">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    DirectoryIndex index.html
    ErrorLog /var/log/httpd/game-error.log
    CustomLog /var/log/httpd/game-access.log combined
</VirtualHost>
```

### PHP (Legado) - Apenas listar
```apache
<VirtualHost *:80>
    ServerName old.example.com
    DocumentRoot /var/www/php-app
    <Directory "/var/www/php-app">
        Options Indexes FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
    # Detectar PHP por presença de handlers/módulos PHP no config
</VirtualHost>
```

**Sistema não cria/edita PHP**, apenas **lista os existentes**.

## Funcionalidades MVP

### 1. Listar Domínios
- Ler `/etc/httpd/conf.d/vhost.conf`
- Parsear VirtualHosts
- Detectar tipo: Node (ProxyPass) / Static (DocumentRoot) / PHP (legado)
- Exibir: domínio, tipo, porta/path, SSL status
- Agrupar subdomínios abaixo do domínio principal
- **PHP legado**: apenas listar (sem botões criar/editar)

### 2. Adicionar Domínio/Subdomínio
- Input: domínio (ex: `cammila.example.com`)
- Algoritmo detecta se domínio principal existe
- Escolher tipo: Node (porta) ou Static (path)
- Gerar VirtualHost apropriado
- `apachectl configtest`
- `systemctl reload httpd`

### 3. Editar Domínio
- Trocar porta (se Node)
- Trocar path (se Static)
- Atualizar VirtualHost
- Reload httpd

### 4. SSL
- Botão "Obter SSL"
- Executar `certbot --apache -d <domain>`
- Botão "Renovar SSL"

### 5. Remover Domínio
- Remover VirtualHost do `vhost.conf`
- Reload httpd

## Interface Básica

```
┌──────────────────────────────────────────┐
│  EC2 Manager                             │
├──────────────────────────────────────────┤
│  [+ Adicionar Domínio]                   │
├──────────────────────────────────────────┤
│                                          │
│  📡 example.com → Node :3000             │
│     SSL: ✅ Expira 15/01/2025            │
│     [Editar] [Renovar SSL] [Remover]     │
│                                          │
│     ↳ api.example.com → Node :3001       │
│        SSL: ❌ Não configurado           │
│        [Editar] [Obter SSL] [Remover]    │
│                                          │
│  📁 game.example.com → /webapp/game/dist │
│     SSL: ⚠️ Expira em 5 dias             │
│     [Editar] [Renovar SSL] [Remover]     │
│                                          │
└──────────────────────────────────────────┘
```

## Tech Stack

- Frontend: Vite + TypeScript + svFramework
- Backend: Express + child_process + fs
- Parse: Apache config direto (sem DB)

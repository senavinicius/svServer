# Decisões Tomadas

## Core
- ✅ Múltiplos domínios podem apontar para mesma pasta (N:1)
- ✅ Subdomínios tratados automaticamente
- ✅ Usar svFramework no frontend
- ✅ Sem autenticação (ainda)
- ✅ Permissões: `ec2-user:apache`

## SSL
- ✅ Certbot automático (`--apache`)
- ✅ Botão renovar SSL na interface

## Tipos de Configuração

### Node (Proxy)
```apache
ProxyPreserveHost On
ProxyPass / http://127.0.0.1:PORT/
ProxyPassReverse / http://127.0.0.1:PORT/
```

### Static (DocumentRoot)
```apache
DocumentRoot /path/to/dist
<Directory "/path/to/dist">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
DirectoryIndex index.html
```

**Padrão para novos domínios**: Node (Proxy)

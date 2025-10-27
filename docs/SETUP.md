# Setup - Informações do Servidor

## Servidor Confirmado

- **OS**: Amazon Linux 2023
- **Usuário**: ec2-user
- **Apache**: httpd (não apache2)
- **Diretório apps**: `/webapp/`

## Paths

### Apache
- **VirtualHost HTTP**: `/etc/httpd/conf.d/vhost.conf`
- **VirtualHost HTTPS**: `/etc/httpd/conf.d/vhost-le-ssl.conf` (gerado pelo certbot)
- **Reload**: `sudo systemctl reload httpd`
- **Test config**: `apachectl configtest`

### Certbot
- **Certs**: `/etc/letsencrypt/live/<domain>/`
- **Renewal**: `/etc/letsencrypt/renewal/<domain>.conf`
- **Comando**: `sudo certbot --apache -d <domain>`

### Sudoers (configuração necessária)

**Editar sudoers:**
```bash
sudo visudo
```

**Adicionar estas linhas:**
```
ec2-user ALL=(root) NOPASSWD: /usr/bin/systemctl reload httpd
ec2-user ALL=(root) NOPASSWD: /usr/bin/systemctl restart httpd
ec2-user ALL=(root) NOPASSWD: /usr/bin/certbot
ec2-user ALL=(root) NOPASSWD: /usr/bin/ln
ec2-user ALL=(root) NOPASSWD: /usr/bin/rm
ec2-user ALL=(root) NOPASSWD: /usr/bin/mv
ec2-user ALL=(root) NOPASSWD: /usr/sbin/apachectl
ec2-user ALL=(root) NOPASSWD: /usr/bin/cp
ec2-user ALL=(root) NOPASSWD: /usr/bin/chmod
ec2-user ALL=(root) NOPASSWD: /usr/bin/test
```

**Verificar:**
```bash
sudo -l
```

## Permissões

- **Owner**: `ec2-user:apache`
- **Diretórios**: 755
- **Arquivos**: 644

## Conceito de Mapeamento

**NÃO é 1:1!** Vários domínios podem apontar para a mesma pasta.

Exemplo:
- `example.com` → `/webapp/mainwebapp/`
- `test.com` → `/webapp/mainwebapp/` (mesma pasta!)
- `api.example.com` → `/webapp/api-app/`
- `blog.example.com` → `/webapp/blog/`

O gerenciador **lê e edita** o `DocumentRoot` de cada VirtualHost.

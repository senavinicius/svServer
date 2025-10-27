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

**Criar/editar arquivo de sudoers do ec2-user:**
```bash
sudo vim /etc/sudoers.d/ec2-user
```

**IMPORTANTE:** Use `/etc/sudoers.d/` ao invés de editar `/etc/sudoers` diretamente!

**Adicionar estas linhas no arquivo:**
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

**Salvar e sair do vim:**
- Aperte `i` para entrar no modo INSERT
- Cole as linhas
- Aperte `ESC` para sair do modo INSERT
- Digite `:wq` e aperte `ENTER`

**Verificar permissões:**
```bash
sudo -l
```

Deve listar todos os comandos acima.

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

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

**IMPORTANTE - Permissões do Let's Encrypt:**

Por padrão, os diretórios do Let's Encrypt são 700 (apenas root pode ler).
Isso impede o Apache de ler os certificados quando roda como usuário não-root.

**Corrigir permissões (necessário após instalar certbot):**
```bash
sudo chmod 711 /etc/letsencrypt/live
sudo chmod 711 /etc/letsencrypt/archive
```

**Explicação:**
- `711` = Owner (root) tem acesso total, outros podem **executar** (entrar no diretório)
- Isso permite que Apache leia os certificados dentro, mas não liste o conteúdo
- Os arquivos de certificado dentro mantêm suas permissões seguras (644)
- **Sintoma se não configurar:** `apachectl configtest` falha com "SSLCertificateFile: file does not exist or is empty"

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

---

## Troubleshooting

### Erro: "SSLCertificateFile: file does not exist or is empty"

**Sintoma:** `apachectl configtest` falha dizendo que certificado SSL não existe, mas o arquivo existe.

**Causa:** Diretórios do Let's Encrypt com permissões 700 (apenas root pode ler).

**Solução:**
```bash
sudo chmod 711 /etc/letsencrypt/live
sudo chmod 711 /etc/letsencrypt/archive
```

**Verificar se resolveu:**
```bash
sudo -u apache test -r /etc/letsencrypt/live/seu-dominio.com/fullchain.pem && echo "OK" || echo "NEGADO"
```

### Erro: "sudo: sorry, user ec2-user is not allowed to execute..."

**Sintoma:** Comandos com sudo falham no Node.js.

**Causa:** Sudoers não configurado ou incompleto.

**Solução:** Verifique se todas as linhas do sudoers estão configuradas (veja seção "Sudoers" acima).

**Verificar:**
```bash
sudo -l
```

Deve listar todos os comandos: systemctl, certbot, apachectl, cp, chmod, test, ln, rm, mv.

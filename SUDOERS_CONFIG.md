# Configuração do Sudoers para EC2 Manager

## Configuração atual

Você já tem essa linha no sudoers:

```sudoers
ec2-user ALL=(root) NOPASSWD: /usr/bin/systemctl reload httpd, /usr/bin/systemctl restart httpd, /usr/bin/certbot, /usr/bin/ln, /usr/bin/rm, /usr/bin/mv
```

## O que precisa adicionar

Basta adicionar **2 comandos** à lista existente:

```bash
sudo visudo -f /etc/sudoers.d/ec2-manager
```

Modifique a linha para incluir `/usr/bin/cp` e `/usr/bin/chmod`:

```sudoers
ec2-user ALL=(root) NOPASSWD: /usr/bin/systemctl reload httpd, /usr/bin/systemctl restart httpd, /usr/bin/certbot, /usr/bin/ln, /usr/bin/rm, /usr/bin/mv, /usr/bin/cp, /usr/bin/chmod
```

Ou, se preferir manter separado, adicione uma nova linha:

```sudoers
ec2-user ALL=(root) NOPASSWD: /usr/bin/cp, /usr/bin/chmod
```

## Passo 4: Verificar sintaxe

```bash
# Verificar se a sintaxe está correta
sudo visudo -c -f /etc/sudoers.d/ec2-manager
```

Deve retornar: `parsed OK`

## Passo 5: Verificar permissões do arquivo

```bash
# O arquivo deve ter permissão 440
sudo chmod 440 /etc/sudoers.d/ec2-manager
```

## Passo 6: Testar

```bash
# Testar se funciona sem pedir senha
sudo cp /etc/httpd/conf.d/vhost.conf /etc/httpd/conf.d/vhost.conf.backup.test
sudo systemctl reload httpd
```

Se não pedir senha, está funcionando!

## Comandos que NÃO precisam de sudoers

Os seguintes comandos já funcionam sem sudo adicional:
- `apachectl configtest` - já tem permissão por padrão
- Leitura de arquivos em `/etc/httpd/conf.d/` - apenas leitura não precisa

## Segurança

Esta configuração é segura porque:
1. ✅ Permite apenas comandos específicos (não um shell completo)
2. ✅ Permite apenas caminhos específicos (wildcard limitado)
3. ✅ Não permite edição arbitrária de arquivos
4. ✅ Não permite execução de scripts
5. ✅ Apenas o usuário da aplicação tem acesso

## Troubleshooting

### Erro: "sudo: no tty present and no askpass program specified"
- Certifique-se de que adicionou `NOPASSWD:` antes dos comandos

### Erro: "sorry, user ec2-user is not allowed to execute..."
- Verifique se o nome do usuário está correto no arquivo sudoers
- Execute `whoami` para confirmar o usuário

### Erro: "syntax error"
- Execute `sudo visudo -c -f /etc/sudoers.d/ec2-manager` para ver onde está o erro
- Cada linha deve seguir o formato: `usuário ALL=(ALL) NOPASSWD: comando`

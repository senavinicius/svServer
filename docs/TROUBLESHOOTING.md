# Troubleshooting - EC2 Manager

Guia para diagnosticar e resolver problemas comuns.

---

## 🔴 Problema: "Nome aparece mas mostra erro 'Não autenticado'"

### Sintomas
- Nome do usuário e avatar aparecem no header
- Mensagem "❌ Erro: Não autenticado" aparece no conteúdo

### Causa Provável
A verificação de sessão (`/googleLogin/session`) funciona, mas as chamadas para APIs protegidas (`/api/domains`, `/api/diagnostics`) falham porque os cookies não estão sendo enviados ou reconhecidos.

### Debug Passo a Passo

#### 1. Abra DevTools do Navegador
- Pressione `F12` ou `Ctrl+Shift+I` (Windows/Linux) ou `Cmd+Option+I` (Mac)
- Vá para aba **Console**

#### 2. Verifique os Logs
Procure por logs com prefixos `[API]` e `[DEBUG]`:

```
[DEBUG] Verificando autenticação...
[API] Verificando auth em: https://seu-dominio.com/googleLogin/session
[API] Auth response status: 200
[API] Auth session data: { user: { id: "...", email: "..." } }
[DEBUG] Usuário autenticado: user@example.com
[DEBUG] Carregando domínios...
[API] Chamando: /api/domains { credentials: 'include' }
[API] Response status: 401 Unauthorized  ← PROBLEMA AQUI!
[DEBUG] Erro ao carregar domínios: Não autenticado
```

#### 3. Verifique Cookies no Network Tab
1. Vá para aba **Network** no DevTools
2. Recarregue a página (`F5`)
3. Clique na requisição para `/api/domains`
4. Veja a seção **Request Headers**
5. Procure por `Cookie:` - deve conter algo como:
   ```
   Cookie: authjs.session-token=eyJhbGciOiJkaXI...
   ```

**Se o Cookie NÃO aparece**: O problema é que os cookies não estão sendo enviados.

#### 4. Verifique as Response Headers da requisição `/googleLogin/session`
1. No **Network** tab, encontre a requisição `/googleLogin/session`
2. Veja **Response Headers**
3. Procure por `Set-Cookie:`
4. Verifique os atributos do cookie:
   ```
   Set-Cookie: authjs.session-token=...; Path=/; HttpOnly; Secure; SameSite=Lax
   ```

### Possíveis Causas e Soluções

#### A. Cookies com domínio errado
**Causa**: O cookie foi criado para um domínio diferente do que está sendo acessado.

**Solução**:
- Verifique se está acessando pelo mesmo domínio configurado no Google Console
- Cookies criados em `example.com` não funcionam em `www.example.com`

#### B. SameSite=Strict bloqueando cookies
**Causa**: Auth.js pode estar usando `SameSite=Strict` que bloqueia cookies em redirecionamentos.

**Solução**: Verificar configuração do Auth.js no projeto `/auth`

#### C. Navegador bloqueando cookies de terceiros
**Causa**: Configurações do navegador bloqueiam cookies.

**Solução**:
- Chrome/Edge: Configurações > Privacidade > Cookies > Permitir todos os cookies
- Firefox: Preferências > Privacidade > Proteção aprimorada contra rastreamento > Personalizada

#### D. HTTPS não configurado corretamente
**Causa**: Cookies com `Secure` flag só funcionam via HTTPS.

**Solução**:
- Verifique se está acessando via `https://`
- Verifique se o reverse proxy (Apache/Nginx) está configurado corretamente

---

## 🔴 Problema: "Logout não funciona (F5 mantém logado)"

### Sintomas
- Usuário clica em "Sair"
- Recarrega página (`F5`)
- Ainda aparece como logado

### Debug Passo a Passo

#### 1. Verifique Logs do Logout
No **Console** do DevTools, procure por:
```
[DEBUG] Iniciando logout...
[API] Fazendo logout...
[API] Logout response: 200  ← Deve ser 200
[DEBUG] Logout concluído, recarregando página...
```

#### 2. Verifique se `/googleLogin/signout` está respondendo
1. Aba **Network** do DevTools
2. Clique em "Sair"
3. Procure requisição `POST /googleLogin/signout`
4. Status deve ser `200 OK` ou redirecionamento `302`

#### 3. Verifique se cookies foram limpos
1. Após logout, vá em DevTools > **Application** tab (Chrome) ou **Storage** tab (Firefox)
2. Expanda **Cookies** no painel esquerdo
3. Clique no seu domínio
4. Procure por `authjs.session-token`
5. **Deve estar vazio ou não existir**

### Possíveis Causas e Soluções

#### A. Auth.js não está limpando o cookie
**Causa**: A rota `/signout` não está funcionando corretamente.

**Solução**:
```typescript
// Testar manualmente no console do navegador:
fetch('/googleLogin/signout', {
  method: 'POST',
  credentials: 'include'
}).then(r => console.log(r.status));

// Deve retornar 200 ou 302
```

#### B. Cookie com flag HttpOnly não é acessível pelo JavaScript
**Causa**: Normal - cookies HttpOnly não podem ser limpados por JavaScript.

**Solução**: O servidor deve limpar o cookie no response do `/signout`. Verifique se o Auth.js está enviando `Set-Cookie` com valor vazio.

#### C. Cookie persistente em cache
**Causa**: Navegador mantém cookie em cache.

**Solução**: Forçar limpeza completa:
1. DevTools > Application > Cookies > Clique direito > Clear
2. Ou use modo anônimo para testar

---

## 🔴 Problema: "checkAuth() funciona mas loadDomains() falha imediatamente"

### Sintomas
- Logs mostram usuário autenticado
- Mas chamada para `/api/domains` falha com 401

### Causa Provável
**Race condition** ou problema de timing entre `checkAuth()` e `loadDomains()`.

### Solução
Já implementado um delay de 100ms:

```typescript
// main.ts:537
await new Promise(resolve => setTimeout(resolve, 100));
```

Se ainda falhar, aumente para 300ms ou 500ms.

---

## 📋 Checklist Completo de Debug

Use este checklist quando tiver problemas de autenticação:

- [ ] Abra DevTools (F12) e vá para Console
- [ ] Recarregue a página e veja logs com `[API]` e `[DEBUG]`
- [ ] Verifique se `checkAuth()` retorna usuário
- [ ] Verifique se `/api/domains` retorna 401 ou 200
- [ ] Aba Network > Requisição `/api/domains` > Request Headers > Procure `Cookie:`
- [ ] Cookies aparecem? Se não, veja seção "Cookies não enviados"
- [ ] Aba Network > Requisição `/googleLogin/session` > Response Headers > `Set-Cookie:`
- [ ] Verifique atributos do cookie: `Secure`, `SameSite`, `HttpOnly`
- [ ] Está acessando via HTTPS? (exceto localhost)
- [ ] Domínio é exatamente o mesmo configurado no Google Console?
- [ ] Teste logout: `POST /googleLogin/signout` retorna 200?
- [ ] Cookies são limpos após logout?

---

## 🛠️ Comandos Úteis

### Verificar cookies no servidor (via SSH)
```bash
# Ver logs do Node.js (se usando PM2)
pm2 logs ec2-manager

# Ver últimas requisições
pm2 logs ec2-manager --lines 100
```

### Testar autenticação manualmente
```bash
# No navegador, console do DevTools:

// 1. Verificar sessão
fetch('/googleLogin/session', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log);

// 2. Testar API protegida
fetch('/api/domains', { credentials: 'include' })
  .then(r => r.json())
  .then(console.log);

// 3. Fazer logout
fetch('/googleLogin/signout', { method: 'POST', credentials: 'include' })
  .then(r => console.log(r.status));
```

---

## 📞 Ainda com problemas?

Se após seguir este guia o problema persistir:

1. **Capture os logs completos** do Console (DevTools)
2. **Tire screenshot** da aba Network mostrando:
   - Request Headers da chamada `/api/domains`
   - Response Headers da chamada `/googleLogin/session`
3. **Verifique se há erros** no servidor (PM2 logs ou console do servidor)
4. **Compartilhe essas informações** para análise detalhada

---

## 🔧 Configurações do Projeto

### Variáveis de Ambiente (.env)
```bash
# Backend
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SECRET=... (mínimo 32 caracteres)
AUTH_GOOGLE_CALLBACK_PATH=/googleLogin

# Frontend (Vite)
VITE_AUTH_CALLBACK_PATH=/googleLogin  # Deve ser IGUAL ao backend
VITE_API_URL=http://localhost:3100    # Apenas em dev local
```

### Google Console - Redirect URIs Autorizados
```
https://seu-dominio.com/googleLogin/callback/google
```

⚠️ **Importante**: O domínio deve ser EXATAMENTE o mesmo usado para acessar o app.

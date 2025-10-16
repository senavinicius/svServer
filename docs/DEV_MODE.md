# Modo de Desenvolvimento (Mac/Windows)

## 🎯 Problema

O EC2 Manager foi desenvolvido para rodar em **Amazon Linux 2023** e depende de:
- Apache httpd (`/etc/httpd/conf.d/`)
- Certbot (`/etc/letsencrypt/`)
- Comandos Linux (`systemctl`, `apachectl`)

**No Mac/Windows**, esses recursos não existem, então o backend crasharia ao tentar executar operações.

## ✅ Solução: Modo de Desenvolvimento Automático

O sistema detecta automaticamente se está rodando em ambiente de desenvolvimento e usa **dados mockados**.

### Como funciona?

```typescript
// src/server/mock-data.ts
export function isDevelopmentMode(): boolean {
  return process.platform !== 'linux' || process.env.MOCK_MODE === 'true';
}
```

**Critérios:**
- ✅ Mac (`darwin`) → Modo dev
- ✅ Windows (`win32`) → Modo dev
- ✅ Linux com `MOCK_MODE=true` → Modo dev
- ❌ Linux em produção → Modo real

## 🚀 Testando no Mac

### 1. Instalar dependências

```bash
npm install
```

### 2. Rodar em desenvolvimento

```bash
# Opção 1: Frontend e Backend juntos
npm run dev:all

# Opção 2: Separado (duas abas do terminal)
npm run dev:server  # Backend na porta 3100
npm run dev        # Frontend na porta 5173
```

### 3. Acessar

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3100

## 📊 O que funciona no Mac?

### ✅ Funciona 100%

| Funcionalidade | Status | Comportamento |
|---|---|---|
| **Listar domínios** | ✅ | Retorna 5 domínios mockados |
| **Adicionar domínio** | ✅ | Simula operação (500ms delay) |
| **Editar domínio** | ✅ | Simula operação (500ms delay) |
| **Remover domínio** | ✅ | Simula operação (500ms delay) |
| **Obter SSL** | ✅ | Simula operação (1500ms delay) |
| **Renovar SSL** | ✅ | Simula operação (1500ms delay) |

### 📝 Dados Mockados

O sistema retorna 5 VirtualHosts de exemplo:

1. **example.com** (Node, porta 3000) → SSL ativo (60 dias)
2. **api.example.com** (Node, porta 3001) → SSL expirando (5 dias)
3. **game.example.com** (Static) → Sem SSL
4. **old.example.com** (PHP) → SSL expirado
5. **another.com** (Static) → Sem SSL

Veja `src/server/mock-data.ts` para detalhes.

### 🔍 Como identificar modo dev?

No console do servidor você verá:

```
🚀 EC2 Manager API running on http://localhost:3100
🔧 Development mode: usando dados mockados
🔧 Development mode: simulando addDomain { serverName: 'test.com', ... }
```

## ⚙️ Forçar modo dev no Linux

Se você quiser testar com dados mockados mesmo em Linux:

```bash
MOCK_MODE=true npm run dev:server
```

## 🎨 Testando a Interface

No Mac, você pode:

1. ✅ Ver a lista de domínios mockados
2. ✅ Testar o modal de adicionar domínio
3. ✅ Testar validações (domínio inválido, porta obrigatória, etc.)
4. ✅ Testar ações de editar/remover (simuladas)
5. ✅ Testar obtenção/renovação de SSL (simuladas)
6. ✅ Ver diferentes estados de SSL (ativo, expirando, expirado)

### Limitações

❌ **O que NÃO funciona:**
- Alterações não persistem (dados são mockados)
- Não cria arquivos reais de configuração
- Não executa Apache/Certbot de verdade

✅ **Mas você pode:**
- Desenvolver e testar a interface
- Validar o fluxo de usuário
- Testar tratamento de erros
- Desenvolver novas features

## 🔄 Sincronização com servidor real

Para testar com dados reais do servidor EC2:

### Opção 1: SSH Tunnel

```bash
# No Mac, criar túnel SSH
ssh -L 3100:localhost:3100 ec2-user@seu-servidor.com

# Configurar frontend para apontar para localhost
# O backend estará rodando no EC2 via túnel
```

### Opção 2: Expor API temporariamente

```bash
# No EC2, rodar backend na porta pública (CUIDADO!)
PORT=3100 npm run dev:server

# No Mac, configurar API_URL
# src/client/api.ts
const API_URL = 'http://seu-ip-ec2:3100';
```

**⚠️ Atenção:** Expor API sem autenticação é inseguro! Use apenas para testes.

## 🐛 Debug

### Ver logs do backend

```bash
npm run dev:server
```

Você verá:
```
🚀 EC2 Manager API running on http://localhost:3100
🔧 Development mode: usando dados mockados
```

### Ver requests da API

No DevTools do browser:
1. Abra console (F12)
2. Aba "Network"
3. Filtrar por "Fetch/XHR"
4. Ver requests para `/api/domains`, etc.

## 📚 Arquivos Relevantes

- `src/server/mock-data.ts` - Dados mockados e detecção de ambiente
- `src/server/parser.ts:174` - Modo dev no parser
- `src/server/manager.ts` - Modo dev em todas as operações

## 🎯 Próximos Passos

Para melhorar o modo de desenvolvimento:

1. **Persistir alterações em localStorage**
   - Adicionar domínio → Salva no localStorage
   - Recarregar página → Carrega do localStorage

2. **Simular erros**
   - 10% de chance de falhar (para testar tratamento)

3. **Adicionar latência configurável**
   ```bash
   MOCK_DELAY=2000 npm run dev:server  # 2s de delay
   ```

4. **API mock mais realista**
   - Gerar IDs únicos
   - Validar duplicatas
   - Simular conflitos de porta

---

**Resumo:** Sim, você pode rodar no Mac! Tudo funciona com dados simulados. 🚀

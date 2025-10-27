# Arquitetura do Cliente

Este documento detalha a organização e estrutura do código frontend do EC2 Manager.

## Visão Geral

O frontend é construído com **TypeScript vanilla** e **Vite**, seguindo princípios de código limpo:
- Separação de responsabilidades
- Reutilização de código através de configurações
- Evitar repetições desnecessárias
- Manter legibilidade

## Estrutura de Arquivos

```
src/client/
├── main.ts      # Ponto de entrada, gerenciamento de estado
├── render.ts    # Funções de renderização (componentes)
├── dom.ts       # Utilitários para manipulação DOM
├── api.ts       # Cliente HTTP para backend
└── style.css    # Estilos CSS com variáveis
```

## Módulos

### main.ts
**Responsabilidade**: Gerenciamento de estado e orquestração da aplicação

- **Estado Global**: Objeto `state` contendo domínios, loading, erro e modal
- **Renderização**: Função `render()` que atualiza toda UI
- **Event Handlers**: Funções para manipular eventos do usuário
- **Mapa de Ações**: Objeto `DOMAIN_ACTIONS` que mapeia ações para funções

**Padrões aplicados**:
- Estado centralizado para facilitar debugging
- Handlers extraídos para funções nomeadas
- Uso de mapa de ações ao invés de múltiplos ifs/switches

### render.ts
**Responsabilidade**: Renderização de componentes UI

**Configurações data-driven**:
```typescript
const TYPE_CONFIG = {
  node: { icon: '📡', label: 'NODE' },
  static: { icon: '📁', label: 'STATIC' },
  php: { icon: '🐘', label: 'PHP' }
};

const SSL_STATUS_CONFIG = {
  none: { icon: '❌', text: 'Sem SSL', class: 'none' },
  expired: { icon: '❌', text: 'Expirado', class: 'expired' },
  expiring: { icon: '⚠️', text: (days) => `Expira em ${days} dias`, class: 'expiring' },
  active: { icon: '✅', text: (days) => `SSL Ativo (${days} dias)`, class: 'active' }
};
```

**Benefícios**:
- Único ponto de configuração para ícones/labels
- Fácil adicionar novos tipos ou status
- Elimina condicionais repetidas

**Funções principais**:
- `renderSSLStatus()`: Renderiza status SSL baseado em configuração
- `renderVirtualHostActions()`: Gera botões de ação dinamicamente
- `renderVirtualHost()`: Renderiza um domínio/subdomínio
- `renderModal()`: Renderiza modal de adicionar/editar
- `renderSystemStatus()`: Exibe avisos do sistema

### dom.ts
**Responsabilidade**: Utilitários type-safe para manipulação DOM

Fornece funções auxiliares com type-safety:
- `getElement()`: Obtém elemento ou lança erro
- `queryElement()`: Obtém elemento ou retorna null
- `addEventListener()`: Adiciona listener com verificação
- Helpers para classes, valores de inputs, etc.

**Nota**: Atualmente não está sendo usado extensivamente, mas está disponível para expansão futura.

### api.ts
**Responsabilidade**: Comunicação com backend

- Wrapper `apiFetch()` para fetch com tratamento de erros
- Funções específicas para cada endpoint
- Type-safety com TypeScript

### style.css
**Responsabilidade**: Estilos visuais

**Organização**:
1. **Variáveis CSS**: Cores, espaçamentos, border-radius, sombras
2. **Reset e Base**: Reset CSS e estilos globais
3. **Layout Principal**: Container, header, toolbar
4. **Botões**: Estilos de botões com variantes
5. **Lista de Domínios**: Cards de domínios e subdomínios
6. **Modal e Formulários**: Estilos de modal e inputs
7. **Estados e Mensagens**: Loading, erro, empty state
8. **Diagnósticos**: Painéis de status do sistema

**Variáveis CSS**:
```css
:root {
  --color-primary: #667eea;
  --color-danger: #ef4444;
  --spacing-md: 12px;
  --radius-md: 6px;
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.1);
  /* ... */
}
```

**Benefícios**:
- Fácil manutenção e temas
- Consistência visual
- Reduz duplicação de valores

## Padrões de Código

### 1. Data-Driven Configuration
Ao invés de múltiplos ifs, use objetos de configuração:

```typescript
// ❌ Evite
if (status === 'none') return '❌ Sem SSL';
if (status === 'expired') return '❌ Expirado';
if (status === 'expiring') return `⚠️ Expira em ${days} dias`;
if (status === 'active') return `✅ SSL Ativo (${days} dias)`;

// ✅ Prefira
const config = SSL_STATUS_CONFIG[status];
const text = typeof config.text === 'function'
  ? config.text(days)
  : config.text;
```

### 2. Function Maps para Actions
Ao invés de switch gigante, use objeto de funções:

```typescript
// ❌ Evite
switch (action) {
  case 'edit': openEditModal(domain); break;
  case 'delete': await deleteDomain(domain); break;
  case 'obtain-ssl': await obtainSSL(domain); break;
  // ...
}

// ✅ Prefira
const DOMAIN_ACTIONS = {
  'edit': async (domain) => openEditModal(domain),
  'delete': async (domain) => { await deleteDomain(domain); await loadDomains(); },
  'obtain-ssl': async (domain) => { await obtainSSL(domain); await loadDomains(); },
};

await DOMAIN_ACTIONS[action](domain);
```

### 3. Helper Functions
Extrair lógica repetida em helpers:

```typescript
// ❌ Evite repetir HTML
actions += `<button class="btn btn-secondary btn-small" ...>Editar</button>`;
actions += `<button class="btn btn-success btn-small" ...>SSL</button>`;

// ✅ Prefira helper
function renderButton(action, domain, label, variant) {
  return `<button class="btn btn-${variant} btn-small" data-action="${action}" data-domain="${domain}">${label}</button>`;
}
```

### 4. Single Responsibility
Cada função faz uma coisa:

```typescript
// main.ts: Orquestração
async function handleFormSubmit(e: Event) {
  if (state.modal.mode === 'add') {
    await handleAddDomain(formData);
  } else {
    await handleUpdateDomain(formData);
  }
}

// Funções específicas com responsabilidades claras
async function handleAddDomain(formData: FormData) { /* ... */ }
async function handleUpdateDomain(formData: FormData) { /* ... */ }
```

## Fluxo de Dados

```
┌─────────────┐
│   Usuário   │
└──────┬──────┘
       │ Evento (click, submit)
       ▼
┌─────────────┐
│   main.ts   │ ◄─── Event Handlers
└──────┬──────┘
       │ Chama API
       ▼
┌─────────────┐
│   api.ts    │ ◄─── HTTP Request
└──────┬──────┘
       │ Response
       ▼
┌─────────────┐
│   state     │ ◄─── Atualiza estado
└──────┬──────┘
       │ Trigger render()
       ▼
┌─────────────┐
│  render.ts  │ ◄─── Gera HTML
└──────┬──────┘
       │ Template strings
       ▼
┌─────────────┐
│     DOM     │ ◄─── Atualiza UI
└─────────────┘
```

## Performance

- **Hot Module Reload**: Vite detecta mudanças e atualiza apenas o necessário
- **CSS Variables**: Navegadores modernos otimizam uso de variáveis CSS
- **Re-render completo**: Simples mas eficiente para aplicações pequenas
  - Para apps maiores, considere Virtual DOM ou fine-grained reactivity

## Extensibilidade

Para adicionar novos recursos:

1. **Novo tipo de domínio**: Adicione em `TYPE_CONFIG` no render.ts
2. **Novo status SSL**: Adicione em `SSL_STATUS_CONFIG` no render.ts
3. **Nova ação**: Adicione em `DOMAIN_ACTIONS` no main.ts
4. **Novo endpoint**: Adicione função em api.ts
5. **Novo estilo**: Use variáveis CSS existentes ou adicione novas

## Testes

Atualmente não há testes automatizados. Para adicionar:

- **Vitest**: Para testes unitários de funções puras (render.ts, helpers)
- **Playwright/Cypress**: Para testes E2E da interface
- **Integração**: Para testes de API, utilize instâncias controladas do backend (ex.: staging)

## Referências

- [Vite Documentation](https://vitejs.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [MDN CSS Variables](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)

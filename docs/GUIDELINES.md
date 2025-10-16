# Diretrizes

## Regra Principal

**Este projeto = APENAS código específico para EC2/Apache/Certbot**

Antes de implementar:
1. É específico para EC2/Apache/Certbot? → Implementar aqui
2. Já existe biblioteca? → Usar
3. É reutilizável? → Criar projeto separado

## Código

- TypeScript com tipagem forte (sem `any`)
- Nomes descritivos
- Um conceito por arquivo
- Sanitizar inputs antes de `child_process`

## Git

```bash
git commit -m "feat: add domain listing"
git commit -m "fix: sanitize domain input"
```

## Micro-projetos

Já existem:
- svFramework
- svAnalytics

Candidatos futuros:
- WebSocket wrapper
- Service Worker utils
- Biblioteca de gestos

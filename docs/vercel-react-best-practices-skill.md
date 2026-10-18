# Vercel React Best Practices Skill

## Contexto

O diretório de Agent skills de nível de projeto ganhou a skill oficial da Vercel `react-best-practices`, usada como referência das regras de otimização de performance da Vercel ao escrever, revisar ou refatorar código React / Next.js.

## Origem

- Repositório: `vercel-labs/agent-skills`
- Caminho: `skills/react-best-practices`
- Nome da skill: `vercel-react-best-practices`

## Local de instalação

Instalada dentro do projeto:

```text
.agents/skills/react-best-practices
```

Dessa forma a skill é versionada junto com o projeto e não depende do `~/.codex/skills` global de cada desenvolvedor.

## Limites de uso

- Aplicável a tarefas relacionadas a componentes React, páginas Next.js, requisições de dados, otimização de bundle, performance de renderização e otimização de re-renderizações.
- Ao modificar o código de `packages/ui`, continuam prevalecendo as restrições de UI, logging, internacionalização e compatibilidade multiplataforma definidas no `DESIGN.md` da raiz do projeto e no `AGENTS.md` atual.
- Esta skill oferece apenas referência de práticas de performance de React / Next.js; ela não substitui as restrições de nível de projeto, como os limites de arquitetura, o fluxo de controle remoto e o Workspace Identity.
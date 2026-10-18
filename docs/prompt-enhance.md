# Prompt Enhance

A caixa de entrada do chat ganhou o recurso "Aprimorar prompt", que antes do envio entrega o rascunho atual ao provedor de modelo customizado selecionado para um polimento.

## Design

- A UI apenas coleta o rascunho atual e o contexto recente da conversa e devolve o texto aprimorado ao composer.
- A requisição de rede real fica a cargo de `modelProviderService.enhancePrompt()`, que, no lado do host, relê a configuração mais recente do provedor conforme `modelProviderId`.
- O formato da requisição segue a prioridade do provider ZCode atual:
  - `claude` prioriza Anthropic
  - `codex` / `opencode` priorizam Responses
  - `glm` prioriza OpenAI Chat
  - `gemini` prioriza Gemini
- Se o protocolo preferido falhar, os demais formatos compatíveis disponíveis para o mesmo provider são tentados automaticamente.

## Escopo atual

- Apenas o cenário de "provedor de modelo customizado" é suportado.
- CLI nativo e modelos nativos ainda não foram integrados, porque não expõem de forma unificada uma configuração de autenticação HTTP direta reutilizável.
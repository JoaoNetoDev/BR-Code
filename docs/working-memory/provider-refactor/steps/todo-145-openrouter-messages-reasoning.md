# Todo145: correção dos parâmetros de raciocínio do OpenRouter Messages

Status: implementado e revisado, registrado retroativamente; commit de código `2d622900ce`.

## Causa e escopo

No Air, o GLM-5.3 enviava `thinking.type=enabled` para o OpenRouter Messages, sem `budget_tokens`, violando o protocolo do servidor. A decisão completa e as evidências estão em [Contrato de requisição do OpenRouter](../../../openrouter-reasoning-request-contract.md).

- [x] GLM, DeepSeek, Kimi K2, Qwen e MiMo usam adaptive + effort no OpenRouter Messages.
- [x] O nível desligado permanece disabled; nenhum orçamento fixo é adicionado artificialmente e nenhum outro provider ou formato de API é modificado.
- [x] Overrides pessoais e as regras específicas existentes de Claude, GPT e Kimi K3 são preservados.
- [x] 221 testes, entre análise de configuração publicada e wire do SDK real, passaram; verificações de tipo, lint, formatação e arquitetura passaram.
- [x] No Air, as requisições adaptive de GLM-5.3, GLM-5.3-Flash e DeepSeek 4.1 Flash foram bem-sucedidas.

As falhas do Fable decorrem de restrição regional e não têm relação com os parâmetros de raciocínio desta mudança; a restrição regional não foi contornada e a correção não foi ampliada.
Não foram feitas chamadas online individuais para todos os modelos, e nenhuma configuração remota foi publicada.
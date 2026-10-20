# Manutenção de templates e modelos de Providers embutidos

Este diretório é o ponto de entrada para a manutenção diária dos templates de Providers embutidos, dos membros de modelo e das regras de modelo. O objetivo da manutenção é cobrir continuamente os fornecedores principais e os modelos principais de programação e de Agent, e garantir que cada configuração tenha origem, validação e registro de entrega.

Este diretório organiza o contrato atual e o processo de manutenção. Novas adições que estejam dentro do escopo e do protocolo existente podem seguir direto; modificações, desativações ou remoções de configurações existentes exigem discussão e confirmação antes. O protocolo nativo do Google fica suspenso no curto prazo, e os limites concretos estão nos princípios de escopo. O baseline desta rodada é o staging `68fac8de4fcc` de 2026-10-14, com a Builtin revision 33. Configurações subsequentes em MR devem atualizar ao mesmo tempo o estado atual deste diretório.

Este diretório oferece de forma independente o contexto, os conceitos, as regras, as justificativas e os passos operacionais necessários para a manutenção, sem condicionar-se à leitura prévia de outros documentos. Os links dentro do diretório servem para aprofundar a explicação; os links de código servem para conferir a implementação; os links de material oficial servem para verificar evidências externas datadas. As conclusões válidas do material histórico já foram incorporadas ao texto, e as propostas não implementadas foram mantidas explicitamente como candidatas.

## Ponto de entrada por tarefa

| O que fazer                                                  | Ponto de entrada de leitura                                |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| Decidir quais fornecedores e modelos manter, como estender e descontinuar | [Escopo e princípios](./scope.md)                           |
| Entender templates, membros, regras, mapeamento de parâmetros e configuração formal/de teste | [Especificação de configuração](./configuration.md)         |
| Ver os templates atuais, a lista completa de modelos, a habilitação/desabilitação padrão e as lacunas conhecidas | [Estado atual](./current-state.md)                          |
| Ver as recomendações de expansão mais recentes, as diferenças de regras e o plano em lotes | [Plano de expansão 2026-10-14](./expansion-plan.md)         |
| Acompanhar continuamente notícias, catálogos oficiais e anúncios de descontinuação | [Pesquisa e achados desta rodada](./research.md)            |
| Avançar de candidata até MR de configuração e distribuir a colaboração manual | [Fluxo de manutenção](./workflow.md)                        |
| Obter API Key, fazer validação real e deixar evidência revisável | [Especificação de validação](./validation.md)               |
| Mesclar MR, entregar junto da versão, e fazer rollout dinâmico e rollback quando necessário | [Especificação de entrega](./delivery.md)                  |

## Limites de fato

- **Fatos de configuração**: `config/provider/zcode-builtin.json` é a fonte formal de edição; a configuração de teste é derivada por script. Schema, Resolver e Adapter definem o que de fato pode ser expresso e executado.
- **Decisões de manutenção**: este diretório registra o escopo de integração, as prioridades, a habilitação/desabilitação padrão e as normas de operação; novas adições que estejam dentro do escopo confirmado seguem direto; ajustes/remoções de itens existentes exigem discussão antes, e propostas que ultrapassem a capacidade do protocolo atual são mantidas como candidatas.
- **Fatos de validação**: o repositório ter a configuração, o oficial ter a documentação, uma conta conseguir chamar a API e o cliente já ter entregue são quatro coisas diferentes. Elas não se substituem umas às outras.
- **Histórico e estado atual**: [Estado atual](./current-state.md) registra este baseline e as diferenças conhecidas; [Especificação de configuração](./configuration.md) explica as regras vigentes e as trade-offs. Quando listas antigas ou pendências históricas entrarem em conflito com o código, revalidar e não restaurar automaticamente a configuração antiga.

A unidade de manutenção de modelo é **entrada de produto do fornecedor × ID de modelo original × protocolo de API**. Mesma marca com pacotes diferentes, mesmo modelo com entradas de agregação diferentes, mesmo endpoint com protocolos diferentes não podem compartilhar uma única conclusão de validação.

## Critérios de conclusão

Uma manutenção de configuração só está concluída quando o escopo foi confirmado, a configuração formal e a de teste têm a mesma origem, as checagens relevantes passaram, a validação real foi feita e as lacunas estão claras, e o MR foi mesclado e o estado de entrega é rastreável. A falta de Key permite continuar a pesquisa, completar os testes e preparar o MR, mas o estado pendente de validação manual deve ser preservado; não pode ser escrito como já disponível nem como já em produção.

Providers de conta fixa e templates comuns compartilham Release, regras de modelo e conversão de ambiente. Este diretório explica os direitos de conta, a propriedade da configuração e os limites de vigência que precisam ser preservados na manutenção; o desenvolvimento de produtos de login de conta, do sistema de sessões e do protocolo de controle remoto não faz parte do escopo de manutenção de templates.

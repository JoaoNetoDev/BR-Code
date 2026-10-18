# Todo157: Entradas de planos de fabricantes, complementação de modelos Go e consolidação do Access de Key manual

> Status: a executar; novos fabricantes são candidatos ainda a avaliar. Em 2026-09-16 esta rodada apenas organizou o Todo e o índice, sem modificar código ou configuração de produto.
>
> Origem: discussão comparativa entre a API / Coding Plan da Kimi, os planos de outros fabricantes e o catálogo Go do OpenCode. O usuário cancelou explicitamente a liberação da validação de segurança para domínios de proxy personalizados por meio do Access manual especial; a abordagem de emblema visual usando a identidade do template está registrada abaixo.

## Objetivos e ordem de implementação

1. Completar as entradas de API/assinatura dos fabricantes existentes e o catálogo Go do OpenCode, evitando que o usuário preencha uma Key de plano em um endpoint de cobrança por uso.
2. Remover `zhipu-coding-plan-api-key`; padronizar a Key manual como `api-key`; cancelar sua admissão independente na validação de segurança e eliminar a dependência do emblema visual em relação a esse tipo.
3. Avaliar a primeira leva de novos fabricantes e depois integrá-los um a um, com base em entradas de produto explícitas e evidências reais de protocolo; candidato não equivale a capacidade verificada e publicável.

Cada fatia é verificada e submetida de forma independente. Este item dá continuidade ao escopo relevante de [Todo22 Planejamento de novos fabricantes](./todo-22-additional-builtin-providers-and-cloud-access.md), [Todo113 Atualização do catálogo de modelos](./todo-113-new-model-catalog-refresh.md) e [Todo149 Suporte a Go](./todo-149-opencode-go-support.md), sem reabrir trabalhos que eles já concluíram. Antes da implementação, o contrato final deve ser sincronizado em [design vigente](../design-v2/design.md) e nos specs funcionais correspondentes; conclusões históricas são lidas conforme a [ordem de autoridade](../design-v2/README.md).

## 1. Entradas de produto dos fabricantes existentes

A seguir está a linha de base de investigação de 2026-09-16; endpoints, membros e permissões dos planos devem ser reverificados no momento da implementação.

| Fabricante      | Problema atual                                                                                          | Objetivo                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Kimi           | `moonshot-kimi` aponta para a plataforma aberta, mas inclui `k3` / `k3-256k` do lado Code, sem entrada de assinatura independente | separar Kimi API e Kimi Coding Plan (Kimi Code); manter endpoints, página de Key, membros de modelos e capacidades separadamente |
| MiniMax        | apenas a entrada MiniMax comum                                                                            | acrescentar o Token Plan; esclarecer a diferença entre Key de assinatura e Key de cobrança por uso, conferindo credenciais nacionais/internacionais separadamente conforme o contrato oficial |
| Alibaba Cloud Bailian | só distingue API China/internacional                                                                   | acrescentar Coding Plan e Token Plan; conferir separadamente planos pessoal/equipe, região e protocolo, sem criar templates duplicados apenas com base no nome do plano |
| Xiaomi MiMo    | apenas a API comum                                                                                      | acrescentar o Token Plan; fazer o casamento entre a Key de plano `tp-` e a Key comum `sk-`, e entre endpoints de plano por região |
| Z.ai / BigModel | API e Coding Plan já têm templates separados, mas o plano manual ainda usa um Access especial               | manter as quatro identidades de template e os nomes vigentes, mudando o Access de plano para o `api-key` genérico |

- Os IDs de modelos listados oficialmente pelo Kimi Code são `k3`, `k3-256k`, `kimi-for-coding` e `kimi-for-coding-highspeed`; naquela época `kimi-for-coding` correspondia ao K2.8 Preview. Não se pode tomar os nomes de versão da plataforma aberta como IDs de requisição do Code, nem assumir que todos os membros têm acesso a todos os modelos.
- Novos planos do tipo API Key devem reutilizar preferencialmente `api-key`; não criar um Access especial para cada plano. Se for necessário OAuth, renovação de credenciais ou atualização de direitos da conta, projete-se primeiro um contrato de autenticação real e só então se integra.
- O mesmo endpoint não significa a mesma credencial de cobrança; a mesma Key/endpoint com direitos de modelos diferentes também não exige mecanicamente separar templates. Cada entrada deve ter uma página clara de obtenção de chave, tipo de API, Base URL e escopo de modelos.
- IDs de Provider, nomes, Keys, sobreposições pessoais, ordenação e ModelSelections históricos de instâncias existentes não são reconstruídos em massa. O template Kimi existente é mantido como entrada da plataforma aberta; antes de limpar o catálogo padrão, confira os limites de restauração das opções antigas e dos modelos personalizados pelo usuário.

Referências: [Diferenças da plataforma Kimi](https://www.kimi.com/code/docs/kimi-code/faq.html), [Modelos do Kimi Code](https://www.kimi.com/code/docs/kimi-code/models.html), [Token Plan da MiniMax](https://platform.minimax.io/docs/token-plan/quickstart), [Integração de cada plano do Bailian](https://help.aliyun.com/zh/model-studio/more-tools), [Token Plan do MiMo](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/quick-access).

## 2. Complementação do catálogo Go do OpenCode

Nesta rodada, tanto a configuração de produção quanto a de teste têm 25 modelos, enquanto a tabela oficial de endpoints lista 28. A diferença é a seguinte:

| Model ID ausente                | Template alvo                 | Protocolo        |
| ------------------------------- | ----------------------------- | ---------------- |
| `longcat-2.0`                   | `opencode-go-chat`            | Chat Completions |
| `muse-spark-1.3-contributor`    | `opencode-go-responses`       | Responses        |
| `muse-spark-1.2-contributor`    | `opencode-go-responses`       | Responses        |

- O agrupamento dos 25 modelos existentes é consistente com a tabela oficial de endpoints; `minimax-m2.5` continua nela e não deve ser removido só porque a lista de概要 o omite.
- O `muse-spark-1.2-contributor-free` do Zen não conta como cobertura Go, e seu ID ou seus direitos não devem ser reutilizados.
- Mantêm-se as regras de site, as requisições reais e os limites de habilitação padrão do Todo149; o Muse Contributor começa desabilitado por padrão, e região e instruções de uso de dados devem ser conferidas, sem servir como modelo recomendado por padrão.
- Ao acrescentar membros, verifique também capacidades de entrada, contexto, saída máxima, chamada de ferramentas, níveis de raciocínio e mapeamentos. Campos que a fonte não comprovar não devem ser adivinhados pelo nome do modelo.
- Nesta rodada, a requisição direta a `/zen/go/v1/models` retornou HTTP 403; a diferença vem da [tabela oficial de endpoints](https://opencode.ai/docs/go/#endpoints). Nenhuma requisição com Key foi feita para verificação, portanto não se pode registrar a conferência do catálogo como uma chamada online bem-sucedida.

## 3. Remoção do Access especial para planos manuais

### 3.1 Decisão sobre a validação de segurança

O usuário cancelou explicitamente: o fato de `zhipu-coding-plan-api-key` poder deixar a Key manual entrar no fluxo de validação de segurança sem depender do domínio, permitindo endereços de proxy personalizados. Essa via lateral não deve ser restaurada por meio de novos campos, IDs de template ou outros critérios implícitos.

Ordem de admissão alvo:

```text
Access + Base URL já vinculados ao Model
  ├─ zhipu-account / Start ou Off-Peak → não entra na validação de segurança, preserva o JWT / Key / Ticket original
  ├─ zhipu-account / Coding Plan pessoal ou de equipe → mantém a admissão existente na validação de segurança da conta
  ├─ api-key manual → apenas domínios oficiais existentes ou hostname de teste exato podem entrar no fluxo de validação de segurança
  └─ demais → não entram no fluxo de validação de segurança
                   ↓
      switch remoto original → restrição HTTPS → validação de segurança de requisição para a versão oficial / retry / degradação
```

- Mantêm-se os domínios raiz e subdomínios oficiais `z.ai` / `bigmodel.cn` e as regras de domínio de teste exatas `api.z.ai` / `zcode.z.ai`, sem ampliar a fronteira de hostname.
- Nesta rodada apenas a entrada do Access manual especial é cancelada; as regras de validação de segurança originalmente aplicadas à conta pessoal / de equipe não são canceladas junto. A exclusão prioritária de Start / Off-Peak continua válida.
- Mantêm-se a validação de segurança de requisição existente, o switch, o cache e as semânticas de erro e cancelamento, sem introduzir um segundo conjunto de estados de validação.
- Este item substitui [Todo111](./todo-111-zhipu-coding-plan-api-key-and-standard-api-templates.md) e a parte de admissão independente do Access manual especial no Todo136; a exceção de conta do Todo142 é mantida (esses dois documentos só permanecem na versão oficial).

### 3.2 Emblema visual do GLM-5.3

Adota-se o ajuste mínimo de exibição: o plano manual é identificado pelo `templateId`, e o plano de conta continua sendo identificado pelo Access mode já existente. As duas Views já carregam a identidade do template, e a página de configurações e o menu de modelos compartilham o mesmo julgamento, sem adicionar um novo Schema de capacidade de Model.

| Condição (model ID, ignorando maiúsculas/minúsculas, é exatamente `glm-5.3`) | Emblema visual            |
| -------------------------------------------------------------------------------- | ------------------------- |
| Template `zai-api` / `bigmodel-api`                                             | oculto                    |
| Coding Plan de conta pessoal / de equipe ou Start Plan                           | oculto                    |
| Template de API comum, Provider personalizado sem template, Off-Peak             | exibido conforme `supportsImage` |

- Todos os modelos precisam primeiro satisfazer `supportsImage === true` para que o emblema possa aparecer; GLM-5.3-Flash e outros modelos continuam sendo exibidos conforme a capacidade.
- Preserva-se a capacidade real de entrada de imagens do GLM-5.3. É proibido definir `supportsImage` como false para ocultar o emblema, ou alterar o envio de anexos, a validação e a codificação da requisição.
- Não se adivinha se um template é de plano a partir do nome de exibição, do prefixo do Provider ID, do conteúdo da Key ou do domínio oficial. Uma instância já associada a um template de plano, mesmo que renomeada ou com URL alterada, continua sendo exibida conforme a identidade do seu template; isso não concede admissão na validação de segurança nem direitos de plano.
- Após a normalização, o Access especial antigo sem template é exibido como um Provider personalizado comum; não se forja uma associação de template apenas para preservar emblemas históricos.
- Este item substitui a forma de identificação de planos manuais em [Todo126](./todo-126-glm-flash-pdf-and-coding-plan-turbo-defaults.md) / [Todo137](./todo-137-start-plan-glm53-vision-badge.md); sua capacidade de imagens e a fronteira de exibição dos planos de conta são mantidas.

### 3.3 Compatibilidade de configuração e aposentadoria

- O Schema oficial, os objetos de domínio, a serialização e o Runtime mantêm apenas o `api-key` genérico e o `zhipu-account` existente; não se mantém rapidamente duas semânticas de Key manual.
- Antes da implementação, audite o cache Built-in, a Configuração Personal, a importação e as fronteiras de leitura de configuração remota. No único ponto de entrada de decodificação/migração de compatibilidade claramente definido, normalize o tipo manual antigo para `api-key`, preservando a Key, a página de gerenciamento, o `templateId` existente e as sobreposições pessoais; um valor antigo não pode fazer a leitura da configuração inteira falhar nem fazer a Key se perder na sobrescrita.
- A camada de compatibilidade não restaura o comportamento especial de validação de segurança, nem grava duas vezes o tipo antigo. Registre o ponto de entrada concreto, as origens de onde a configuração antiga ainda pode chegar, as evidências de teste e a condição de saída; não basta apagar a enumeração e declarar concluído.
- Não reconstruir Providers / ModelSelections históricos, não alterar o Access da conta nem o owner das credenciais; a configuração local e a remota cuidam cada uma da sua própria, sem misturar as credenciais do Host.

## 4. Candidatos a novos fabricantes e condições de saída

Os candidatos vêm da organização pública de presets de terceiros (conferida nesta rodada), com a prioridade sendo a sugestão desta rodada; ainda não está provado que todas as entradas podem ser publicadas. Links promocionais, planos históricos e configurações exclusivas de cliente não são copiados diretamente.

| Leva     | Candidatos                                                   | O que precisa ser fechado antes da implementação                                                                                                          |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primeira | Volcengine Ark / Doubao                                      | entradas válidas de API, Agent Plan e do antigo Coding Plan, identidade dos modelos e limites do existente; [Agent Plan oficial](https://www.volcengine.com/activity/agentplan) |
| Primeira | Tencent TokenHub                                             | priorizar o Token Plan; planos genéricos / Hy compartilham Key e endpoint mas têm direitos de modelos diferentes, evitando templates duplicados; [integração oficial](https://cloud.tencent.com/document/product/1823/130119) |
| Primeira | Baidu Qianfan                                                | API e Token Plan versão pessoal; o antigo Coding Plan parou de renovar e não pode ser o novo padrão; [aviso de upgrade](https://cloud.baidu.com/news/notice_e839687d-1cf7-4a5b-afbd-ea2f7bcd325d) |
| Primeira | SiliconFlow                                                 | endereços China/internacionais, titularidade da Key e modelos realmente suportados por cada protocolo; [integração oficial](https://docs.siliconflow.cn/docs/usercases/use-siliconcloud-in-ClaudeCode) |
| Primeira | Google Gemini API                                           | avaliar apenas a interface oficial compatível com OpenAI e a API Key, validando chamada de ferramentas, assinatura de pensamento e o caminho de imagens; [documentação de compatibilidade](https://ai.google.dev/gemini-api/docs/openai) |
| Segunda  | StepFun, LongCat, PPIO, ModelScope, NVIDIA NIM, BytePlus      | avaliar entradas de produto, capacidade de expressão de protocolo existente e evidências de modelos conforme a necessidade do usuário; não publicar templates incompletos por enquanto                                                                 |

- O candidato Gemini não remove automaticamente a exclusão de Todo22 para o Adapter nativo do Google / Vertex; se a interface compatível não atender ao contrato, registre a lacuna e projete separadamente.
- Autenticação de nuvem complexa como Bedrock e Azure continua no tópico do Todo22, sem se misturar à complementação de templates comuns. Novos tipos exigem uma necessidade real de autenticação; não se pode mascarar diferenças de região, identidade de implantação ou assinatura com uma URL escrita à mão.
- Antes de transformar um candidato em fatia implementável, liste nome exato, Template ID, página de Key, endpoint, Model ID original, escopo de habilitação padrão, evidências de capacidades e parâmetros, e condições de verificação real.

## 5. Ponto de entrada de implementação e aceitação

O ponto de entrada de configuração é `config/provider/zcode-builtin.json`; edite apenas a origem de produção, gere a configuração de teste com `pnpm provider:config:sync-test` e execute `pnpm provider:config:check-test`. Incremente conforme a revision real mais recente, sem fixar o valor de base 28 desta rodada, e não publique automaticamente a configuração online.

Verifique com atenção o Access e as fronteiras de leitura em `packages/provider/src/config/`, `packages/provider/src/resolver.ts`, `packages/provider-node/` e nos consumidores existentes de persistência/importação; o ponto de entrada de admissão da validação de segurança é `apps/zcode-cli/packages/adapters/src/model/model-execution.ts`. Os pontos de entrada de exibição são `packages/ui/src/lib/modelVisionBadge.ts`, `modelSelectionGroups.ts`, o componente `ProviderFormControls.tsx` da página de configurações e sua cadeia de passagem de props.

- [ ] Antes da implementação, reexaminar a linha de base e as alterações do usuário, fazendo uma análise de impacto de arquitetura conforme as regras de diretórios atingidos; atualizar os specs correspondentes e as decisões sobre conflitos históricos, sem registrar candidatos de pesquisa como fatos vigentes.
- [ ] Escrever primeiro os testes esperados: os quatro templates da Zhipu são `api-key`; a leitura do tipo especial antigo é normalizada, e a Key salva e sobrescrita não se perde, preservando a associação de template e as escolhas históricas.
- [ ] Os testes da validação de segurança cobrem simultaneamente domínio oficial / domínio de teste exato, domínios semelhantes, proxy personalizado, switch desligado, HTTPS e degradação; a Key manual via proxy não entra na validação de segurança e a exceção da conta não regride.
- [ ] A página de configurações e o menu de modelos cobrem os dois templates de plano manual, a API comum, o provider personalizado sem template, e as variantes pessoal / equipe / Start / Off-Peak; correspondência exata do GLM-5.3, com Flash e a capacidade real de imagens preservados.
- [ ] Carregando de verdade o Built-in, verificar membros de cada entrada, habilitação padrão, capacidades completas e mapeamentos; a diferença do catálogo Go chega a zero ou cada item com a razão da postergação, sem tratar modelos restritos por região como disponíveis para todas as contas.
- [ ] Validar nas novas entradas as requisições finais de generate/stream, chamada de ferramentas, raciocínio e usage; templates existentes e Key manual no mesmo endpoint têm configuração de execução idêntica quando não há sobreposição pessoal. Quando a Key real estiver ausente, registrar o escopo não verificado.
- [ ] Executar o typecheck da raiz, o lint, `pnpm architecture:check --changed` e os testes afetados; para mudanças no CLI, executar também o typecheck/lint do CLI e os testes dos pacotes relacionados.
- [ ] Reutilizar/manter os casos de configurações e seleção de modelos conforme o fluxo de E2E, cobrindo desktop / celular, temas claro e escuro e os idiomas; evidências de navegador de componentes compartilhados não se fazem passar por uma cadeia completa nativa ou de controle remoto do celular, e pendentes não viram aprovados automaticamente.
- [ ] Verificar a configuração e o isolamento de credenciais local / remota, preservando a fronteira continuous/replayable; verificar criação de template, edição, restauração após reinício e compatibilidade com a configuração antiga.
- [ ] Concluir a autoverificação do diff e, após registrar por fatia a verificação e os problemas restantes, fazer commit local; push, MR e publicação da configuração online são executados a pedido do usuário.

## Entregas reais desta rodada e problemas restantes

- Apenas este Todo e o índice de implementação foram acrescentados; a implementação de produto, a atualização de configuração, a migração do tipo antigo e as aceitações acima não foram executadas.
- Durante a investigação foram executados os dois arquivos de teste existentes de admissão/equivalência da validação de segurança do CLI, com 134 casos passando. Eles provam o comportamento atual e a equivalência com os endpoints oficiais, mas não provam o novo comportamento após a remoção do tipo especial; na implementação, será necessário alterar expectativas antigas como as do domínio de proxy.
- A lista final de templates de novos fabricantes, os modelos disponíveis em cada plano e as evidências de chamadas reais ainda precisam ser complementadas. Aqui o status de candidato é mantido, sem acrescentar publicação automática nem operações de autorização de conta.
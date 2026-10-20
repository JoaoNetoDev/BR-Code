# Xiaomi MiMo API e templates do Token Plan

## Fatos da integração (verificados em 2026-10-14)

A API por uso (pay-as-you-go) do MiMo e o Token Plan são produtos de integração independentes. A página de configurações precisa oferecer dois templates, para evitar que o usuário cole uma chave de assinatura no endereço de uso.

| Template ID | Nome | Anthropic Base URL | Credencial |
| --- | --- | --- | --- |
| `xiaomi-mimo` | Xiaomi MiMo API | `https://api.xiaomimimo.com/anthropic` | API Key de uso, `sk-` |
| `xiaomi-mimo-token-plan` | Xiaomi MiMo Token Plan | `https://token-plan-cn.xiaomimimo.com/anthropic` | Pessoal `tp-` ou equipe `ttp-` |

As credenciais vêm do [console oficial](https://platform.xiaomimimo.com/). As duas chaves não podem ser misturadas, mas o cliente não ganha nova validação de prefixo. O endereço real do Token Plan é o do console do usuário; o mesmo protocolo também tem os clusters `token-plan-sgp.xiaomimimo.com` e `token-plan-ams.xiaomimimo.com`, e o usuário continua usando a entrada existente de edição do Base URL para sobrescrever.

Base oficial: [primeira chamada](https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call), [acesso rápido ao Token Plan](https://mimo.mi.com/docs/zh-CN/tokenplan/Token%20Plan/quick-access).

## Modelos e limites de compatibilidade

- Os dois templates oferecem `mimo-v2.6-pro` e `mimo-v2.6-flash`, habilitados por padrão; os fatos de modelo seguem a regra compartilhada, o contexto de 1M é registrado como 1000000 nas unidades de configuração existentes, a saída máxima é 131072, a saída é de texto, e há suporte a entrada de texto, imagem, vídeo e áudio. As opções de raciocínio da Anthropic são `disabled` / `enabled`, mapeadas para `thinking.type`, e o limite de saída é mapeado para `max_tokens`.
- A [lista oficial de modelos](https://mimo.mi.com/docs/zh-CN/quick-start/summary/model) e o [protocolo Anthropic](https://mimo.mi.com/docs/zh-CN/api/chat/anthropic-api) fornecem a base acima. A [versão pessoal do Token Plan](https://mimo.mi.com/docs/zh-CN/tokenplan) lista o suporte aos planos Pro e Flash; Ultraspeed é um serviço customizado e não é membro padrão dos templates genéricos; ASR/TTS não fazem parte do catálogo de modelos de chat desta entrega.
- O anúncio oficial informa que V2.5 Pro e V2.5 serão descontinuados em 2026-10-21 às 10:00 (horário de Pequim). Por enquanto o template de API original mantém esses dois itens e suas regras, para que as escolhas existentes continuem sendo resolvidas; o novo template do Token Plan oferece apenas V2.6. Esta mudança não reescreve automaticamente a escolha de modelo do usuário, que precisa migrar ativamente para V2.6. A remoção posterior dos membros antigos será tratada separadamente.
- O `templateId` `xiaomi-mimo` original não muda; apenas o nome de exibição padrão é atualizado e V2.6 é adicionado. O `providerId`, o nome personalizado, o `enabled`, a Key, o endereço da API e as substituições de modelo do Personal não são migrados nem reescritos. Instâncias existentes que tenham preenchido manualmente o endereço do Token Plan continuam com esse endereço.
- Os dois templates reutilizam o ícone `xiaomi-mimo` existente e o fluxo de criação de templates; não introduzem tipo de Provider, ramificação por marca nem nova fonte de estado.

```text
Built-in 模板 + 模型规则
          ↓ 现有 Resolver（Personal 覆盖优先）
Personal 实例 → Effective Provider → Registry → 新建模型请求
      ↑
设置页显式创建/编辑 → ProviderSettingsFacade → Personal 文件
```

O arquivo de origem é `config/provider/zcode-builtin.json`, com revision incremental; o arquivo do ambiente de teste é gerado por `pnpm provider:config:sync-test`. Download, cache e publicação seguem o contrato existente e não publicam a configuração remota automaticamente junto com o MR.

## Aceitação

| ID | Cenário | Asserções e evidências |
| --- | --- | --- |
| MIMO-01 | Leitura das configurações de produção/teste e resolução dos dois templates | Nome, protocolo, endereço, membros de modelo e regras de habilitação corretos; capacidades de V2.6 e mapeamento de parâmetros completos |
| MIMO-02 | Instância original e sobrescrita de endereço internacional | Nome, estado desabilitado, chave, endereço e configuração pessoal de modelos preservados; a resolução não modifica o Personal |
| MIMO-03 | Largura de celular em chinês claro / largura de desktop em inglês escuro | Os dois templates, o tooltip e o ícone aparecem corretamente; clicar em cada um entrega apenas o templateId correspondente; os detalhes usam o respectivo Base URL, sem gravação extra nem overflow horizontal |

Os testes unitários de configuração/Resolver cobrem MIMO-01/02. Os casos pending de navegador cobrem os componentes compartilhados de MIMO-03; veja a [matriz de casos](testing/provider-settings-batch-20260910.md). Os fixtures de navegador isolam a gravação do serviço e não equivalem à validação completa do Electron, do shared-host do celular ou de requisições oficiais pagas reais.

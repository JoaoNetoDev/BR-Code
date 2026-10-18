# Todo 43: Limite de evidências da Models API e correção do MiniMax M3

> Status: concluído

## 1. Nova descoberta

O Provider Endpoint pode oferecer uma Models API de nível de protocolo. Ela consulta os modelos
visíveis para o `Endpoint + API Schema + material de acesso` atual, e não um Base URL destacado da
conta:

```text
Endpoint + API Schema + Access
               |
               v
       Resposta ao vivo da Models API
               |
               +--> Evidência de membro do Model ID
               `--> Metadados de capacidade explicitamente fornecidos pela interface
               |
               v
       Relatório de divergências do publicador e revisão manual
               |
               v
          Built-in Release
```

Ela não sobrescreve diretamente o Config de runtime nem forma uma quarta camada de Overlay. Os
exemplos da documentação provam apenas o formato da interface e não substituem uma resposta ao
vivo com o material de acesso atual; capacidades que o fabricante não retornou continuam sendo
provadas pela documentação oficial e por medições reais de consumo de conteúdo.

## 2. Correção do conflito do MiniMax

Uma pesquisa antiga errou ao tomar, com base em uma visão geral de interface obsoleta e em exemplos
da Models API, `MiniMax-M3` como um candidato não provado diretamente por um Endpoint oficial. A
documentação oficial atual da China para "模型调用" (chamada de modelo) declara explicitamente:

- M3 é o modelo mais recente da série M;
- context de 1,000,000, com suporte a Text/Image/Video;
- Endpoint Anthropic da China é `https://api.minimaxi.com/anthropic`;
- Endpoint OpenAI da China é `https://api.minimaxi.com/v1`;
- Os dois exemplos de chamada compatível usam diretamente `MiniMax-M3`.

Portanto, a revision 4 deve colocar M3 em primeiro lugar no `builtinModelIds` do MiniMax e
habilitá-lo por padrão. M2.7 e highspeed podem continuar habilitados por padrão como níveis de
velocidade/custo diferentes; os antigos M2.x permanecem desabilitados.

## 3. Testes primeiro e aceitação

Primeiro modifica-se o teste real de integridade do Built-in, fazendo a revision 3 falhar:

- a revision do release é 4;
- os três primeiros membros do MiniMax são fixados como M3, M2.7 e M2.7-highspeed;
- os três têm Exact Rule com `enabled=true`;
- M3 é resolvido no Endpoint Anthropic atual como 1M, Text/Image/Video.

Em seguida faz-se a alteração mínima no Built-in Config e no relatório de pesquisa atual. Validam-se
os testes direcionados de Provider/Provider Node e o typecheck, o `pnpm typecheck` e o
`pnpm lint` da raiz, a verificação de formatação e o `git diff --check`.

## 4. Registro de implementação

- Built-in Config elevado para revision 4, com o primeiro segmento de membros do MiniMax alterado
  para M3, M2.7 e M2.7-highspeed, os três habilitados por padrão;
- As Model Rules existentes de 1M e Text/Image/Video do M3 permanecem inalteradas, e um novo teste
  real de Config fixa seu Effective Model Config no Endpoint Anthropic da China;
- O Design deixa explícito que a Models API só serve como evidência de verificação de release,
  relatório de divergências ou importação ativa pelo usuário, sem formar uma quarta camada de
  Overlay em Runtime;
- A conclusão antiga de que "M3 não foi provado por Endpoint compatível" foi marcada e corrigida; o
  Todo 41 preserva o histórico, mas deixa de servir como base atual;
- 47 testes do Provider Node e 151 do Provider passaram, assim como o typecheck dos dois pacotes e
  o typecheck da raiz; o lint da raiz passou mantendo 33 warnings preexistentes e não relacionados a
  esta rodada.
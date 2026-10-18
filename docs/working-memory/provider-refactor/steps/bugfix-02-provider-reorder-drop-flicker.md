# Bugfix 02: Provider volta à posição antiga ao soltar o arrasto e depois salta

> Status: concluído (validação automatizada aprovada; a reverificação manual no macOS Electron depende do pacote de desenvolvimento desta rodada)
>
> Data: 2026-08-27
>
> Origem: experiência manual nas Provider Settings do ZCode no macOS e auditoria da cadeia de chamada da implementação

## 1. Problema

Na página de configurações de Provider, depois de arrastar um Provider personalizado, o próprio arraste acompanha corretamente, mas ao soltar o mouse a lista primeiro volta à posição anterior ao arraste e só depois salta para a posição de destino.

Após uma auditoria completa da cadeia de chamada, a ordenação de Model não pertence a este problema: o `InlineEditableProviderCard`, camada acima de `SortableProviderModelList`, executa `setModels(next)` de forma síncrona antes do salvamento assíncrono e já possui a projeção otimista correta. Este Bugfix não adiciona uma segunda camada de estado Pending ao Model.

A ordem observada pelo usuário é:

```text
拖到目标位置
      |
      v
松手后回到旧位置
      |
      v
稍后跳到目标位置
```

A configuração final costuma ser salva com sucesso, portanto não se trata de erro no algoritmo de ordenação nem de perda do Personal Config, mas de uma janela visível de estado antigo entre o estado temporário de arraste e o fato persistido de forma assíncrona.

## 2. Causa raiz

O `dnd-kit` move os elementos Sortable temporariamente por meio de `transform` durante o arraste. Ao soltar, ele encerra o arraste e limpa o `transform` temporário; nesse momento a página ainda é renderizada conforme a antiga `navigationGroups` / `modelIds` vindas do componente pai.

O `onDragEnd` atual apenas calcula a nova ordem e chama o salvamento assíncrono, sem alterar de forma síncrona a ordem usada para renderização:

```text
Pointer Up
    |
    +--> dnd-kit 清除 transform
    |       |
    |       `--> Renderer 仍持有旧 Settings View
    |                   |
    |                   `--> 元素按 transition 回到旧位置
    |
    `--> reorderPersonalProviders
             |
             v
        Personal Config 文件锁与原子写入
             |
             v
        Registry refresh
             |
             v
        Provider Settings View onDidChange
             |
             v
        React 收到新顺序并重新排列 DOM
```

Assim, a interface primeiro mostra "o antigo fato depois de encerrado o estado temporário de arraste" e depois mostra "o novo fato após a conclusão da persistência". Depois que a refatoração de Provider concentrou a escrita da ordenação no Personal Config, no Registry e na Settings View formal, essa cadeia correta porém assíncrona deixou o problema antigo mais evidente.

Não se trata dos seguintes problemas:

- não é erro de índice de destino em `arrayMove`;
- não é usar a linha inteira do Provider como área de arraste;
- não é a transition de CSS em si estar errada;
- não é o Registry ou o Personal Config precisarem de IO síncrono;
- não é preciso criar outra cópia do Provider Config nem contornar o Settings Service formal.

## 3. Princípio da correção

A autoridade de persistência permanece inalterada:

```text
Personal Provider Config
        |
        v
Provider Registry / Settings View
        |
        `--> 最终确认的 Provider 顺序
```

O que a UI acrescenta é apenas uma projeção otimista para o período entre a interação e sua confirmação:

```text
正式 Settings View 顺序 -------------------------+
                                                  |
Drag End --> Pending Reorder（瞬时 UI 状态） -----+--> 当前渲染顺序
                    |
                    +--> 保存成功且 View 已对齐 --> 清除 Pending
                    |
                    `--> 保存失败 ---------------> 回滚到正式 View
```

`Pending Reorder` não vai para disco, não atravessa páginas, não entra no Registry e não participa da Model Selection nem da execução de modelos. Ele resolve apenas a continuidade visual de uma única ação do usuário entre o momento de soltar o mouse e a confirmação da View formal, sem formar um segundo fato de domínio.

## 4. Solução

### 4.1 Envio síncrono da ordem otimista ao soltar

- `onDragEnd` calcula primeiro a ordem completa de destino com base na ordem efetivamente renderizada no momento;
- no mesmo tratamento de evento, o Pending Reorder é atualizado de forma síncrona, de modo que o React já renderiza na ordem de destino quando o `dnd-kit` limpa o transform;
- em seguida o salvamento é feito pelo `ProviderSettingsService` já existente, sem contornar o Facade, o Config Repository ou o Registry;
- não se desliga a transition, não se atrasa o Drag End, não se mantém um transform falso nem se força a manipulação do DOM para mascarar a janela de estado antigo.

### 4.2 Confirmação ou rollback pela View formal

- quando a Settings View chega e é consistente com a ordem de destino desta vez, o Pending Reorder correspondente é limpo;
- em caso de falha no salvamento, faz-se rollback apenas do Pending Reorder que ainda pertence a esta operação, registrando o motivo da falha com o UI logger;
- uma requisição antiga que chega atrasada não pode sobrescrever uma ordenação mais nova iniciada pelo usuário;
- no descarregamento da página ou na troca de Environment, o Pending Reorder é descartado diretamente e a View formal do Environment de destino volta a valer.

### 4.3 Consistência da ordem final em arrastos consecutivos

Quando o usuário arrasta novamente antes de a primeira gravação terminar:

- a nova ordem precisa ser calculada com base na ordem otimista atual, sem reler a View antiga;
- as escritas de ordenação são serializadas na ordem em que as interações ocorreram, ou combinadas em "gravar o alvo mais recente";
- qualquer sucesso, falha ou push de View anterior não pode limpar um Pending Reorder mais novo;
- quando não houver mais operações em trânsito, a ordem da UI, o Personal Config e a Settings View precisam estar coerentes.

### 4.4 A ordenação de Model não muda

- a ordenação de Model continua sendo atualizada de forma síncrona em `models` pelo `InlineEditableProviderCard` antes do envio;
- em caso de falha de gravação, o owner do formulário continua fazendo rollback e exibindo o erro de gravação já existente;
- o Pending Reorder de Provider não é generalizado para um DTO de ordenação genérico da camada de domínio;
- é adicionada uma asserção de regressão provando que a cadeia existente de Model não foi quebrada pela correção de Provider.

## 5. Propriedade do estado

| Estado                     | Owner                     | Ciclo de vida                          | Finalidade                                    |
| ------------------------ | ------------------------- | -------------------------------------- | --------------------------------------------- |
| `providerOrder`          | Personal Config           | Persistido                             | Autoridade da ordenação feita pelo usuário    |
| Ordem na Settings View   | Provider Settings Service | Revisão do Registry                     | Fato de leitura formal da UI                  |
| Pending Provider Reorder | Provider Settings UI      | Página única, Environment único, uma ou mais interações | Projeção visual imediata após soltar        |
| `dnd-kit transform`      | Componente Sortable       | Um arraste por pointer/teclado         | Deslocamento durante o arraste                |

O Pending Reorder não é gravado no estado global de settings do Zustand; ele não precisa de sincronização entre janelas e não afeta Desktop continuous, Mobile replayable, Remote Workspace, Session Selection, fila ou semântica de recuperação.

## 6. Testes

Escrever primeiro o teste que falha e só então implementar a correção:

| Caso    | Configuração                            | Ação                   | Asserções                                                            |
| ------- | --------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| BF02-01 | Promise de gravação de Provider com atraso controlado | Arrastar e soltar | Já renderiza na ordem de destino antes da conclusão do Promise, sem voltar à posição antiga |
| BF02-02 | Falha na gravação de Provider           | Arrastar e soltar      | Exibe de forma otimista primeiro; após a falha, volta à ordem formal e registra o erro |
| BF02-03 | Gravação de Provider ainda não concluída | Arrastar duas vezes    | A segunda usa a ordem otimista; resultado atrasado não sobrescreve o alvo final |
| BF02-04 | Nova Provider Settings View igual ao alvo | Concluir a gravação   | O Pending é limpo e o refresco formal posterior não gera um segundo salto |
| BF02-05 | Promise de gravação de Model com atraso controlado | Arrastar um Model e soltar | A ordem otimista existente do formulário permanece estável, sem nova camada Pending |
| BF02-06 | Operação Sortable por teclado            | Concluir a reordenação de Provider | Tem a mesma semântica de atualização otimista e confirmação do arraste por pointer |
| BF02-07 | Troca de Environment / descarregamento da página | Existe Pending      | A ordem do Environment antigo não é levada para a nova página          |

Manter os testes existentes de ordenação com funções puras; os novos testes de interação precisam controlar o Promise de gravação e afirmar a ordem do DOM "antes da conclusão da gravação". Não basta esperar a View final para validar o resultado, senão não é possível impedir que essa regressão volte a ocorrer.

## 7. Portões de conclusão

- Após soltar, o Provider para diretamente na posição de destino, e o comportamento existente de Model não tem regressão;
- Sob IO de arquivo lento e refresh lento do Registry, não há retorno da ordem antiga;
- Falha de gravação permite rollback, e arrastos consecutivos atendem à latest intent;
- O Personal Config e a Settings View continuam sendo a única autoridade de persistência e de leitura formal;
- Não são adicionados IO de arquivo síncrono, ordenação manual do DOM, atraso fixo nem uma segunda Config;
- Os testes direcionados de Provider Settings, o typecheck da UI, o `typecheck` da raiz, o `lint` e a verificação de formatação passam;
- No runtime do macOS Electron, a continuidade visual é reverificada artificiando o slowdown da cadeia de gravação ou fazendo arrastos consecutivos.
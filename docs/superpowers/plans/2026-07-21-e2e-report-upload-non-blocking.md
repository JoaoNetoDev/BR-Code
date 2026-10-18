# Plano de Implementação de Upload de Relatório E2E Não Bloqueante

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** remover o gate obrigatório `ZCODE_E2E_REPORT_UPLOAD_REQUIRED`, fazendo com que a falha de upload na plataforma de relatórios gere apenas um alerta, preservando a semântica de falha da validação de E2E e do summary.

**Arquitetura:** os jobs de Bash no macOS e de PowerShell no Windows continuam salvando primeiro o estado dos testes e tentando o upload dentro do `script` principal, garantindo que o cenário de falha ainda tenha material de diagnóstico. O código de saída final passa a ler apenas o resultado da validação de E2E/summary e não mais o status de upload na plataforma de relatórios; testes estáticos de configuração de CI travam o comportamento consistente entre as duas plataformas.

**Stack tecnológico:** GitLab CI YAML, Bash, PowerShell, Vitest, TypeScript

## Restrições globais

- Modificar somente a orquestração de CI, os testes estáticos de CI e a spec existente de upload de relatórios, sem alterar o código de runtime do produto.
- A ausência do token da plataforma de relatórios, falha de rede, `4xx/5xx` ou timeout não podem fazer o job de CI falhar.
- Quando a validação de E2E ou do summary falhar, ainda é preciso falhar, e a tentativa de upload deve acontecer antes de retornar o código de saída do E2E.
- Os jobs de macOS e Windows mantêm a mesma semântica.

---

### Tarefa 1: travar o contrato de upload não bloqueante

**Arquivos:**
- Modificar: `packages/desktop/test/gitlabCiBuildGraph.test.ts:149`
- Testar: `packages/desktop/test/gitlabCiBuildGraph.test.ts`

**Interfaces:**
- Consome: o texto dos dois jobs de E2E de conversation-session em `.gitlab/ci/20-test.yml`.
- Produz: o contrato estático que preserva a posição do upload e a configuração de vídeo de falha e proíbe `ZCODE_E2E_REPORT_UPLOAD_REQUIRED`.

- [x] **Passo 1: escrever o teste que falha**

Mudar o nome do case para `collects failure videos without making report upload a CI gate` e adicionar para os dois jobs:

```ts
expect(macE2EJob).not.toContain("ZCODE_E2E_REPORT_UPLOAD_REQUIRED");
expect(windowsE2EJob).not.toContain("ZCODE_E2E_REPORT_UPLOAD_REQUIRED");
```

Manter as asserções de que o uploader fica antes do exit do E2E, de que não existe `after_script` e de que a chave de vídeo de falha existe.

- [x] **Passo 2: rodar o teste para verificar que falha**

Run: `pnpm exec vitest run packages/desktop/test/gitlabCiBuildGraph.test.ts -t "collects failure videos"`

Esperado: FAIL, apontando que os dois jobs ainda contêm `ZCODE_E2E_REPORT_UPLOAD_REQUIRED`.

### Tarefa 2: remover o gate obrigatório de upload nas duas plataformas

**Arquivos:**
- Modificar: `.gitlab/ci/20-test.yml:189`
- Testar: `packages/desktop/test/gitlabCiBuildGraph.test.ts`

**Interfaces:**
- Consome: o contrato estático da Tarefa 1.
- Produz: o status de upload do relatório usado apenas para warning, com o estado final do job determinado somente por `$e2e_status` / `$e2eStatus`.

- [x] **Passo 1: escrever a implementação mínima**

Remover das variables dos dois jobs:

```yaml
ZCODE_E2E_REPORT_UPLOAD_REQUIRED: "1"
```

E remover no macOS:

```bash
if [[ "${ZCODE_E2E_REPORT_UPLOAD_REQUIRED:-}" == "1" && "$report_upload_status" -ne 0 ]]; then
  exit "$report_upload_status"
fi
```

Remover no Windows:

```powershell
if ($env:ZCODE_E2E_REPORT_UPLOAD_REQUIRED -eq "1" -and $reportUploadStatus -ne 0) {
  exit $reportUploadStatus
}
```

Manter nos dois jobs o comentário de motivo em chinês: a plataforma externa de relatórios pertence à cadeia de diagnóstico e seu status não pode sobrescrever o resultado da validação de testes e do summary.

- [x] **Passo 2: rodar os testes focados para verificar que passam**

Run: `pnpm exec vitest run packages/desktop/test/gitlabCiBuildGraph.test.ts -t "collects failure videos"`

Run: `pnpm exec vitest run packages/desktop/test/ciPushE2eReportToFeedback.test.ts`

Esperado: PASS.

- [ ] **Passo 3: verificar os gates do repositório**

Run: `pnpm --filter @zcode/desktop typecheck:e2e`

Run: `pnpm typecheck`

Run: `pnpm lint`

Esperado: todos os comandos retornando código de saída 0.

- [ ] **Passo 4: commitar**

```bash
git add .gitlab/ci/20-test.yml packages/desktop/test/gitlabCiBuildGraph.test.ts docs/superpowers/plans/2026-07-21-e2e-report-upload-non-blocking.md
git commit -m "fix(ci): make e2e report upload non-blocking"
```
# Linha de Base de Comparação dos Testes Unitários Afetados no Push

Na primeira vez em que uma nova branch é enviada, a ref remota não tem commit com o qual comparar, e o runner dos testes unitários afetados volta à linha de base padrão. A linha de base padrão prefere `origin/staging`, depois `origin/HEAD`, `origin/main`, `origin/master`, `main`, `master`.

Não se força mais a execução da suíte completa por nomes de arquivos como lockfile, package, Vitest, TypeScript ou scripts de portão. Sempre que existir uma linha de base de comparação utilizável, os testes unitários afetados/relacionados são executados de forma unificada com base nas mudanças reais.

A suíte completa `pnpm test:unit` só é executada quando nenhuma linha de base utilizável é encontrada, ou quando arquivos de código-fonte que não podem ser entregues à análise de "related" do Vitest são removidos.
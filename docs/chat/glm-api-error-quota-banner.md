# Banner de cota de erro da API do GLM (migração V4 pendente)

O fluxo antigo oferecia, para erros de cota/API do GLM, CTAs de configurações de modelo, upgrade ou recuperação. O composer atual da V4 usa o `ChatErrorBanner` genérico e ainda não religou esses CTAs especializados nem as regras de supressão.

Portanto, o comportamento atual é exibir o erro genérico da projection e permitir o dismiss local; não se pode prometer a experiência especializada de cota indicada no título deste documento. A implementação posterior deve usar fault codes estruturados e o estado de provider/entitlement, sem depender de correspondência do texto do erro.
# Pacote de recursos do Weekend Banner

## 2026-09-12 Migração do workspace de produção

O código-fonte, os templates, os exemplos de dados e as ferramentas de empacotamento de Banner / Hero foram migrados para um workspace local independente,
`/Users/dev/Projects/zcode-marketing-resources` (sem Git); este repositório do App não mantém mais o diretório de produção de recursos.
O ponto de entrada atual é o README.md desse workspace; os recursos estão em packages/weekend-banner e packages/weekend-hero,
e os produtos em dist/<nome-do-pacote>/<versão>/. Execute `npm test`, `npm run check`, `npm run test:browser`, `npm run build`.
O diretório completo original e o rascunho do protocolo antigo permanecem no archive/app-cleanup-20260912-qJ2R6s desse workspace;
os dois ZIPs antigos rastreados pelo Git que foram removidos foram salvos separadamente, a partir do HEAD anterior à limpeza, em tracked-baseline/ no arquivo.
Apenas os recursos de produção foram limpos; o protocolo do App, o download/cache de recursos, a interface, o polling, o reporte e os fixtures de teste não mudam.
Abaixo seguem as convenções visuais históricas; o número de versão do pacote não representa mais a versão de build do novo workspace, e o lançamento deve usar o resumo do metadata.json dos novos produtos.

O pacote de recursos do Banner não desenha mais o botão "领取 / Claim" nem consome ctaZh/ctaEn, e a descrição de modelos usa a largura liberada. O clique no Banner inteiro e o fechar no canto superior direito continuam sendo responsabilidade do App; o pacote não adiciona tratamento de eventos. O novo pacote gera weekend-banner-v3.zip e mantém os arquivos v2 existentes.

O botão de replay do Hero v4 tem o mesmo tamanho do botão de fechar do App: 24×24px, ícone 12×12px; o hover do mouse não exibe contorno. Fundo transparente padrão, ícone branco a 70% e o fundo branco leve original do hover permanecem iguais; o focus-visible de teclado mantém um aviso de foco independente. Apenas o pacote Hero muda; Banner, botão de fechar do App e comportamento de replay não mudam.

## 2026-09-11 Atualização das regras de cota

O Hero v4 e o Banner compartilham o quota.js dentro do pacote e leem diretamente init.data.zcode_plan.entitlements.
Apenas grant_units não negativos e finitos de model_usage com period=one_time/daily participam do cálculo.
Quando existe benefício único, apenas os benefícios únicos são somados; caso contrário, os benefícios diários são somados, exibindo Tokens / dia ou Tokens / day.
Períodos desconhecidos não participam; entitlement vazio vale 0; sem zcode_plan, os dados de texto explícito antigos são mantidos por compatibilidade.
A descrição de modelos / a lista de benefícios mostram apenas o período selecionado nesta vez, evitando que a cota diária se misture à exibição de benefício único.
O Banner mantém o tamanho de fonte de 18px para os números, com o número completo com separadores de milhar, sem usar unidades compactas, sem truncar números e sem escalar.
O recebimento, o reporte e a cota real do App não mudam.
O código-fonte do Hero agora está no workspace independente packages/weekend-hero; o diretório histórico de recursos foi arquivado, e o lançamento precisa enviar o novo ZIP e atualizar URL/SHA.
A cota de item único da linha de detalhe de benefícios do Hero é abreviada por idioma (10亿 / 1B), enquanto o total no topo e os números do Banner mantêm o número completo.

Origem: template final editável da tarefa Find lower-left banner (nome da campanha 12px).
Produto: ZIP em `dist/weekend-banner/<versão>/` do workspace independente, com entrada `index.html`.

O pacote mantém o SVG da marca, o halo azul, a cota e a descrição de modelos; não é uma coleção de imagens nem carrega o editor de templates.
A moldura externa tem 96px de altura, e a borda e o raio são fornecidos pelo App; o pacote se ajusta à área de conteúdo de 94px e à largura variável.
O pacote não desenha o botão de fechar, não executa ações de clique nem reporte; a ação close do App é responsável por fechar.
Mantém o visual estático, sem dependências externas, armazenamento, requisições de rede ou animações automáticas.

```text
Download do ZIP / verificação do SHA → descompactação pelo App → sandbox iframe
  → init(theme,locale,data,instanceId) → desenho → ready
  → theme / resize → redesenho
  → destroy → limpeza
```

Reutiliza `zcode-cloud-hero-v1`. visibility/reducedMotion não têm animação a pausar, permanecendo estático.
Aceita apenas mensagens do parent e o instanceId atual; todo texto configurável é escapado antes de ser desenhado.
args suporta titleZh/titleEn, amountZh/amountEn, modelsZh/modelsEn, unit; os campos cta antigos são ignorados.
Sem configuração, usa os exemplos do template original (100亿 / 10B); estes são exemplos de exibição, não os benefícios em tempo real do usuário.
`args.zcode_plan.entitlements` se adapta automaticamente ao benefício de model_usage: único tem prioridade, mesmo período acumula,
o total é exibido com separadores de milhar completos, e show_name gera a descrição de modelos do período selecionado.
Se já houver plan, mas sem benefício válido, exibe 0 e não volta ao valor de exemplo. amountZh/amountEn e modelsZh/modelsEn explícitos
têm prioridade sobre o plan; sem plan, também são suportados os campos amountValue/amountUnit do App.
Quando o texto atual é longo, mantém os reticências do template original; o canto superior direito reserva espaço para o botão de fechar do App.

Verificação: executar `npm run test:browser` no workspace independente, cobrindo o ready do iframe isolado,
chinês e inglês × tema claro e escuro, escape de dados, largura variável, limpeza e erros de página; sem chamar a interface real de recebimento.
A URL de CDN dos dados de entrega é um placeholder e precisa ser substituída após o upload; a veiculação online não é alterada automaticamente.

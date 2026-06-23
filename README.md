# 401k Tracker — Flight Deck ✈️

Painel de acompanhamento do saldo do plano 401(k) (AA 401(K) PLAN via Fidelity NetBenefits), com tema visual inspirado em painel de cockpit de aviação.

## Funcionalidades

- **Saldo atual** em destaque, com variação desde a última leitura e desde o início do tracking
- **Gráfico de evolução** ("altímetro") do saldo ao longo do tempo
- **Registro manual de leituras**: adicione data + saldo a cada novo print do NetBenefits
- **Histórico completo** com diferença entre cada leitura
- Dados persistidos via `window.storage` (Claude Artifacts) — não depende de localStorage

## Como alimentar os dados

1. Tire print do saldo no app NetBenefits / Fidelity
2. Abra o painel e clique em **"+ NOVA LEITURA"**
3. Insira a data (conforme exibida como "as of" no app) e o saldo total
4. O gráfico e os deltas são recalculados automaticamente

## Stack

- React (artifact single-file)
- Recharts (gráfico de linha)
- lucide-react (ícones)
- Fontes: JetBrains Mono + Inter

## Origem dos dados

Histórico inicial populado manualmente a partir de prints do app NetBenefits (American Airlines, Inc. — AA 401(K) PLAN, plano 12455), referente a junho de 2026.

## Aviso

Este é um tracker pessoal e não substitui os dados oficiais da Fidelity/NetBenefits. Os valores devem ser conferidos diretamente no app oficial.

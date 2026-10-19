# Treino de Ouvido no Braço do Baixo

Site estático para treinar percepção musical no baixo elétrico: o site sorteia uma posição do braço, toca a nota sem revelar onde ela está e você clica onde acha que ela fica.

**Etapa 1** — baixo de 4 cordas, afinação padrão (E1 · A1 · D2 · G2), casas 0 a 12.

## Rodando localmente

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes unitários (Vitest)
npm run build      # build estático em dist/
```

Depois do primeiro `npm install`, comite o `package-lock.json` — o workflow passa a usar `npm ci`.

## Deploy

O workflow `.github/workflows/deploy.yml` roda a cada push na `main`: instala, testa, faz o build com `base` = `/<nome-do-repositório>/` e publica `dist/` no GitHub Pages. Em **Settings → Pages**, a fonte precisa estar em **GitHub Actions**.

## Organização

| Pasta | Conteúdo |
| --- | --- |
| `src/fretboard/` | Modelo do instrumento (notas, frequências, posições), geometria e o braço em SVG |
| `src/audio/` | Síntese de baixo dedilhado com Web Audio API (sem samples, sem rede) |
| `src/game/` | Estado do exercício (reducer), sorteio, regra de acerto e textos de feedback |

## Regras da etapa 1

- **Acerto** = qualquer posição com a mesma altura exata (mesmo número MIDI) da nota sorteada. Ex.: corda E casa 5 e corda A solta são ambas A1. No feedback, a posição sorteada aparece em verde e as equivalentes em verde tracejado.
- O sorteio é uniforme entre todas as posições e nunca repete a mesma posição duas vezes seguidas.
- Depois da resposta, ou antes de sortear, clicar no braço só toca o som (modo livre).

## Modo avançado

Ligue **Modo avançado** para treinar intervalos: em vez de uma nota, o site sorteia uma sequência de notas próximas com relação harmônica e toca uma depois da outra (0,8 s entre elas).

- **Material:** trechos de escala maior ou menor (graus vizinhos), ou arpejos de tríades maior/menor e de acordes com 7ª (dominante e menor). Podem ir subindo ou descendo e começar em qualquer grau ou inversão, sempre dentro da extensão do braço. A mesma sequência não sai duas vezes seguidas.
- **Resposta:** clique as notas na ordem em que tocaram. A regra continua sendo a mesma altura (mesmo MIDI). Cada palpite aparece na hora, numerado, em verde ou vermelho.
- **Resultado:** no fim aparecem as posições corretas numeradas, o nome do material (ex.: "arpejo de A menor, subindo") e os intervalos entre as notas.
- **Dificuldade:** começa com 2 notas. **Aumentar dificuldade** soma uma nota (até 6) e **−** tira uma.
- **Placar:** conta sequências inteiras (acerto só com todas as notas certas) e é separado do placar do modo básico.

O sorteio fica em `src/game/sequence.ts`.

A constante `MAX_FRET` em `src/fretboard/model.ts` controla quantas casas aparecem.

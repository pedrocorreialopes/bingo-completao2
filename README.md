# 🎰 BINGO 75 PRO — Chamador Inteligente com Locutor Virtual

Aplicativo completo de bingo eletrônico **75 bolas** para eventos presenciais,
festas, confraternizações, bingos beneficentes e sorteios recreativos.
Funciona **100 % offline** no navegador — sem servidor, sem dependências externas.

**Destaque central:** locutor virtual que narra cada bola em português do Brasil
(“Bê, número sete!”), com voz natural, configurável e sincronizada ao sorteio.

---

## Como abrir

| Arquivo | Para que serve |
|---|---|
| **`index.html`** | **Aplicativo principal** (operador + telão + vitória) |
| `tests.html` | Suíte de testes automáticos (37 verificações) — abra no navegador |

Basta abrir `index.html` no Chrome, Edge, Firefox ou Safari. Nada precisa ser instalado.

---

## Estrutura do projeto

```
index.html          Operador, telão, vitória, pedra maior e todos os modais
style.css → css/style.css
tests.html          Suíte de testes automatizados (roda no navegador)
assets/favicon.svg  Ícone da aplicação

js/core.js          Constantes BINGO 75, pronúncia pt-BR, utilitários, CSV, PRNG
js/persistence.js   PersistenceManager — localStorage + backup automático
js/settings.js      SettingsManager — configurações normalizadas e validadas
js/sound.js         Efeitos sonoros sintetizados via Web Audio API (sem arquivos)
js/voice.js         VoiceAnnouncer — LOCUTOR BINGO (Web Speech API)
js/players.js       PlayerManager — cadastro, busca, CSV
js/cards.js         CardManager — geração, validação, importação, progresso
js/engine.js        BingoEngine + BallDrawManager + monitoramento/alertas
js/winners.js       WinnerDetector + AlertManager + BigStoneManager
js/ui.js            ScreenManager — renderização, telão, confete, vitória
js/app.js           Controlador: liga tudo, modais, atalhos, eventos
```

---

## Funcionalidades implementadas

### Interface e identidade visual
- Azul-marinho profundo com detalhes dourados luminosos, estilo game show.
- Bolas **3D** com brilho, reflexo e cores por letra.
- Card premium, tipografia forte, botões grandes.
- Layout responsivo: Full HD 1920×1080, notebooks, tablets e celulares.
- **Interface de operador** + **interface de apresentação (telão)**.
- Compatível com TV, telão e projetor (alto contraste, fontes grandes).

### Tabuleiro Bingo 75
- 5 colunas coloridas: **B** azul (01–15), **I** vermelho (16–30),
  **N** amarelo (31–45), **G** verde (46–60), **O** roxo (61–75).
- Todos os 75 números visíveis desde o início.
- Bola sorteada → número marcado em dourado + destaque animado.
- Contador “X de 75 sorteados”, sem repetição, ordem cronológica no histórico.

### Sistema de sorteio
- PRNG **criptográfico** (`crypto.getRandomValues`) com Fisher-Yates.
- Pool de bolas restantes recalculado a cada sorteio — impede repetição.
- Animação de urna (bola sacudindo → aterrissagem com bounce).
- Sorteio **automático**, **manual**, pausar, continuar, finalizar.
- **Novo jogo** com confirmação e arquivamento da partida anterior.
- **Desfazer último sorteio** com confirmação (devolve a bola ao pool).

### Locutor virtual (LOCUTOR BINGO)
- **Web Speech API / SpeechSynthesis**, voz pt-BR automática.
- Pontuação de preferência por voz: prioriza **masculina brasileira**
  (Daniel, Antonio, Ricardo, Google pt-BR…), depois natural/neural.
- Pronúncia fonética correta: B = “Bê”, I = “Í”, N = “Êne”, G = “Gê”, O = “Ó”.
- Números por extenso de 1 a 75 (“sessenta e nove”, “quarenta e cinco”).
- Fila sequencial própria: **nunca inicia fala sobre fala**.
- Watchdog de segurança caso o motor não dispare `onend`.
- Pausa configurável entre revelação e fala (padrão 700 ms).
- **SILENCIAR** instantâneo (`cancel`), **REPETIR CHAMADA** sem novo sorteio.
- Anúncio de vitória e de pedra maior.
- **Fallback visual**: legenda “🔊 Bê, número sete” na tela quando não há voz.

### Personalização (Configurações)
- Ativar/desativar locutor, escolher voz, velocidade, tonalidade, volume.
- Pausa antes da fala, repetir letra, chamada extra (“Boa sorte!”…).
- Testar voz / testar bola / testar anúncio de vitória.
- Restaurar padrões.

### Intervalo entre bolas
- Presets 5, 8, 10, 15, 20, 30 s + **tempo personalizado**.
- Contagem regressiva visual (barra + segundos).
- Opção **“Intervalo após a narração”**: o tempo só começa quando o locutor termina.
- Nunca inicia nova bola durante a fala (salvo manual confirmado).

### Participantes
- Cadastro com nome, identificador automático, telefone opcional.
- Gerar N cartelas no ato do cadastro.
- Editar, excluir, pesquisar, importar e exportar CSV.

### Cartelas
- Geração automática válida por faixa, centro **LIVRE**.
- **Cartela manual** com validação em tempo real de faixa e duplicidade.
- Validação: 1–75, faixas BINGO, sem repetidos, 24 números + livre.
- Importação em massa CSV (25 valores row-major ou 24 por faixa).
- Exportação CSV, filtro por participante, busca por número, visualização.

### Monitoramento e alertas
- A cada bola: percorre todas as cartelas, marca, calcula faltantes.
- Cada cartela é monitorada individualmente (mesmo com várias por pessoa).
- **3 faltando** → MONITORANDO · **2** → ATENÇÃO · **1** → BINGO IMINENTE.
- Banner “FALTA APENAS 1 NÚMERO!”, painel de alertas e ranking.
- Som de alerta apenas quando o nível da cartela muda (sem excesso).

### Detecção de vitória
- Verificação imediata após cada bola; para sorteio, contagem e narração.
- Múltiplos ganhadores na mesma bola são **todos** identificados.
- Tela de vitória: BINGO! dourado, confetes em canvas, cartelas vencedoras
  com mini-grid, última bola, data/hora, som e anúncio falado.
- Texto do anúncio **personalizável** com `{nome}` e `{cartela}`.

### Pedra maior
- Sistema independente de desempate.
- Usa somente os ganhadores confirmados, permite adicionar/remover nomes.
- Sorteio animado com PRNG criptográfico; **não altera o sorteio principal**.
- Anúncio do resultado pelo locutor + confete.

### Modo telão
- Bola gigante, letra, número enorme, tabuleiro completo, últimas bolas.
- Alertas de 1 número e ranking na tela.
- Controles administrativos ocultos, contraste elevado, fullscreen (`F`).

### Histórico e recuperação
- Salvamento automático do estado completo (partida, bolas, ordem,
  ganhadores, configurações).
- **Backup automático** contínuo, **última partida finalizada** separada.
- Recuperação após recarregar ou fechar acidentalmente.
- Exportar/importar backup JSON com cópia de segurança pré-importação.
- Confirmação antes de novo jogo; nunca apaga dados do usuário como “reparo”.

### Estatísticas
Sorteadas · Restantes · % do jogo · Participantes · Cartelas ·
A 3 · A 2 · A 1 · Vencedoras · Tempo de partida.

### Efeitos sonoros (Web Audio API, sem arquivos)
Início, sorteio, revelação, alerta, alerta crítico, pausa, bingo,
pedra maior, vitória. Ativar/desativar e volume independente da voz.

---

## Atalhos de teclado

| Tecla | Ação |
|---|---|
| `Espaço` | Sortear próxima bola |
| `P` | Pausar / continuar |
| `R` | Repetir última chamada |
| `M` | Silenciar / reativar locutor |
| `F` | Modo telão / tela cheia |
| `Esc` | Fechar telão, modais e overlays |

---

## Armazenamento (localStorage)

Chaves com namespace `bingo75pro:` — todas preservadas em atualizações:

| Chave | Conteúdo |
|---|---|
| `bingo75pro:settings:v1` | Configurações |
| `bingo75pro:players:v1` | Participantes |
| `bingo75pro:cards:v1` | Cartelas |
| `bingo75pro:game:v1` | Partida em andamento |
| `bingo75pro:lastGame:v1` | Última partida finalizada |
| `bingo75pro:autobackup:v1` | Backup automático contínuo |

Sem cota? Há fallback em memória e descarte controlado do backup.
Importação de JSON guarda snapshot em `bingo75pro:preimport:*`.

---

## Testes

### `tests.html` — 37 verificações de lógica (0 falhas)
8 grupos: núcleo/pronúncia, sorteio, cartelas, participantes,
monitoramento/vitória, pedra maior, persistência, configurações/locutor.

### Verificação de fluxo real (Playwright) — 30 verificações (0 falhas)
Cadastro via formulário, iniciar, sortear, marcar tabuleiro, histórico,
repetir chamada, pausar/continuar, desfazer, novo jogo, 75 sorteios sem
repetição, telão, backup, silenciar.

---

## Requisitos do navegador

- **Chrome / Edge** — melhor suporte a vozes pt-BR (inclui masculinas).
- **Safari (macOS/iOS)** — vozes do sistema; requer interação inicial.
- **Firefox** — vozes instaladas no sistema operacional.

O áudio é liberado no primeiro clique (política de autoplay dos navegadores).
Sem voz pt-BR instalada, o app continua funcionando com legenda visual e
aviso no painel de configurações.

---

## Status

✅ Completo e funcional — todos os recursos descritos estão implementados
e verificados no navegador (desktop Full HD e mobile), não apenas ilustrados.

### Próximos passos possíveis
- Múltiplos padrões de vitória (linha, coluna, cantos, X).
- Impressão de cartelas em PDF com QR code.
- Sincronizar telão em outro dispositivo (BroadcastChannel / WebRTC).
- Histórico persistente de várias partidas anteriores.
- Ranking de ganhadores por evento.

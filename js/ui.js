/* ============================================================
   ui.js — ScreenManager
   Renderização do painel do operador, telão, alertas, vitória,
   pedra maior, confetes e notificações.
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;
  const $ = (id) => document.getElementById(id);

  const el = {};
  const IDS = [
    'statusPill', 'ballsCount', 'gameTimer', 'voiceChip', 'voiceChipText',
    'badgePlayers', 'badgeCards', 'btnPlayers', 'btnCards', 'btnSettings', 'btnBackup', 'btnTelao',
    'stage', 'ballMachine', 'drawnBall', 'ballLetter', 'ballNumber', 'ballLabel',
    'speechBox', 'speechText', 'countdownBox', 'countdownFill', 'countdownValue', 'stageHint',
    'controls', 'btnStart', 'btnPause', 'btnDraw', 'btnRepeat', 'btnMute', 'btnUndo',
    'btnFinish', 'btnNewGame', 'btnRecover',
    'board', 'boardProgress', 'stDrawn', 'stLeft', 'stPct', 'stPlayers', 'stCards',
    'st3', 'st2', 'st1', 'stWin',
    'alertBanner', 'alertBannerText', 'alertsList', 'historyCount', 'btnHistoryFull',
    'historyList', 'rankingList',
    'screenTelao', 'tDrawn', 'tClock', 'tStatus', 'btnExitTelao', 'tBall', 'tLetter',
    'tNumber', 'tSpeech', 'tSpeechText', 'tCountdown', 'tCountdownFill',
    'tCountdownValue', 'tRecent', 'tAlerts', 'tBoard',
    'screenVictory', 'confettiCanvas', 'victorySub', 'victoryWinners', 'victoryBall',
    'victoryMeta', 'btnVictoryStone', 'btnVictoryClose', 'btnVictoryNew',
    'screenBigStone', 'stoneSub', 'stoneGrid', 'stoneResult', 'stoneWinner', 'stoneLine',
    'stoneName', 'btnStoneAdd', 'btnStoneDraw', 'btnStoneRepeat', 'btnStoneClose',
    'toastHost'
  ];

  function cacheEls() {
    IDS.forEach((id) => { el[id] = $(id); });
  }

  let boardCells = new Map();   // num -> element (operador)
  let telaoCells = new Map();   // num -> element (telão)
  let lastRenderedBall = null;
  let lastDrawn = -1;
  let timerHandle = null;
  let victoryConfettiStop = null;
  let telaoOpen = false;
  let activeTab = 'alerts';

  /* ============================================================
     TABULEIRO
     ============================================================ */
  function buildBoard(container, cellMap) {
    if (!container) return;
    container.innerHTML = '';
    cellMap.clear();

    B.LETTERS.forEach((L) => {
      const col = document.createElement('div');
      col.className = 'board-col';
      col.setAttribute('role', 'rowgroup');

      const head = document.createElement('div');
      head.className = 'board-head';
      head.dataset.letter = L;
      head.textContent = L;
      col.appendChild(head);

      const [min, max] = B.RANGES[L];
      for (let n = min; n <= max; n++) {
        const cell = document.createElement('div');
        cell.className = 'board-cell';
        cell.dataset.num = String(n);
        cell.dataset.letter = L;
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', B.labelFor(n));
        cell.textContent = B.pad2(n);
        col.appendChild(cell);
        cellMap.set(n, cell);
      }
      container.appendChild(col);
    });
  }

  function paintBoard(cellMap, drawnSet, lastNum) {
    cellMap.forEach((cell, num) => {
      const isDrawn = drawnSet.has(num);
      if (isDrawn) {
        if (!cell.classList.contains('is-drawn')) {
          cell.classList.add('is-drawn');
          if (num === lastNum) {
            cell.classList.remove('is-last');
            void cell.offsetWidth;
            cell.classList.add('is-last');
          }
        }
      } else if (cell.classList.contains('is-drawn')) {
        cell.classList.remove('is-drawn', 'is-last');
      }
    });
  }

  /* ============================================================
     BOLA EM DESTAQUE
     ============================================================ */
  function paintBall(ball, opts) {
    const o = opts || {};
    const targets = [
      { box: el.drawnBall, letter: el.ballLetter, num: el.ballNumber, label: el.ballLabel },
      { box: el.tBall, letter: el.tLetter, num: el.tNumber, label: null }
    ];

    targets.forEach((t) => {
      if (!t.box) return;
      if (!ball) {
        t.box.dataset.letter = '';
        t.box.classList.add('is-empty');
        if (t.letter) t.letter.textContent = '—';
        if (t.num) t.num.textContent = '00';
        if (t.label) t.label.textContent = 'PRONTO';
        return;
      }
      t.box.classList.remove('is-empty');
      t.box.dataset.letter = ball.letter;
      if (t.letter) t.letter.textContent = ball.letter;
      if (t.num) t.num.textContent = B.pad2(ball.num);
      if (t.label) t.label.textContent = B.labelFor(ball.num);

      if (o.animate) {
        t.box.classList.remove('is-landing');
        void t.box.offsetWidth;
        t.box.classList.add('is-landing');
      }
    });
  }

  function paintDrawing(active) {
    if (!el.drawnBall) return;
    el.drawnBall.classList.toggle('is-drawing', !!active);
    if (el.tBall) el.tBall.classList.toggle('is-drawing', !!active);
  }

  /* ============================================================
     HISTÓRICO
     ============================================================ */
  function renderHistory(history) {
    const list = el.historyList;
    if (!list) return;
    if (!history.length) {
      list.innerHTML = '<li class="empty">Nenhuma bola sorteada ainda.</li>';
      if (el.historyCount) el.historyCount.textContent = '0 bolas';
      return;
    }
    if (el.historyCount) el.historyCount.textContent = `${history.length} ${history.length === 1 ? 'bola' : 'bolas'}`;

    const recent = history.slice(-60).reverse();
    list.innerHTML = recent.map((h, i) => `
      <li class="history-item${i === 0 ? ' is-new' : ''}">
        <span class="h-order">${h.order}</span>
        <span class="h-letter" data-letter="${h.letter}">${h.letter}</span>
        <span class="h-num">${B.pad2(h.num)}</span>
        <span class="h-time">${B.formatTime(h.at)}</span>
      </li>`).join('');
  }

  function renderFullHistory(history) {
    const list = el.historyFull;
    if (!list) return;
    if (!history.length) {
      list.innerHTML = '<li class="empty">Nenhuma bola sorteada nesta partida.</li>';
      return;
    }
    list.innerHTML = history.slice().reverse().map((h) => `
      <li class="history-item">
        <span class="h-order">${h.order}</span>
        <span class="h-letter" data-letter="${h.letter}">${h.letter}</span>
        <span class="h-num">${B.pad2(h.num)}</span>
        <span class="h-time">${B.formatTime(h.at)}</span>
      </li>`).join('');
  }

  function renderRecentBalls(history) {
    if (!el.tRecent) return;
    const recent = history.slice(-10).reverse();
    el.tRecent.innerHTML = recent.map((h) =>
      `<li title="${B.labelFor(h.num)}">${B.pad2(h.num)}</li>`).join('');
  }

  /* ============================================================
     ALERTAS / RANKING
     ============================================================ */
  function renderAlerts(analysis) {
    if (!el.alertsList) return;
    const banner = global.AlertManager.banner(analysis);

    if (el.alertBanner) {
      if (banner) {
        el.alertBanner.hidden = false;
        el.alertBannerText.textContent = banner.text;
        el.alertBanner.style.borderColor = banner.level === 1 ? '' : 'rgba(255,176,32,.45)';
      } else {
        el.alertBanner.hidden = true;
      }
    }

    const alerts = analysis.alerts || [];
    if (!alerts.length) {
      el.alertsList.innerHTML = '<p class="empty">Nenhum alerta por enquanto.<br>Sorteie bolas para monitorar as cartelas.</p>';
    } else {
      el.alertsList.innerHTML = alerts.slice(0, 40).map((a) => {
        const t = global.AlertManager.LEVEL_TEXT[a.level] || { status: '' };
        const nums = a.missingNumbers.map((n) => B.labelFor(n)).join(' ');
        return `
          <div class="alert-item lvl-${a.level}">
            <div class="alert-count">${a.level}</div>
            <div class="alert-body">
              <div class="alert-name">${B.escapeHtml(a.playerName)}</div>
              <div class="alert-meta">Cartela ${B.escapeHtml(a.code)} · faltam ${B.escapeHtml(nums)}</div>
            </div>
            <div class="alert-status">${t.status}</div>
          </div>`;
      }).join('');
    }

    // ranking
    if (el.rankingList) {
      const winnersIds = new Set((analysis.winners || []).map((w) => w.cardId));
      if (!alerts.length && !winnersIds.size) {
        el.rankingList.innerHTML = '<p class="empty">Sem cartelas em jogo.</p>';
      } else {
        const rows = alerts.slice(0, 20).map((a) => `
          <div class="alert-item lvl-${a.level}">
            <div class="alert-count">${a.missing}</div>
            <div class="alert-body">
              <div class="alert-name">${B.escapeHtml(a.playerName)}</div>
              <div class="alert-meta">Cartela ${B.escapeHtml(a.code)} · ${a.hit}/${a.total} marcados</div>
            </div>
            <div class="alert-status">${a.level <= 2 ? 'ATENÇÃO' : 'MONITOR'}</div>
          </div>`);
        el.rankingList.innerHTML = rows.join('') || '<p class="empty">Sem cartelas em jogo.</p>';
      }
    }

    // telão
    if (el.tAlerts) {
      const crit = alerts.filter((a) => a.level <= 2).slice(0, 3);
      el.tAlerts.innerHTML = crit.map((a) => {
        const cls = a.level === 1 ? 'crit' : '';
        return `<div class="telao-alert ${cls}">${global.AlertManager.telaoText(a)}</div>`;
      }).join('');
    }
  }

  /* ============================================================
     ESTATÍSTICAS
     ============================================================ */
  function renderStats(stats) {
    const set = (node, v) => { if (node) node.textContent = v; };
    set(el.stDrawn, stats.drawn);
    set(el.stLeft, stats.remaining);
    set(el.stPct, stats.percent + '%');
    set(el.stPlayers, stats.players);
    set(el.stCards, stats.cards);
    set(el.st3, stats.lvl3);
    set(el.st2, stats.lvl2);
    set(el.st1, stats.lvl1);
    set(el.stWin, stats.won);
    set(el.ballsCount, stats.drawn);
    set(el.tDrawn, stats.drawn);
    set(el.badgePlayers, stats.players);
    set(el.badgeCards, stats.cards);
    if (el.boardProgress) el.boardProgress.textContent = `${stats.drawn} de 75 sorteados`;

    const mark = (node, on, cls) => {
      if (!node) return;
      node.classList.toggle(cls, on);
    };
    mark(el.st1 ? el.st1.parentElement : null, stats.lvl1 > 0, 'hot');
    mark(el.st2 ? el.st2.parentElement : null, stats.lvl2 > 0, 'warn');
    mark(el.stWin ? el.stWin.parentElement : null, stats.won > 0, 'warn');
  }

  /* ============================================================
     STATUS / CONTROLES
     ============================================================ */
  const STATUS_TEXT = {
    idle: 'AGUARDANDO INÍCIO',
    running: 'JOGO EM ANDAMENTO',
    paused: 'PAUSADO',
    bingo: 'BINGO!',
    finished: 'PARTIDA FINALIZADA'
  };

  function renderStatus(state) {
    if (el.statusPill) {
      el.statusPill.dataset.status = state.status;
      el.statusPill.textContent = STATUS_TEXT[state.status] || state.status.toUpperCase();
    }
    if (el.tStatus) el.tStatus.textContent = STATUS_TEXT[state.status] || '—';
  }

  function renderControls(state) {
    const E = global.BingoEngine;
    const running = state.status === 'running';
    const paused = state.status === 'paused';
    const ended = state.status === 'bingo' || state.status === 'finished';
    const noBalls = E.remainingCount() === 0;

    if (el.btnStart) {
      el.btnStart.disabled = running || ended || noBalls;
      if (paused) {
        el.btnStart.innerHTML = '<span class="ico">▶</span> CONTINUAR';
      } else {
        el.btnStart.innerHTML = '<span class="ico">▶</span> INICIAR JOGO';
      }
    }
    if (el.btnPause) {
      el.btnPause.disabled = !running;
      el.btnPause.innerHTML = '<span class="ico">⏸</span> PAUSAR';
    }
    if (el.btnDraw) {
      el.btnDraw.disabled = ended || noBalls;
    }
    if (el.btnRepeat) {
      el.btnRepeat.disabled = !state.lastBall;
    }
    if (el.btnUndo) {
      el.btnUndo.disabled = !state.history.length || ended && state.status === 'finished';
    }
    if (el.btnFinish) {
      el.btnFinish.disabled = !(running || paused);
    }
    if (el.btnRecover) {
      const hasBackup = !!(global.Persistence.loadLastGame() || global.Persistence.loadAutoBackup());
      el.btnRecover.disabled = false;
      el.btnRecover.title = hasBackup ? 'Recuperar a última partida salva' : 'Nenhuma partida salva encontrada';
    }
  }

  function renderVoiceChip(voiceState) {
    if (!el.voiceChip) return;
    const S = global.Settings.state;
    let text = 'Locutor ativo';
    let muted = false;

    if (!voiceState.supported) {
      text = 'Locutor indisponível';
      muted = true;
    } else if (S.muted || !S.voiceEnabled) {
      text = 'Locutor silenciado';
      muted = true;
    } else if (voiceState.speaking) {
      text = 'Anunciando…';
    } else if (!voiceState.voiceName) {
      text = 'Sem voz pt-BR';
    } else {
      text = String(voiceState.voiceName).split(' ').slice(0, 3).join(' ');
    }
    el.voiceChipText.textContent = text;
    el.voiceChip.classList.toggle('is-muted', muted);
    el.voiceChip.title = voiceState.voiceName
      ? `Voz: ${voiceState.voiceName} (${voiceState.voiceLang})`
      : 'Nenhuma voz compatível instalada';

    if (el.btnMute) {
      const isMuted = S.muted || !S.voiceEnabled;
      el.btnMute.innerHTML = isMuted
        ? '<span class="ico">🔇</span> REATIVAR VOZ'
        : '<span class="ico">🔇</span> SILENCIAR';
      el.btnMute.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    }
  }

  function renderStageHint(state) {
    if (!el.stageHint) return;
    const E = global.BingoEngine;
    let text = '';
    if (state.status === 'bingo') {
      text = 'Bingo confirmado! Veja a tela de vitória.';
    } else if (state.status === 'finished') {
      text = 'Partida finalizada. Use "Novo jogo" para começar outra.';
    } else if (E.remainingCount() === 0) {
      text = 'Todas as 75 bolas foram sorteadas.';
    } else if (!state.history.length) {
      const cards = global.CardManager.count();
      text = cards
        ? 'Pronto para começar. Boa sorte a todos!'
        : 'Dica: cadastre participantes e cartelas para monitoramento automático.';
    } else if (state.status === 'running') {
      text = `Última chamada: ${B.labelFor(state.lastBall.num)} · restam ${E.remainingCount()} bolas`;
    } else if (state.status === 'paused') {
      text = 'Jogo pausado. Use CONTINUAR ou sorteie manualmente.';
    }
    el.stageHint.textContent = text;
  }

  /* ============================================================
     CONTAGEM REGRESSIVA
     ============================================================ */
  function renderCountdown(payload) {
    const active = payload && payload.active;
    if (el.countdownBox) el.countdownBox.hidden = !active;
    if (el.tCountdown) el.tCountdown.hidden = !active;
    if (!active) {
      if (el.countdownFill) el.countdownFill.style.width = '0%';
      if (el.tCountdownFill) el.tCountdownFill.style.width = '0%';
      return;
    }
    const rem = Math.max(0, Number(payload.remaining) || 0);
    const total = Math.max(1, Number(payload.total) || 1);
    const pct = Math.max(0, Math.min(100, (rem / total) * 100));
    const secs = Math.ceil(rem / 1000);
    if (el.countdownFill) el.countdownFill.style.width = pct + '%';
    if (el.tCountdownFill) el.tCountdownFill.style.width = pct + '%';
    if (el.countdownValue) el.countdownValue.textContent = secs;
    if (el.tCountdownValue) el.tCountdownValue.textContent = secs;
  }

  function renderTick(payload) {
    renderCountdown({ active: true, remaining: payload.remaining, total: payload.total });
  }

  /* ============================================================
     RELÓGIO
     ============================================================ */
  function startClock() {
    if (timerHandle) clearInterval(timerHandle);
    timerHandle = setInterval(() => {
      const st = global.BingoEngine.state;
      const ms = st.startedAt ? (st.endedAt || Date.now()) - st.startedAt : 0;
      const label = B.formatClock(ms);
      if (el.gameTimer) el.gameTimer.textContent = label;
      if (el.tClock) el.tClock.textContent = label;
    }, 500);
  }

  /* ============================================================
     FALA (legenda)
     ============================================================ */
  function setSpeech(text, active) {
    if (el.speechBox) {
      if (text) {
        el.speechBox.hidden = false;
        el.speechText.textContent = '🔊 ' + text;
        el.speechBox.style.opacity = active ? '1' : '.62';
      } else {
        el.speechBox.hidden = true;
      }
    }
    if (el.tSpeech) {
      if (text) {
        el.tSpeech.hidden = false;
        el.tSpeechText.textContent = text;
        el.tSpeech.style.opacity = active ? '1' : '.6';
      } else {
        el.tSpeech.hidden = true;
      }
    }
  }

  /* ============================================================
     TELÃO
     ============================================================ */
  function openTelao() {
    if (!el.screenTelao) return;
    telaoOpen = true;
    el.screenTelao.hidden = false;
    el.screenTelao.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    const st = global.BingoEngine.state;
    paintBall(st.lastBall, { animate: false });
    renderRecentBalls(st.history);
    const a = global.BingoEngine.analyze();
    renderAlerts(a);
    paintBoard(telaoCells, global.BingoEngine.drawnSet(), st.lastBall ? st.lastBall.num : -1);
    renderCountdown({ active: global.BingoEngine.countdownActive(), remaining: global.BingoEngine.countdownRemaining(), total: 1 });
  }

  function closeTelao() {
    telaoOpen = false;
    if (el.screenTelao) {
      el.screenTelao.hidden = true;
      el.screenTelao.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('no-scroll');
    if (document.fullscreenElement && document.fullscreenElement === el.screenTelao) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function toggleTelao() {
    if (telaoOpen) closeTelao(); else openTelao();
  }

  function isTelaoOpen() { return telaoOpen; }

  function requestFullscreen() {
    const node = el.screenTelao;
    if (!node) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    const req = node.requestFullscreen || node.webkitRequestFullscreen || node.msRequestFullscreen;
    if (req) {
      req.call(node).catch(() => {
        toast('Fullscreen bloqueado pelo navegador. Pressione F11.', 'warn');
      });
    } else {
      toast('Use F11 para tela cheia neste navegador.', 'warn');
    }
  }

  /* ============================================================
     CONFETE
     ============================================================ */
  function confetti(durationMs) {
    const canvas = el.confettiCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, global.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
    };
    resize();
    global.addEventListener('resize', resize, { passive: true });

    const colors = ['#f6c945', '#ffe79a', '#2f7cf6', '#2fd18b', '#f04a5b', '#a45cf5', '#ffffff'];
    const count = Math.min(240, Math.floor((canvas.width * canvas.height) / 14000));
    const parts = [];
    for (let i = 0; i < count; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * -0.6,
        w: (6 + Math.random() * 9) * dpr,
        h: (9 + Math.random() * 14) * dpr,
        vx: (Math.random() - 0.5) * 1.6 * dpr,
        vy: (2 + Math.random() * 3.6) * dpr,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.22,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1
      });
    }

    const start = performance.now();
    const total = durationMs || 7000;
    if (victoryConfettiStop) victoryConfettiStop();

    let raf = null;
    let stopped = false;

    const frame = (t) => {
      if (stopped) return;
      const elapsed = t - start;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      parts.forEach((p) => {
        p.vy += 0.045 * dpr;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > canvas.height + 40 * dpr) {
          p.y = -20 * dpr;
          p.x = Math.random() * canvas.width;
          p.vy = (2 + Math.random() * 3) * dpr;
        }
        const fade = elapsed > total * 0.75 ? Math.max(0, 1 - (elapsed - total * 0.75) / (total * 0.25)) : 1;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < total) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    raf = requestAnimationFrame(frame);

    victoryConfettiStop = () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      global.removeEventListener('resize', resize);
    };
  }

  function stopConfetti() {
    if (victoryConfettiStop) {
      victoryConfettiStop();
      victoryConfettiStop = null;
    }
  }

  /* ============================================================
     TELA DE VITÓRIA
     ============================================================ */
  function miniCardHtml(card, drawnSet) {
    const cells = [];
    for (let i = 0; i < 25; i++) {
      if (i === global.CardManager.FREE_INDEX) {
        cells.push('<span class="free">LIVRE</span>');
        continue;
      }
      const v = card.grid[i];
      const hit = drawnSet.has(v) || v === 0;
      cells.push(`<span class="${hit ? 'hit' : ''}">${B.pad2(v)}</span>`);
    }
    return `<div class="wc-mini">${cells.join('')}</div>`;
  }

  function showVictory(winners, ball) {
    if (!el.screenVictory) return;
    const drawnSet = global.BingoEngine.drawnSet();
    const cardsAll = global.CardManager.all();

    el.victorySub.textContent = winners.length > 1
      ? `${winners.length} cartelas completas na mesma bola!`
      : 'Cartela completa! Temos um ganhador!';

    el.victoryWinners.innerHTML = winners.map((w, i) => {
      const card = cardsAll.find((c) => c.id === w.cardId);
      return `
        <div class="winner-card${i === 0 ? ' is-main' : ''}" style="animation-delay:${i * 0.12}s">
          <div class="wc-code">CARTELA ${B.escapeHtml(w.code)}</div>
          <h3>${B.escapeHtml(w.playerName)}</h3>
          ${card ? miniCardHtml(card, drawnSet) : ''}
        </div>`;
    }).join('');

    if (el.victoryBall) {
      el.victoryBall.textContent = ball ? B.labelFor(ball.num) : '—';
    }
    if (el.victoryMeta) {
      el.victoryMeta.textContent = ball
        ? `Última bola · ${B.formatDateTime(ball.at)}`
        : '';
    }
    if (el.btnVictoryStone) {
      el.btnVictoryStone.hidden = !(global.Settings.get('stoneAuto') && winners.length > 1);
    }

    el.screenVictory.hidden = false;
    el.screenVictory.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    confetti(9000);
    if (global.Sound) global.Sound.play('bingo');
  }

  function hideVictory() {
    if (!el.screenVictory) return;
    el.screenVictory.hidden = true;
    el.screenVictory.setAttribute('aria-hidden', 'true');
    stopConfetti();
    document.body.classList.remove('no-scroll');
  }

  function isVictoryOpen() {
    return el.screenVictory && !el.screenVictory.hidden;
  }

  /* ============================================================
     PEDRA MAIOR
     ============================================================ */
  function renderStone() {
    const S = global.BigStoneManager;
    if (el.stoneGrid) {
      el.stoneGrid.innerHTML = S.candidates.map((c) => {
        const isWinner = S.winner && S.winner.id === c.id;
        return `<span class="stone-chip${isWinner ? ' is-win' : ''}" data-id="${B.escapeHtml(c.id)}">
          <span class="sc-dot"></span>${B.escapeHtml(c.name)}
          ${!S.winner ? `<button type="button" class="sc-x" data-remove="${B.escapeHtml(c.id)}" aria-label="Remover">✕</button>` : ''}
        </span>`;
      }).join('') || '<p class="empty">Nenhum candidato.</p>';
    }
    if (el.stoneResult) {
      el.stoneResult.hidden = !S.winner;
    }
    if (S.winner) {
      if (el.stoneWinner) el.stoneWinner.textContent = S.winner.name;
      if (el.stoneLine) el.stoneLine.textContent = S.winner.code && S.winner.code !== '—'
        ? `venceu a pedra maior! · cartela ${S.winner.code}`
        : 'venceu a pedra maior! Parabéns!';
    }
    if (el.stoneSub) {
      el.stoneSub.textContent = S.candidates.length > 1
        ? `Desempate entre ${S.candidates.length} participantes`
        : 'Desempate entre os ganhadores';
    }
    if (el.btnStoneDraw) {
      el.btnStoneDraw.disabled = S.candidates.length === 0 || !!S.winner;
    }
  }

  function showBigStone(winners) {
    const S = global.BigStoneManager;
    if (winners && winners.length) {
      S.initFromWinners(winners);
    } else {
      S.initFromWinners(global.BingoEngine.state.winners);
    }
    S.winner = null;
    renderStone();
    if (el.screenBigStone) {
      el.screenBigStone.hidden = false;
      el.screenBigStone.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
    }
    if (global.Sound) global.Sound.play('stone');
  }

  function hideBigStone() {
    if (!el.screenBigStone) return;
    el.screenBigStone.hidden = true;
    el.screenBigStone.setAttribute('aria-hidden', 'true');
    if (el.screenVictory && el.screenVictory.hidden) {
      document.body.classList.remove('no-scroll');
    }
  }

  function isStoneOpen() {
    return el.screenBigStone && !el.screenBigStone.hidden;
  }

  /* ============================================================
     TOAST
     ============================================================ */
  function toast(message, type, ms) {
    if (!el.toastHost) return;
    const icons = { ok: '✔', warn: '⚠', err: '✕', gold: '🏆', info: 'ℹ' };
    const node = document.createElement('div');
    node.className = `toast ${type || ''}`;
    node.innerHTML = `<span class="toast-ico">${icons[type] || icons.info}</span><span>${B.escapeHtml(message)}</span>`;
    el.toastHost.appendChild(node);
    const dur = ms || (type === 'err' ? 5200 : 3200);
    setTimeout(() => {
      node.classList.add('is-hiding');
      setTimeout(() => node.remove(), 260);
    }, dur);
  }

  /* ============================================================
     ABAS LATERAIS
     ============================================================ */
  function initTabs() {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeTab = tab.dataset.tab;
        document.querySelectorAll('.tab').forEach((t) => {
          const on = t === tab;
          t.classList.toggle('is-active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        document.querySelectorAll('.tab-panel').forEach((p) => {
          p.classList.toggle('is-active', p.dataset.panel === activeTab);
        });
        if (activeTab === 'history') {
          renderHistory(global.BingoEngine.state.history);
        }
      });
    });
  }

  /* ============================================================
     RENDER COMPLETO
     ============================================================ */
  function render(state) {
    const E = global.BingoEngine;
    const st = state || E.state;
    const drawnSet = E.drawnSet();
    const lastNum = st.lastBall ? st.lastBall.num : -1;

    paintBoard(boardCells, drawnSet, lastNum);
    if (telaoOpen) paintBoard(telaoCells, drawnSet, lastNum);

    if (st.lastBall && (!lastRenderedBall || lastRenderedBall.num !== st.lastBall.num)) {
      paintBall(st.lastBall, { animate: lastRenderedBall !== null });
      lastRenderedBall = st.lastBall;
    } else if (!st.lastBall && lastRenderedBall) {
      paintBall(null);
      lastRenderedBall = null;
    }

    const analysis = E.analyze();
    renderAlerts(analysis);
    renderStats(E.stats());
    renderStatus(st);
    renderControls(st);
    renderStageHint(st);
    renderHistory(st.history);
    renderRecentBalls(st.history);
    renderVoiceChip(global.Voice.getState());
  }

  function init() {
    cacheEls();
    buildBoard(el.board, boardCells);
    buildBoard(el.tBoard, telaoCells);
    initTabs();
    startClock();
    paintBall(null);
  }

  global.UI = {
    el,
    init,
    render,
    paintBall,
    paintDrawing,
    renderAlerts,
    renderStats,
    renderHistory,
    renderFullHistory,
    renderStatus,
    renderControls,
    renderVoiceChip,
    renderCountdown,
    renderTick,
    setSpeech,
    openTelao,
    closeTelao,
    toggleTelao,
    isTelaoOpen,
    requestFullscreen,
    showVictory,
    hideVictory,
    isVictoryOpen,
    renderStone,
    showBigStone,
    hideBigStone,
    isStoneOpen,
    toast,
    confetti,
    stopConfetti,
    get activeTab() { return activeTab; }
  };
})(window);

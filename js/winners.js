/* ============================================================
   winners.js — WinnerDetector + AlertManager + BigStoneManager
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;

  /* ============================================================
     WinnerDetector — verificação independente do estado da partida
     ============================================================ */
  const WinnerDetector = {
    /**
     * Verifica quais cartelas estão completas dado um conjunto de sorteados.
     * @returns {Array<{cardId,code,playerId,playerName,missing}>}
     */
    detect(cards, drawnSet, players) {
      const map = new Map((players || []).map((p) => [p.id, p]));
      const out = [];
      (cards || []).forEach((card) => {
        const nums = card.grid.filter((v, i) => i !== global.CardManager.FREE_INDEX && v > 0);
        if (!nums.length) return;
        const complete = nums.every((n) => drawnSet.has(n));
        if (!complete) return;
        const p = map.get(card.playerId);
        out.push({
          cardId: card.id,
          code: card.code,
          codeSpoken: global.spokenCardCode(card.code),
          playerId: card.playerId,
          playerName: p ? p.name : 'Participante removido',
          missing: 0,
          card
        });
      });
      return out;
    },

    /** Cartelas mais próximas, ordenadas */
    nearest(cards, drawnSet, players, limit) {
      const map = new Map((players || []).map((p) => [p.id, p]));
      const list = (cards || []).map((card) => {
        const prog = global.CardManager.progress(card, drawnSet);
        const p = map.get(card.playerId);
        return {
          cardId: card.id,
          code: card.code,
          codeSpoken: global.spokenCardCode(card.code),
          playerId: card.playerId,
          playerName: p ? p.name : 'Participante removido',
          missing: prog.missing,
          hit: prog.hit,
          missingNumbers: prog.missingNumbers,
          card
        };
      }).filter((c) => c.hit > 0)
        .sort((a, b) => a.missing - b.missing || b.hit - a.hit);

      return limit ? list.slice(0, limit) : list;
    }
  };

  /* ============================================================
     AlertManager — níveis de proximidade e mensagens
     ============================================================ */
  const LEVEL_TEXT = {
    3: { status: 'MONITORANDO', speak: 'Atenção, cartela a três números do bingo.' },
    2: { status: 'ATENÇÃO', speak: 'Atenção! Participante a dois números do bingo!' },
    1: { status: 'BINGO IMINENTE', speak: 'Falta apenas um número!' }
  };

  const AlertManager = {
    LEVEL_TEXT,

    /** Mensagem de destaque do topo do painel de alertas */
    banner(analysis) {
      if (!analysis || !analysis.alerts || !analysis.alerts.length) return null;
      const one = analysis.alerts.filter((a) => a.level === 1);
      if (one.length) {
        return {
          level: 1,
          text: one.length === 1
            ? 'FALTA APENAS 1 NÚMERO!'
            : `${one.length} CARTELAS A 1 NÚMERO DO BINGO!`
        };
      }
      const two = analysis.alerts.filter((a) => a.level === 2);
      if (two.length) {
        return { level: 2, text: 'ATENÇÃO! PARTICIPANTE A 2 NÚMEROS DO BINGO!' };
      }
      return null;
    },

    /** Texto de anúncio de proximidade (usado opcionalmente pelo locutor) */
    announceText(alert) {
      const t = LEVEL_TEXT[alert.level];
      const nums = (alert.missingNumbers || []).map((n) => B.labelFor(n)).join(', ');
      return `${t.speak} ${alert.playerName}, cartela ${alert.codeSpoken}. ${alert.level === 1 ? 'Falta o número: ' + nums + '.' : ''}`.trim();
    },

    /** Texto no telão */
    telaoText(alert) {
      if (alert.level === 1) {
        return `<span class="ta-flag">BINGO IMINENTE</span> ${B.escapeHtml(alert.playerName)} — falta ${B.escapeHtml(B.labelFor(alert.missingNumbers[0] || ''))} · cartela ${B.escapeHtml(alert.code)}`;
      }
      return `<span class="ta-flag">ATENÇÃO</span> ${B.escapeHtml(alert.playerName)} — a ${alert.level} números · cartela ${B.escapeHtml(alert.code)}`;
    }
  };

  /* ============================================================
     BigStoneManager — desempate por pedra maior
     ============================================================ */
  const BigStone = {
    candidates: [],
    winner: null,
    spinning: false,

    /** Inicializa a partir dos ganhadores registrados */
    initFromWinners(winners) {
      this.candidates = (winners || []).map((w, i) => ({
        id: w.cardId || B.uid('stone'),
        name: w.playerName,
        code: w.code,
        source: 'bingo',
        order: i
      }));
      this.winner = null;
      this.spinning = false;
      return this.candidates;
    },

    addCandidate(name) {
      const n = String(name || '').trim();
      if (!n) return { ok: false, error: 'Informe um nome.' };
      if (n.length > 60) return { ok: false, error: 'Nome muito longo.' };
      if (this.candidates.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
        return { ok: false, error: 'Este nome já está na pedra maior.' };
      }
      const c = { id: B.uid('stone'), name: n, code: '—', source: 'manual', order: this.candidates.length };
      this.candidates.push(c);
      return { ok: true, candidate: c };
    },

    removeCandidate(id) {
      const idx = this.candidates.findIndex((c) => c.id === id);
      if (idx < 0) return { ok: false, error: 'Não encontrado.' };
      if (this.winner && this.winner.id === id) this.winner = null;
      this.candidates.splice(idx, 1);
      return { ok: true };
    },

    /**
     * Sorteia o vencedor com PRNG criptográfico.
     * Não altera o sorteio principal do bingo.
     */
    draw() {
      if (this.spinning) return { ok: false, error: 'Sorteio em andamento.' };
      if (this.candidates.length < 1) return { ok: false, error: 'Adicione ao menos um participante.' };
      if (this.candidates.length === 1) {
        this.winner = this.candidates[0];
        return { ok: true, winner: this.winner, single: true };
      }
      const idx = B.randomInt(this.candidates.length);
      this.winner = this.candidates[idx];
      return { ok: true, winner: this.winner };
    },

    result() {
      if (!this.winner) return null;
      return {
        candidates: this.candidates.map((c) => ({ id: c.id, name: c.name, code: c.code })),
        winnerId: this.winner.id,
        winnerName: this.winner.name,
        winnerCode: this.winner.code,
        at: Date.now()
      };
    },

    reset() {
      this.candidates = [];
      this.winner = null;
      this.spinning = false;
    },

    /** Anúncio falado do resultado */
    announceText() {
      if (!this.winner) return 'Vamos à pedra maior!';
      return `Vamos à pedra maior! ${this.winner.name} venceu a pedra maior! Parabéns!`;
    }
  };

  global.WinnerDetector = WinnerDetector;
  global.AlertManager = AlertManager;
  global.BigStoneManager = BigStone;
})(window);

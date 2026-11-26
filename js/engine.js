/* ============================================================
   engine.js — BingoEngine + BallDrawManager + AlertManager
   Sequência completa de sorteio, contagem regressiva, pausa,
   desfazer, monitoramento de cartelas e alertas de proximidade.
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;
  const TOTAL = 75;

  const DRAW_ANIM_MS = 640;    // duração da animação da urna
  const SPEECH_TIMEOUT = 45000;

  function emptyState() {
    return {
      id: B.uid('game'),
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      status: 'idle',          // idle | running | paused | bingo | finished
      autoRun: false,
      history: [],             // [{ num, letter, at, order }]
      lastBall: null,
      winners: [],             // ganhadores da bola atual/partida
      bigStone: null,          // { candidates:[], winnerId, winnerName, at, announced }
      alertLog: []
    };
  }

  const listeners = Object.create(null);

  const Engine = {
    state: emptyState(),
    _drawing: false,
    _token: 0,
    _tickTimer: null,
    _countdownEnd: 0,
    _countdownTotal: 0,
    _alertLevels: new Map(),
    _lastDrawnSet: new Set(),

    /* ---------------- eventos ---------------- */
    on(ev, fn) {
      (listeners[ev] || (listeners[ev] = new Set())).add(fn);
      return () => { if (listeners[ev]) listeners[ev].delete(fn); };
    },

    emit(ev, payload) {
      const set = listeners[ev];
      if (!set) return;
      set.forEach((fn) => {
        try { fn(payload); } catch (e) { console.error(`[engine:${ev}]`, e); }
      });
    },

    /* ---------------- estado derivado ---------------- */
    drawnNumbers() { return this.state.history.map((h) => h.num); },
    drawnSet() { return new Set(this.drawnNumbers()); },
    remaining() {
      const drawn = this.drawnSet();
      const out = [];
      for (let n = 1; n <= TOTAL; n++) if (!drawn.has(n)) out.push(n);
      return out;
    },
    remainingCount() { return TOTAL - this.state.history.length; },
    percent() { return Math.round((this.state.history.length / TOTAL) * 100); },
    lastBall() { return this.state.lastBall; },
    isRunning() { return this.state.status === 'running'; },
    isPaused() { return this.state.status === 'paused'; },
    isActive() { return this.state.status === 'running' || this.state.status === 'paused'; },
    hasWinners() { return this.state.winners.length > 0; },

    /* ---------------- persistência ---------------- */
    save() {
      if (global.Settings && !global.Settings.get('autoSave')) return;
      global.Persistence.saveGame(this.state);
    },

    persistNow() {
      global.Persistence.saveGame(this.state);
    },

    /* ---------------- ciclo de vida ---------------- */
    load() {
      const saved = global.Persistence.loadGame();
      if (saved && Array.isArray(saved.history)) {
        this.state = Object.assign(emptyState(), saved);
        this._rebuildAlertLevels();
        return true;
      }
      this.state = emptyState();
      return false;
    },

    restore(state) {
      if (!state || !Array.isArray(state.history)) return false;
      this.cancelCountdown();
      this.state = Object.assign(emptyState(), state);
      if (!Array.isArray(this.state.winners)) this.state.winners = [];
      this._rebuildAlertLevels();
      this.persistNow();
      this.emit('state', this.state);
      this.emit('restored', this.state);
      return true;
    },

    /** Inicia o jogo */
    start(opts) {
      const o = opts || {};
      if (this.state.status === 'finished' || this.state.status === 'bingo') return { ok: false, error: 'Finalize ou crie um novo jogo.' };
      if (this.state.history.length && this.state.status === 'paused') {
        return this.resume();
      }
      if (this.state.status === 'running') return { ok: false, error: 'O jogo já está em andamento.' };

      this.state.status = 'running';
      this.state.startedAt = this.state.startedAt || Date.now();
      this.state.autoRun = o.auto != null ? !!o.auto : !!(global.Settings && global.Settings.get('autoStart'));
      this.save();
      this.emit('state', this.state);
      this.emit('gameStarted', this.state);

      if (this.state.autoRun) {
        // respiro antes da primeira bola
        this.startCountdown(Math.max(1200, Math.min(2600, global.Settings.intervalMs())));
      }
      return { ok: true };
    },

    pause() {
      if (this.state.status !== 'running') return { ok: false, error: 'O jogo não está em andamento.' };
      this.state.status = 'paused';
      this.state.autoRun = false;
      this.cancelCountdown();
      this.save();
      this.emit('state', this.state);
      this.emit('paused', this.state);
      return { ok: true };
    },

    resume() {
      if (this.state.status !== 'paused') return { ok: false, error: 'O jogo não está pausado.' };
      this.state.status = 'running';
      this.state.autoRun = true;
      this.save();
      this.emit('state', this.state);
      this.emit('resumed', this.state);
      if (!this._drawing) {
        this.startCountdown(global.Settings.intervalMs());
      }
      return { ok: true };
    },

    finish() {
      if (this.state.status === 'idle' && !this.state.history.length) {
        return { ok: false, error: 'Nenhuma partida em andamento.' };
      }
      this.cancelCountdown();
      this.state.status = 'finished';
      this.state.autoRun = false;
      this.state.endedAt = Date.now();
      this.persistNow();
      global.Persistence.saveLastGame(this.state);
      this.emit('state', this.state);
      this.emit('finished', this.state);
      return { ok: true };
    },

    /** Arquiva a partida atual e começa um jogo limpo (mantém cadastro) */
    newGame() {
      this.cancelCountdown();
      this._token++;
      this._drawing = false;
      if (this.state.history.length || this.state.winners.length) {
        this.state.endedAt = this.state.endedAt || Date.now();
        this.persistNow();
        global.Persistence.saveLastGame(this.state);
      }
      this.state = emptyState();
      this._alertLevels.clear();
      this._lastDrawnSet = new Set();
      this.persistNow();
      this.emit('state', this.state);
      this.emit('newGame', this.state);
      return { ok: true };
    },

    /* ---------------- contagem regressiva ---------------- */
    startCountdown(ms) {
      this.cancelCountdown();
      const total = Math.max(300, ms || 0);
      this._countdownTotal = total;
      this._countdownEnd = Date.now() + total;
      this.emit('countdown', { active: true, remaining: total, total });

      this._tickTimer = setInterval(() => {
        const remaining = Math.max(0, this._countdownEnd - Date.now());
        this.emit('tick', { remaining, total: this._countdownTotal });
        if (remaining <= 0) {
          this.cancelCountdown();
          if (this._drawing) {
            // contagem venceu durante um sorteio/narração: adia o próximo
            this._nextPending = true;
            return;
          }
          this.drawBall({ auto: true });
        }
      }, 100);
    },

    cancelCountdown() {
      if (this._tickTimer) {
        clearInterval(this._tickTimer);
        this._tickTimer = null;
        this.emit('countdown', { active: false });
      }
    },

    countdownActive() { return !!this._tickTimer; },

    /** Restante em ms (0 se inativo) */
    countdownRemaining() {
      if (!this._tickTimer) return 0;
      return Math.max(0, this._countdownEnd - Date.now());
    },

    /* ---------------- sorteio ---------------- */
    /**
     * Sorteia uma bola.
     * @param {{manual?:boolean, auto?:boolean, confirmed?:boolean}} opts
     */
    async drawBall(opts) {
      const o = opts || {};

      if (this._drawing) return { ok: false, error: 'Sorteio em andamento.' };
      if (this.state.status === 'finished') return { ok: false, error: 'Jogo finalizado.' };
      if (this.state.status === 'bingo') return { ok: false, error: 'Bingo já foi cantado. Inicie um novo jogo.' };
      if (this.remainingCount() === 0) return { ok: false, error: 'Todas as 75 bolas já foram sorteadas.' };

      // regra: não começar nova bola durante narração, salvo comando manual confirmado
      if (global.Voice && global.Voice.speaking && !o.confirmed) {
        return { ok: false, needsConfirm: true, error: 'O locutor está falando. Confirme para sortear agora.' };
      }

      if (this.state.status === 'idle') {
        this.state.status = 'running';
        this.state.startedAt = this.state.startedAt || Date.now();
      }
      if (this.state.status === 'paused' && o.auto) return { ok: false, error: 'Jogo pausado.' };

      const token = ++this._token;
      this._drawing = true;
      this.cancelCountdown();

      // 1) sorteia do pool restante
      const pool = this.remaining();
      const num = pool[B.randomInt(pool.length)];
      const letter = B.letterFor(num);

      this.emit('drawing', { num, letter });
      if (global.Sound) global.Sound.play('draw');

      // 2) animação da urna
      await this._wait(DRAW_ANIM_MS);
      if (token !== this._token) { this._drawing = false; return { ok: false, error: 'Cancelado.' }; }

      // 3) revelação (dupla checagem contra repetição)
      const check = this.drawnSet();
      let finalNum = num;
      if (check.has(finalNum)) {
        const left = this.remaining();
        if (!left.length) { this._drawing = false; return { ok: false, error: 'Sem bolas restantes.' }; }
        finalNum = left[B.randomInt(left.length)];
      }

      const entry = {
        num: finalNum,
        letter: B.letterFor(finalNum),
        at: Date.now(),
        order: this.state.history.length + 1
      };
      this.state.history.push(entry);
      this.state.lastBall = entry;
      this.save();

      if (global.Sound) global.Sound.play('reveal');
      this.emit('ball', { ball: entry, state: this.state });
      this.emit('state', this.state);

      // 4) monitoramento + alertas + vencedores
      const analysis = this.analyze();
      this._emitAlertSounds(analysis);
      this.emit('monitor', analysis);

      let winnersNow = analysis.winners;
      if (winnersNow.length) {
        this.state.winners = winnersNow.map((w) => ({
          cardId: w.cardId,
          playerId: w.playerId,
          playerName: w.playerName,
          code: w.code,
          codeSpoken: w.codeSpoken,
          ballNum: finalNum,
          at: Date.now()
        }));
        this.state.status = 'bingo';
        this.state.autoRun = false;
        this.cancelCountdown();
        this.save();
        this.emit('state', this.state);
      }

      // 5) narração da bola (respeitando pausa antes da fala)
      const S = global.Settings.state;
      const speechDelay = Math.max(0, Number(S.speechDelay) || 0);

      // Quando o intervalo NÃO é após a narração, a contagem já corre
      // em paralelo com a fala (mas nunca dispara durante o sorteio).
      if (S.intervalAfterSpeech === false) {
        this._scheduleNext(false);
      }

      await this._wait(speechDelay);
      if (token !== this._token) { this._drawing = false; return { ok: true, ball: entry }; }

      if (global.Voice && S.voiceEnabled && !S.muted) {
        this.emit('speaking', { active: true, num: finalNum });
        await this._sayBall(finalNum);
        this.emit('speaking', { active: false, num: finalNum });
      }
      if (token !== this._token) { this._drawing = false; return { ok: true, ball: entry }; }

      // 6) vitória interrompe o ciclo
      if (winnersNow.length) {
        this._drawing = false;
        this.save();
        await this._announceVictory();
        this.emit('winner', { winners: this.state.winners, ball: entry });
        return { ok: true, ball: entry, winners: this.state.winners };
      }

      this._drawing = false;

      // 7) próximo ciclo
      if (S.intervalAfterSpeech !== false || !this.countdownActive()) {
        this._scheduleNext();
      }

      return { ok: true, ball: entry };
    },

    /** Inicia o próximo ciclo se o jogo estiver no modo automático */
    _scheduleNext() {
      if (this._nextPending) this._nextPending = false;
      if (this.state.status === 'running' && this.state.autoRun) {
        this.startCountdown(global.Settings.intervalMs());
      }
    },

    _wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    },

    _sayBall(num) {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const guard = setTimeout(finish, SPEECH_TIMEOUT);
        try {
          global.Voice.announceBall(num).then(() => {
            clearTimeout(guard);
            finish();
          }).catch(finish);
        } catch (e) {
          clearTimeout(guard);
          finish();
        }
      });
    },

    _announceVictory() {
      return new Promise((resolve) => {
        const S = global.Settings.state;
        if (!global.Voice || !S.voiceEnabled || S.muted) return resolve();
        const text = global.Voice.buildVictoryText(this.state.winners);
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        const guard = setTimeout(finish, SPEECH_TIMEOUT);
        this.emit('speaking', { active: true, victory: true, text });
        global.Voice.say(text).then(() => {
          clearTimeout(guard);
          this.emit('speaking', { active: false, victory: true });
          finish();
        }).catch(() => { clearTimeout(guard); finish(); });
      });
    },

    /** Repete a última chamada sem novo sorteio */
    repeatLast() {
      const last = this.state.lastBall;
      if (!last) return { ok: false, error: 'Nenhuma bola sorteada ainda.' };
      if (global.Voice && !global.Voice.speaking) {
        global.Voice.announceBall(last.num);
      } else if (global.Voice) {
        global.Voice.announceBall(last.num);
      }
      this.emit('repeat', last);
      return { ok: true, ball: last };
    },

    /** Desfaz o último sorteio (chamado após confirmação da UI) */
    undoLast() {
      if (this._drawing) return { ok: false, error: 'Aguarde o sorteio terminar.' };
      if (!this.state.history.length) return { ok: false, error: 'Nada para desfazer.' };

      this.cancelCountdown();
      const removed = this.state.history.pop();
      this.state.lastBall = this.state.history.length
        ? this.state.history[this.state.history.length - 1]
        : null;

      // vencedores daquela bola deixam de valer
      this.state.winners = this.state.winners.filter((w) => w.ballNum !== removed.num);

      if (this.state.status === 'bingo') {
        this.state.status = this.state.winners.length ? 'bingo' : 'paused';
      }
      if (this.state.status === 'finished') this.state.status = 'paused';

      this._rebuildAlertLevels();
      this.persistNow();
      this.emit('undo', { removed, state: this.state });
      this.emit('state', this.state);
      this.emit('monitor', this.analyze());
      return { ok: true, removed };
    },

    /* ---------------- monitoramento ---------------- */
    /**
     * Analisa todas as cartelas em relação às bolas sorteadas.
     * @returns {{alerts:Array, ranking:Array, winners:Array, counts:object}}
     */
    analyze() {
      const drawn = this.drawnSet();
      const cards = global.CardManager ? global.CardManager.all() : [];
      const players = global.Players ? global.Players.all() : [];
      const playerMap = new Map(players.map((p) => [p.id, p]));

      const alerts = [];
      const winners = [];
      const counts = { total: cards.length, lvl3: 0, lvl2: 0, lvl1: 0, won: 0, done: 0 };

      cards.forEach((card) => {
        const prog = global.CardManager.progress(card, drawn);
        const player = playerMap.get(card.playerId);
        const info = {
          cardId: card.id,
          code: card.code,
          codeSpoken: spokenCode(card.code),
          playerId: card.playerId,
          playerName: player ? player.name : 'Participante removido',
          total: prog.total,
          hit: prog.hit,
          missing: prog.missing,
          missingNumbers: prog.missingNumbers,
          complete: prog.complete,
          card
        };

        if (prog.complete) {
          counts.won++;
          winners.push(info);
          // uma cartela completa não entra como alerta
          return;
        }
        if (prog.hit === 0) return;

        if (prog.missing <= 3) {
          if (prog.missing === 3) counts.lvl3++;
          if (prog.missing === 2) counts.lvl2++;
          if (prog.missing === 1) counts.lvl1++;
          alerts.push(Object.assign({}, info, { level: prog.missing }));
        }
      });

      alerts.sort((a, b) => a.missing - b.missing || b.hit - a.hit || a.code.localeCompare(b.code));

      const ranking = alerts.slice(0, 12);

      return {
        alerts,
        ranking,
        winners,
        counts: Object.assign(counts, { drawn: this.state.history.length })
      };
    },

    /** Nível de alerta atual de uma cartela (0 = nenhum) */
    _levelOf(missing) {
      if (missing === 1) return 1;
      if (missing === 2) return 2;
      if (missing === 3) return 3;
      return 0;
    },

    _rebuildAlertLevels() {
      this._alertLevels.clear();
      const a = this.analyze();
      a.alerts.forEach((al) => this._alertLevels.set(al.cardId, al.level));
    },

    /** Toca som apenas quando a cartela piora de nível */
    _emitAlertSounds(analysis) {
      const S = global.Settings.state;
      if (!S.sfxEnabled || !S.highlightImminent) {
        // ainda atualiza o mapa para não disparar atrasado
      }
      let worstNew = 0;
      const fresh = [];
      analysis.alerts.forEach((al) => {
        const prev = this._alertLevels.get(al.cardId) || 0;
        if (al.level < prev || (prev === 0 && al.level > 0)) {
          fresh.push(al);
          if (al.level < worstNew || worstNew === 0) worstNew = al.level;
        }
        this._alertLevels.set(al.cardId, al.level);
      });

      // limpa níveis de cartelas que saíram do alerta
      const activeIds = new Set(analysis.alerts.map((a) => a.cardId));
      Array.from(this._alertLevels.keys()).forEach((id) => {
        if (!activeIds.has(id)) this._alertLevels.delete(id);
      });

      if (fresh.length && global.Sound && S.sfxEnabled) {
        global.Sound.play(worstNew === 1 ? 'alertCritical' : 'alert');
      }
      if (fresh.length) this.emit('alertsNew', fresh);
    },

    /* ---------------- pedra maior ---------------- */
    setBigStone(result) {
      this.state.bigStone = result;
      this.save();
      this.emit('bigStone', result);
    },

    /* ---------------- resumo/estatísticas ---------------- */
    stats() {
      const a = this.analyze();
      const elapsed = this.state.startedAt
        ? (this.state.endedAt || Date.now()) - this.state.startedAt
        : 0;
      return {
        drawn: this.state.history.length,
        remaining: this.remainingCount(),
        percent: this.percent(),
        players: global.Players ? global.Players.count() : 0,
        cards: a.counts.total,
        lvl3: a.counts.lvl3,
        lvl2: a.counts.lvl2,
        lvl1: a.counts.lvl1,
        won: a.counts.won,
        elapsed
      };
    }
  };

  /** Converte "C001" em "zero zero um" para fala natural */
  function spokenCode(code) {
    const m = String(code || '').match(/^([A-Za-z]*)(\d+)$/);
    if (!m) return String(code || '');
    const digits = m[2];
    const words = { '0': 'zero', '1': 'um', '2': 'dois', '3': 'três', '4': 'quatro', '5': 'cinco', '6': 'seis', '7': 'sete', '8': 'oito', '9': 'nove' };
    return digits.split('').map((d) => words[d] || d).join(' ');
  }

  global.BingoEngine = Engine;
  global.spokenCardCode = spokenCode;
})(window);

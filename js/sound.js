/* ============================================================
   sound.js — SoundManager
   Efeitos sonoros sintetizados com Web Audio API (sem arquivos).
   Nunca sobrepõe a narração: usa volume baixo e envelopes curtos.
   ============================================================ */
(function (global) {
  'use strict';

  let ctx = null;
  let master = null;
  let unlocked = false;

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
    }
    return ctx;
  }

  /** Deve ser chamado dentro de um gesto do usuário */
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    unlocked = true;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /** Tom simples com envelope ADSR curto */
  function tone(opt) {
    const c = ensureCtx();
    if (!c) return;
    const {
      freq = 440, type = 'sine', dur = 0.18, gain = 0.4,
      attack = 0.006, decay = null, slideTo = null, delay = 0, detune = 0
    } = opt || {};

    const t0 = now() + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    if (detune) osc.detune.setValueAtTime(detune, t0);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack);
    const dec = decay == null ? dur : decay;
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(dur, attack + dec));

    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  function noiseBurst(opt) {
    const c = ensureCtx();
    if (!c) return;
    const { dur = 0.14, gain = 0.16, hp = 900, delay = 0 } = opt || {};
    const t0 = now() + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * env * env;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hp;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t0);
  }

  /* ---------- presets ---------- */
  const PRESETS = {
    /** início do jogo: fanfarra ascendente */
    start() {
      [[392, 0], [523.25, .1], [659.25, .2], [783.99, .3]].forEach(([f, d]) => {
        tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.3, delay: d });
      });
      tone({ freq: 1046.5, type: 'sine', dur: 0.5, gain: 0.24, delay: 0.42 });
    },

    /** bolinha girando na urna */
    draw() {
      noiseBurst({ dur: 0.08, gain: 0.12, hp: 1400 });
      noiseBurst({ dur: 0.07, gain: 0.1, hp: 1800, delay: 0.11 });
      noiseBurst({ dur: 0.06, gain: 0.085, hp: 2200, delay: 0.21 });
      tone({ freq: 180, type: 'sine', dur: 0.3, gain: 0.1, slideTo: 320 });
    },

    /** revelação da bola */
    reveal() {
      tone({ freq: 880, type: 'sine', dur: 0.12, gain: 0.28 });
      tone({ freq: 1320, type: 'sine', dur: 0.18, gain: 0.14, delay: 0.04 });
      tone({ freq: 660, type: 'triangle', dur: 0.24, gain: 0.13, delay: 0.02 });
    },

    /** alerta de proximidade */
    alert() {
      tone({ freq: 880, type: 'square', dur: 0.1, gain: 0.1 });
      tone({ freq: 1108, type: 'square', dur: 0.1, gain: 0.1, delay: 0.13 });
      tone({ freq: 880, type: 'square', dur: 0.13, gain: 0.09, delay: 0.27 });
    },

    /** alerta crítico: 1 número */
    alertCritical() {
      [0, .16, .32].forEach((d) => {
        tone({ freq: 1244, type: 'square', dur: 0.1, gain: 0.11, delay: d });
        tone({ freq: 932, type: 'square', dur: 0.1, gain: 0.09, delay: d + 0.08 });
      });
    },

    /** pausa */
    pause() {
      tone({ freq: 523, type: 'triangle', dur: 0.12, gain: 0.16 });
      tone({ freq: 392, type: 'triangle', dur: 0.18, gain: 0.14, delay: 0.1 });
    },

    /** clique/confirmar */
    click() {
      tone({ freq: 660, type: 'sine', dur: 0.05, gain: 0.1 });
    },

    /** bingo / vitória */
    bingo() {
      const seq = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
      seq.forEach((f, i) => {
        tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.26, delay: i * 0.11 });
      });
      tone({ freq: 1567.98, type: 'sine', dur: 0.9, gain: 0.18, delay: seq.length * 0.11 });
      tone({ freq: 523.25, type: 'sine', dur: 1.0, gain: 0.1, delay: seq.length * 0.11 });
    },

    /** pedra maior girando */
    stone() {
      for (let i = 0; i < 6; i++) {
        noiseBurst({ dur: 0.05, gain: 0.09, hp: 1600 + i * 300, delay: i * 0.1 });
        tone({ freq: 300 + i * 60, type: 'sine', dur: 0.08, gain: 0.07, delay: i * 0.1 });
      }
    },

    /** ganhador da pedra maior */
    stoneWin() {
      [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => {
        tone({ freq: f, type: 'sine', dur: 0.28, gain: 0.24, delay: i * 0.12 });
      });
    }
  };

  const Sound = {
    unlock,

    isAvailable() { return !!ensureCtx(); },

    setVolume(v) {
      const c = ensureCtx();
      if (!c) return;
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), now(), 0.02);
    },

    /**
     * Reproduz um preset respeitando as configurações.
     * @param {string} name
     * @param {{force?: boolean}} opts
     */
    play(name, opts) {
      const o = opts || {};
      const S = global.Settings ? global.Settings.state : { sfxEnabled: true, sfxVolume: 0.45 };
      if (!o.force && !S.sfxEnabled) return;
      if (!PRESETS[name]) return;
      const c = ensureCtx();
      if (!c) return;
      if (c.state === 'suspended') {
        // não bloqueia: só retoma em gesto; se bloqueado, ignora silenciosamente
        c.resume().catch(() => {});
      }
      if (!unlocked && c.state !== 'running') return;
      this.setVolume(S.sfxVolume);
      try { PRESETS[name](); } catch (e) { /* áudio nunca deve quebrar o app */ }
    }
  };

  global.Sound = Sound;
})(window);

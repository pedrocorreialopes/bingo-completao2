/* ============================================================
   settings.js — SettingsManager
   Configurações persistentes do locutor, ritmo e efeitos.
   ============================================================ */
(function (global) {
  'use strict';

  const DEFAULTS = {
    /* locutor */
    voiceEnabled: true,
    voiceURI: '',            // '' = automático (melhor voz pt-BR)
    rate: 0.95,
    pitch: 1.0,
    volume: 1.0,
    speechDelay: 700,        // ms entre revelação e fala
    repeatLetter: false,
    announcePrefix: '',
    victoryTemplate: 'Temos bingo! Parabéns, {nome}, cartela número {cartela}!',

    /* ritmo */
    interval: 10000,
    customInterval: 12,
    intervalAfterSpeech: true,
    autoStart: true,
    highlightImminent: true,

    /* efeitos */
    sfxEnabled: true,
    sfxVolume: 0.45,

    /* sistema */
    stoneAuto: true,
    autoSave: true,
    muted: false
  };

  const CLAMP_RULES = {
    rate: [0.6, 1.4],
    pitch: [0.6, 1.6],
    volume: [0, 1],
    sfxVolume: [0, 1],
    speechDelay: [0, 2500],
    interval: [3000, 300000],
    customInterval: [3, 300]
  };

  function normalize(input) {
    const out = Object.assign({}, DEFAULTS);
    if (!input || typeof input !== 'object') return out;

    Object.keys(DEFAULTS).forEach((k) => {
      const def = DEFAULTS[k];
      const val = input[k];
      if (val === undefined || val === null) return;

      if (typeof def === 'boolean') {
        out[k] = !!val;
      } else if (typeof def === 'number') {
        // interval aceita a sentinela 'custom' (tempo personalizado)
        if (k === 'interval' && val === 'custom') {
          out.interval = 'custom';
          return;
        }
        const n = Number(val);
        if (!Number.isFinite(n)) return;
        const rule = CLAMP_RULES[k];
        out[k] = rule ? Math.min(rule[1], Math.max(rule[0], n)) : n;
      } else {
        out[k] = String(val);
      }
    });

    // interval sempre múltiplo do select, 'custom' ou >= 3000
    if (out.interval !== 'custom') {
      if (!Number.isFinite(out.interval) || out.interval < 3000) out.interval = DEFAULTS.interval;
    }
    // ao usar 'custom', garante um valor válido em segundos
    if (out.interval === 'custom') {
      const secs = Number(out.customInterval);
      out.customInterval = Number.isFinite(secs) && secs >= 3 && secs <= 300 ? secs : DEFAULTS.customInterval;
    }
    return out;
  }

  const listeners = new Set();

  const Settings = {
    DEFAULTS,
    state: normalize(null),

    load() {
      const stored = global.Persistence ? global.Persistence.loadSettings() : null;
      this.state = normalize(stored);
      return this.state;
    },

    save() {
      if (global.Persistence) global.Persistence.saveSettings(this.state);
      this.emit();
      return this.state;
    },

    /** Atualiza uma ou várias chaves, normaliza, salva e notifica */
    set(patch) {
      this.state = normalize(Object.assign({}, this.state, patch));
      if (global.Persistence) global.Persistence.saveSettings(this.state);
      this.emit();
      return this.state;
    },

    get(key) { return this.state[key]; },

    reset() {
      this.state = normalize(null);
      if (global.Persistence) global.Persistence.saveSettings(this.state);
      this.emit();
      return this.state;
    },

    /** Tempo efetivo de intervalo em ms */
    intervalMs() {
      return this.state.interval === 'custom'
        ? Math.round(this.state.customInterval * 1000)
        : this.state.interval;
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    emit() {
      listeners.forEach((fn) => {
        try { fn(this.state); } catch (e) { console.error('[settings] listener', e); }
      });
    }
  };

  global.Settings = Settings;
})(window);

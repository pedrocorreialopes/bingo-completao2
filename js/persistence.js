/* ============================================================
   persistence.js — PersistenceManager
   Armazenamento local (localStorage) com backup automático,
   recuperação de partida e proteção contra perda de dados.
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;

  const NS = 'bingo75pro';
  const KEYS = {
    settings: `${NS}:settings:v1`,
    players: `${NS}:players:v1`,
    cards: `${NS}:cards:v1`,
    game: `${NS}:game:v1`,
    lastGame: `${NS}:lastGame:v1`,
    backup: `${NS}:autobackup:v1`,
    meta: `${NS}:meta:v1`
  };

  const SCHEMA_VERSION = 1;

  /* ---------- camada bruta com fallback em memória ---------- */
  let memoryStore = Object.create(null);
  let storageOk = true;

  function testStorage() {
    try {
      const k = `${NS}:__test`;
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }
  storageOk = testStorage();

  function readRaw(key) {
    if (storageOk) {
      try {
        const v = global.localStorage.getItem(key);
        return v == null ? null : v;
      } catch (e) { storageOk = false; }
    }
    return key in memoryStore ? memoryStore[key] : null;
  }

  function writeRaw(key, value) {
    if (storageOk) {
      try {
        global.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        // cota excedida → tenta liberar backups antigos antes de desistir
        try {
          global.localStorage.removeItem(KEYS.backup);
          global.localStorage.setItem(key, value);
          return true;
        } catch (e2) {
          storageOk = false;
        }
      }
    }
    memoryStore[key] = value;
    return false;
  }

  function readJson(key, fallback) {
    const raw = readRaw(key);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) {
      // dado corrompido: preserva cópia e devolve fallback
      writeRaw(`${key}:corrupt:${Date.now()}`, raw);
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      return writeRaw(key, JSON.stringify(value));
    } catch (e) {
      return false;
    }
  }

  /* ---------- API ---------- */

  const Persistence = {
    KEYS,
    SCHEMA_VERSION,

    get storageAvailable() { return storageOk; },

    /* --- configurações --- */
    loadSettings() { return readJson(KEYS.settings, null); },
    saveSettings(s) { return writeJson(KEYS.settings, s); },

    /* --- participantes --- */
    loadPlayers() {
      const list = readJson(KEYS.players, []);
      return Array.isArray(list) ? list : [];
    },
    savePlayers(list) { return writeJson(KEYS.players, Array.isArray(list) ? list : []); },

    /* --- cartelas --- */
    loadCards() {
      const list = readJson(KEYS.cards, []);
      return Array.isArray(list) ? list : [];
    },
    saveCards(list) { return writeJson(KEYS.cards, Array.isArray(list) ? list : []); },

    /* --- partida atual --- */
    loadGame() { return readJson(KEYS.game, null); },
    saveGame(state) {
      const ok = writeJson(KEYS.game, state);
      if (state && state.history && state.history.length) {
        writeJson(KEYS.backup, { at: Date.now(), state });
      }
      return ok;
    },
    clearGame() {
      if (storageOk) {
        try { global.localStorage.removeItem(KEYS.game); } catch (e) { /* noop */ }
      }
      delete memoryStore[KEYS.game];
    },

    /* --- última partida finalizada --- */
    loadLastGame() { return readJson(KEYS.lastGame, null); },
    saveLastGame(state) { return writeJson(KEYS.lastGame, state); },

    /* --- backup automático --- */
    loadAutoBackup() {
      const b = readJson(KEYS.backup, null);
      if (b && b.state) return b;
      return null;
    },

    clearAutoBackup() {
      if (storageOk) {
        try { global.localStorage.removeItem(KEYS.backup); } catch (e) { /* noop */ }
      }
      delete memoryStore[KEYS.backup];
    },

    /* --- meta --- */
    loadMeta() { return readJson(KEYS.meta, { createdAt: Date.now() }); },
    saveMeta(m) { return writeJson(KEYS.meta, m); },

    /* --- export / import completos --- */
    exportAll() {
      return {
        app: 'Bingo 75 Pro',
        schema: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: readJson(KEYS.settings, null),
        players: readJson(KEYS.players, []),
        cards: readJson(KEYS.cards, []),
        game: readJson(KEYS.game, null),
        lastGame: readJson(KEYS.lastGame, null)
      };
    },

    /**
     * Importa um backup. Guarda o estado anterior numa cópia de
     * segurança para possibilitar desfazer.
     */
    importAll(data) {
      if (!data || typeof data !== 'object') {
        return { ok: false, error: 'Arquivo inválido.' };
      }
      const hasAny = ['settings', 'players', 'cards', 'game', 'lastGame']
        .some((k) => k in data);
      if (!hasAny) return { ok: false, error: 'O arquivo não contém dados do Bingo 75 Pro.' };

      // snapshot de segurança do estado atual
      const safety = this.exportAll();
      writeJson(`${NS}:preimport:${Date.now()}`, safety);

      if (data.settings && typeof data.settings === 'object') writeJson(KEYS.settings, data.settings);
      if (Array.isArray(data.players)) writeJson(KEYS.players, data.players);
      if (Array.isArray(data.cards)) writeJson(KEYS.cards, data.cards);
      if (data.game && typeof data.game === 'object') writeJson(KEYS.game, data.game);
      if (data.lastGame && typeof data.lastGame === 'object') writeJson(KEYS.lastGame, data.lastGame);

      return {
        ok: true,
        players: Array.isArray(data.players) ? data.players.length : 0,
        cards: Array.isArray(data.cards) ? data.cards.length : 0
      };
    },

    /**
     * Limpa apenas o cadastro (participantes e cartelas).
     * Nunca toca em partida atual, última partida ou backups.
     */
    clearRegistry() {
      this.savePlayers([]);
      this.saveCards([]);
    },

    /** Diagnóstico de espaço usado */
    usage() {
      let total = 0;
      Object.values(KEYS).forEach((k) => {
        const raw = readRaw(k);
        if (raw) total += raw.length;
      });
      return total;
    }
  };

  global.Persistence = Persistence;
})(window);

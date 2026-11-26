/* ============================================================
   players.js — PlayerManager
   Cadastro de participantes com busca, importação e exportação.
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;

  let players = [];
  let listeners = new Set();

  function normalizePlayer(p, index) {
    return {
      id: p.id || B.uid('plr'),
      name: String(p.name || '').trim().slice(0, 60),
      code: p.code || B.padCode(index + 1, 3),
      phone: String(p.phone || '').trim().slice(0, 24),
      createdAt: p.createdAt || Date.now()
    };
  }

  const Players = {
    load() {
      const raw = global.Persistence.loadPlayers();
      players = (Array.isArray(raw) ? raw : [])
        .filter((p) => p && p.name)
        .map(normalizePlayer);
      return players;
    },

    all() { return players.slice(); },

    byId(id) { return players.find((p) => p.id === id) || null; },

    count() { return players.length; },

    add(data) {
      const name = String(data.name || '').trim();
      if (!name) return { ok: false, error: 'Informe o nome do participante.' };
      if (name.length > 60) return { ok: false, error: 'Nome muito longo (máx. 60).' };

      const dup = players.some((p) => p.name.toLowerCase() === name.toLowerCase());
      if (dup) return { ok: false, error: `Já existe um participante chamado "${name}".` };

      const nextIndex = players.reduce((max, p) => {
        const n = parseInt(p.code, 10);
        return Number.isFinite(n) && n > max ? n : max;
      }, 0);

      const player = normalizePlayer({
        id: B.uid('plr'),
        name,
        phone: String(data.phone || '').trim(),
        code: B.padCode(nextIndex + 1, 3),
        createdAt: Date.now()
      }, players.length);

      players.push(player);
      this.save();
      return { ok: true, player };
    },

    update(id, patch) {
      const p = players.find((x) => x.id === id);
      if (!p) return { ok: false, error: 'Participante não encontrado.' };
      const name = patch.name != null ? String(patch.name).trim() : p.name;
      if (!name) return { ok: false, error: 'Informe o nome do participante.' };
      const dup = players.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase());
      if (dup) return { ok: false, error: `Já existe um participante chamado "${name}".` };
      p.name = name.slice(0, 60);
      if (patch.phone != null) p.phone = String(patch.phone).trim().slice(0, 24);
      this.save();
      return { ok: true, player: p };
    },

    remove(id) {
      const idx = players.findIndex((p) => p.id === id);
      if (idx < 0) return { ok: false, error: 'Participante não encontrado.' };
      const [removed] = players.splice(idx, 1);
      this.save();
      return { ok: true, player: removed };
    },

    search(term) {
      const q = String(term || '').trim().toLowerCase();
      if (!q) return this.all();
      return players.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.includes(q) ||
        (p.phone || '').includes(q)
      );
    },

    save() {
      global.Persistence.savePlayers(players);
      listeners.forEach((fn) => { try { fn(players); } catch (e) { console.error(e); } });
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Participantes que possuem ao menos uma cartela */
    withCards(cards) {
      const ids = new Set(cards.map((c) => c.playerId));
      return players.filter((p) => ids.has(p.id));
    },

    exportCsv() {
      const rows = [['codigo', 'nome', 'telefone']];
      players.forEach((p) => rows.push([p.code, p.name, p.phone || '']));
      B.downloadCsv(`participantes-bingo75-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    },

    /**
     * Importa CSV de participantes.
     * Cabeçalhos aceitos: nome|name, telefone|phone|fone|celular, codigo|code|id
     */
    importCsv(text) {
      const rows = B.parseCsv(text);
      if (!rows.length) return { ok: false, error: 'Arquivo vazio.' };

      let dataRows = rows;
      let map = { name: 1, phone: 2, code: 0 };

      const header = rows[0].map((c) => String(c).trim().toLowerCase());
      const looksLikeHeader = header.some((h) =>
        ['nome', 'name', 'participante', 'telefone', 'phone', 'celular', 'fone', 'codigo', 'código', 'code'].includes(h));

      if (looksLikeHeader) {
        dataRows = rows.slice(1);
        const find = (...keys) => header.findIndex((h) => keys.includes(h));
        const nameIdx = find('nome', 'name', 'participante', 'participant');
        const phoneIdx = find('telefone', 'phone', 'celular', 'fone', 'whatsapp');
        const codeIdx = find('codigo', 'código', 'code', 'id');
        map = {
          name: nameIdx >= 0 ? nameIdx : 0,
          phone: phoneIdx,
          code: codeIdx
        };
      }

      let added = 0, skipped = 0;
      const errors = [];

      dataRows.forEach((row, i) => {
        let name = String(row[map.name] || '').trim();
        let phone = map.phone >= 0 && map.phone != null ? String(row[map.phone] || '').trim() : '';
        let code = map.code >= 0 && map.code != null ? String(row[map.code] || '').trim() : '';

        // heurística: se a primeira coluna for numérica e a segunda textual,
        // provavelmente é "codigo;nome"
        if (!name && row[0] != null) name = String(row[0]).trim();

        if (!name) { skipped++; return; }
        if (name.length > 60) name = name.slice(0, 60);

        const existing = players.find((p) => p.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          if (phone && !existing.phone) existing.phone = phone;
          skipped++;
          return;
        }

        const nextIndex = players.reduce((max, p) => {
          const n = parseInt(p.code, 10);
          return Number.isFinite(n) && n > max ? n : max;
        }, 0);

        players.push({
          id: B.uid('plr'),
          name,
          phone,
          code: code && /^[A-Za-z0-9-]{1,12}$/.test(code) ? code : B.padCode(nextIndex + 1, 3),
          createdAt: Date.now()
        });
        added++;
        if (i > 5000) errors.push('limite de linhas atingido');
      });

      this.save();
      return { ok: true, added, skipped };
    }
  };

  global.Players = Players;
})(window);

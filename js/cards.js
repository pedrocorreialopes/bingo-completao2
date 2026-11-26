/* ============================================================
   cards.js — CardManager
   Geração, validação, importação e exportação de cartelas 75.
   Estrutura da cartela: grid de 25 posições (row-major), índice 12
   é o centro LIVRE (valor 0).
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;
  const FREE_INDEX = 12;

  let cards = [];
  let listeners = new Set();

  /** Índice da coluna (0..4) de uma posição row-major */
  const colOf = (i) => i % 5;
  const LETTER_AT = (i) => B.LETTERS[colOf(i)];

  /* ---------------- validação ---------------- */

  /**
   * Valida um grid de 25 posições.
   * @returns {{ok:boolean, error?:string}}
   */
  function validateGrid(grid) {
    if (!Array.isArray(grid) || grid.length !== 25) {
      return { ok: false, error: 'A cartela precisa de 25 posições.' };
    }
    const seen = new Set();

    for (let i = 0; i < 25; i++) {
      const col = colOf(i);
      const L = B.LETTERS[col];
      const [min, max] = B.RANGES[L];
      const v = grid[i];

      if (i === FREE_INDEX) {
        if (v !== 0 && v != null && v !== '') {
          // centro pode vir preenchido; aceitamos e normalizamos para 0
        }
        continue;
      }

      if (!Number.isInteger(v)) {
        return { ok: false, error: `Posição ${i + 1} (coluna ${L}) deve ser um número inteiro.` };
      }
      if (v < min || v > max) {
        return { ok: false, error: `O número ${v} não pertence à coluna ${L} (${min}–${max}).` };
      }
      if (seen.has(v)) {
        return { ok: false, error: `O número ${v} está repetido na cartela.` };
      }
      seen.add(v);
    }
    if (seen.size !== 24) {
      return { ok: false, error: 'A cartela deve conter 24 números distintos além do centro livre.' };
    }
    return { ok: true };
  }

  /** Gera um grid 5x5 válido e aleatório */
  function generateGrid() {
    const grid = new Array(25).fill(0);
    B.LETTERS.forEach((L, col) => {
      const [min, max] = B.RANGES[L];
      const pool = [];
      for (let n = min; n <= max; n++) pool.push(n);
      const picked = B.shuffle(pool).slice(0, 5);
      for (let row = 0; row < 5; row++) {
        grid[row * 5 + col] = picked[row];
      }
    });
    grid[FREE_INDEX] = 0;
    return grid;
  }

  function numbersOf(card) {
    return card.grid.filter((v, i) => i !== FREE_INDEX && v > 0);
  }

  function normalizeCard(raw, index) {
    const grid = Array.isArray(raw.grid) ? raw.grid.map((v) => (v === '' || v == null ? 0 : Number(v))) : generateGrid();
    grid[FREE_INDEX] = 0;
    return {
      id: raw.id || B.uid('crd'),
      code: String(raw.code || B.padCode(index + 1, 4)),
      playerId: raw.playerId || '',
      grid,
      serial: raw.serial || '',
      createdAt: raw.createdAt || Date.now()
    };
  }

  function nextCode(prefix) {
    const p = (prefix || 'C').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'C';
    let max = 0;
    cards.forEach((c) => {
      const m = String(c.code).match(/^([A-Z]*)(\d+)$/);
      if (m && m[1] === p) {
        const n = parseInt(m[2], 10);
        if (Number.isFinite(n) && n > max) max = n;
      }
    });
    // também considera códigos puramente numéricos já existentes
    if (max === 0) {
      cards.forEach((c) => {
        const n = parseInt(c.code, 10);
        if (!/^[A-Z]/.test(String(c.code)) && Number.isFinite(n) && n > max) max = n;
      });
    }
    return p + B.padCode(max + 1, 3);
  }

  const Cards = {
    FREE_INDEX,
    LETTER_AT,
    colOf,
    validateGrid,
    generateGrid,
    numbersOf,

    load() {
      const raw = global.Persistence.loadCards();
      cards = (Array.isArray(raw) ? raw : [])
        .filter((c) => c && Array.isArray(c.grid))
        .map(normalizeCard);
      return cards;
    },

    all() { return cards.slice(); },
    byId(id) { return cards.find((c) => c.id === id) || null; },
    count() { return cards.length; },

    byPlayer(playerId) { return cards.filter((c) => c.playerId === playerId); },

    save() {
      global.Persistence.saveCards(cards);
      listeners.forEach((fn) => { try { fn(cards); } catch (e) { console.error(e); } });
    },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /**
     * Gera N cartelas para um participante.
     */
    generate(playerId, qty, prefix) {
      if (!playerId) return { ok: false, error: 'Selecione um participante.' };
      const n = B.clamp(parseInt(qty, 10) || 1, 1, 100);
      const created = [];
      const signatures = new Set(cards.map((c) => numbersOf(c).slice().sort((a, b) => a - b).join(',')));

      let guard = 0;
      while (created.length < n && guard < n * 40) {
        guard++;
        const grid = generateGrid();
        const sig = grid.filter((v, i) => i !== FREE_INDEX).slice().sort((a, b) => a - b).join(',');
        if (signatures.has(sig)) continue;
        signatures.add(sig);
        const card = {
          id: B.uid('crd'),
          code: nextCode(prefix),
          playerId,
          grid,
          serial: prefix || 'C',
          createdAt: Date.now()
        };
        // insere imediatamente para que nextCode() continue a sequência
        cards.push(card);
        created.push(card);
      }
      this.save();
      return { ok: true, cards: created, added: created.length };
    },

    /** Adiciona uma cartela manual (grid validado) */
    addManual(playerId, grid, prefix) {
      const normalized = grid.slice();
      normalized[FREE_INDEX] = 0;
      const v = validateGrid(normalized);
      if (!v.ok) return { ok: false, error: v.error };
      if (!playerId) return { ok: false, error: 'Selecione um participante.' };

      const sig = numbersOf({ grid: normalized }).slice().sort((a, b) => a - b).join(',');
      const dup = cards.find((c) => numbersOf(c).slice().sort((a, b) => a - b).join(',') === sig);
      if (dup) return { ok: false, error: `Estes números já pertencem à cartela ${dup.code}.` };

      const card = {
        id: B.uid('crd'),
        code: nextCode(prefix),
        playerId,
        grid: normalized,
        serial: prefix || 'C',
        createdAt: Date.now()
      };
      cards.push(card);
      this.save();
      return { ok: true, card };
    },

    update(id, patch) {
      const c = cards.find((x) => x.id === id);
      if (!c) return { ok: false, error: 'Cartela não encontrada.' };
      if (patch.grid) {
        const g = patch.grid.slice();
        g[FREE_INDEX] = 0;
        const v = validateGrid(g);
        if (!v.ok) return { ok: false, error: v.error };
        c.grid = g;
      }
      if (patch.playerId) c.playerId = patch.playerId;
      if (patch.code) c.code = String(patch.code).slice(0, 12);
      this.save();
      return { ok: true, card: c };
    },

    remove(id) {
      const idx = cards.findIndex((c) => c.id === id);
      if (idx < 0) return { ok: false, error: 'Cartela não encontrada.' };
      cards.splice(idx, 1);
      this.save();
      return { ok: true };
    },

    removeByPlayer(playerId) {
      const before = cards.length;
      cards = cards.filter((c) => c.playerId !== playerId);
      this.save();
      return before - cards.length;
    },

    clearAll() {
      const n = cards.length;
      cards = [];
      this.save();
      return n;
    },

    search(term, playerId) {
      const q = String(term || '').trim().toLowerCase();
      let list = playerId ? cards.filter((c) => c.playerId === playerId) : cards.slice();
      if (q) {
        list = list.filter((c) => {
          const nums = numbersOf(c).join(' ');
          return c.code.toLowerCase().includes(q) || nums.includes(q);
        });
      }
      return list;
    },

    /* ---------- CSV ---------- */
    exportCsv() {
      const header = ['cartela', 'participante', 'numeros'];
      const rows = [header];
      cards.forEach((c) => {
        const p = global.Players.byId(c.playerId);
        const nums = c.grid.map((v, i) => (i === FREE_INDEX ? 'LIVRE' : v)).join(' ');
        rows.push([c.code, p ? p.name : '', nums]);
      });
      B.downloadCsv(`cartelas-bingo75-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    },

    /**
     * Importa cartelas. Aceita:
     *   cartela;participante;numeros  (25 valores row-major, centro "LIVRE"/0/"-" )
     *   participante;numeros          (sem código)
     *   numeros                       (só os 24 números → gera grid nas colunas corretas)
     */
    importCsv(text) {
      const rows = B.parseCsv(text);
      if (!rows.length) return { ok: false, error: 'Arquivo vazio.' };

      const header = rows[0].map((h) => String(h).trim().toLowerCase());
      const hasHeader = header.some((h) => ['cartela', 'card', 'codigo', 'código', 'code', 'participante', 'nome', 'name', 'numeros', 'números', 'numbers'].includes(h));

      const find = (...keys) => header.findIndex((h) => keys.includes(h));
      let idxCode = hasHeader ? find('cartela', 'card', 'codigo', 'código', 'code') : -1;
      let idxPlayer = hasHeader ? find('participante', 'nome', 'name', 'player') : -1;
      let idxNums = hasHeader ? find('numeros', 'números', 'numbers', 'dezenas') : -1;

      const dataRows = hasHeader ? rows.slice(1) : rows;

      // modo "só números": 1 coluna com 24/25 valores
      if (idxNums < 0) {
        const firstNums = B.parseNumbers(dataRows[0] ? dataRows[0].join(' ') : '');
        if (firstNums.length >= 24 && idxPlayer < 0) {
          idxNums = -2; // indica: concatenar todas as colunas
        } else {
          // heurística por posição
          idxNums = dataRows[0] ? dataRows[0].length - 1 : 0;
          if (idxPlayer < 0) idxPlayer = dataRows[0] && dataRows[0].length >= 3 ? 1 : -1;
        }
      }

      const results = { added: 0, skipped: 0, errors: [] };
      const existingPlayers = global.Players.all();

      dataRows.forEach((row, rowIdx) => {
        const rawNums = idxNums === -2 ? row.join(' ') : String(row[idxNums] == null ? '' : row[idxNums]);
        const nums = B.parseNumbers(rawNums);

        if (nums.length < 24) {
          results.skipped++;
          if (results.errors.length < 6) results.errors.push(`Linha ${rowIdx + 1}: números insuficientes (${nums.length}/24).`);
          return;
        }

        // monta grid 5x5
        let grid;
        if (nums.length >= 25) {
          grid = nums.slice(0, 25);
          grid[FREE_INDEX] = 0;
        } else {
          // 24 números: distribuir por faixa. Como o centro é LIVRE,
          // a coluna N tem 4 números e as demais têm 5.
          grid = new Array(25).fill(0);
          const byCol = { B: [], I: [], N: [], G: [], O: [] };
          nums.slice(0, 24).forEach((n) => {
            const L = B.letterFor(n);
            if (L) byCol[L].push(n);
          });

          const expected = { B: 5, I: 5, N: 4, G: 5, O: 5 };
          const okAll = B.LETTERS.every((L) => byCol[L].length === expected[L]);

          if (!okAll) {
            results.skipped++;
            const got = B.LETTERS.map((L) => `${L}:${byCol[L].length}`).join(' ');
            if (results.errors.length < 6) {
              results.errors.push(`Linha ${rowIdx + 1}: distribuição inválida nas colunas BINGO (${got}; esperado B:5 I:5 N:4 G:5 O:5).`);
            }
            return;
          }

          B.LETTERS.forEach((L, col) => {
            const list = byCol[L];
            let k = 0;
            for (let r = 0; r < 5; r++) {
              const idx = r * 5 + col;
              if (idx === FREE_INDEX) continue;
              grid[idx] = list[k++];
            }
          });
          grid[FREE_INDEX] = 0;
        }

        const v = validateGrid(grid);
        if (!v.ok) {
          results.skipped++;
          if (results.errors.length < 6) results.errors.push(`Linha ${rowIdx + 1}: ${v.error}`);
          return;
        }

        // participante
        let playerName = idxPlayer >= 0 && idxPlayer !== idxCode ? String(row[idxPlayer] || '').trim() : '';
        const explicitCode = idxCode >= 0 ? String(row[idxCode] || '').trim() : '';

        if (!playerName) playerName = `Participante ${existingPlayers.length + results.added + 1}`;

        let player = global.Players.all().find((p) => p.name.toLowerCase() === playerName.toLowerCase());
        if (!player) {
          const created = global.Players.add({ name: playerName });
          if (!created.ok) {
            results.skipped++;
            if (results.errors.length < 6) results.errors.push(`Linha ${rowIdx + 1}: ${created.error}`);
            return;
          }
          player = created.player;
        }

        const sig = grid.filter((x, i) => i !== FREE_INDEX).slice().sort((a, b) => a - b).join(',');
        const dup = cards.find((c) => numbersOf(c).slice().sort((a, b) => a - b).join(',') === sig);
        if (dup) {
          results.skipped++;
          if (results.errors.length < 6) results.errors.push(`Linha ${rowIdx + 1}: números já existem na cartela ${dup.code}.`);
          return;
        }

        const code = explicitCode && /^[A-Za-z0-9-]{1,12}$/.test(explicitCode) ? explicitCode.toUpperCase() : nextCode('C');
        cards.push({
          id: B.uid('crd'),
          code,
          playerId: player.id,
          grid,
          serial: 'C',
          createdAt: Date.now()
        });
        results.added++;
      });

      this.save();
      return { ok: true, ...results };
    },

    /** Estatísticas de progresso de uma cartela dado o conjunto sorteado */
    progress(card, drawnSet) {
      const nums = numbersOf(card);
      let hit = 0;
      nums.forEach((n) => { if (drawnSet.has(n)) hit++; });
      return {
        total: nums.length,
        hit,
        missing: nums.length - hit,
        missingNumbers: nums.filter((n) => !drawnSet.has(n)),
        complete: hit === nums.length
      };
    }
  };

  global.CardManager = Cards;
})(window);

/* ============================================================
   core.js — Constantes, utilidades e helpers do Bingo 75 Pro
   Exposto em window.Bingo
   ============================================================ */
(function (global) {
  'use strict';

  const LETTERS = ['B', 'I', 'N', 'G', 'O'];

  /** Faixas oficiais do bingo 75 */
  const RANGES = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75]
  };

  /** Pronúncia natural em português do Brasil */
  const PHONETIC = { B: 'Bê', I: 'Í', N: 'Êne', G: 'Gê', O: 'Ó' };

  /** Nomes falados dos números (0–75) para fala natural */
  const NUMBER_WORDS = [
    'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
    'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
    'vinte', 'vinte e um', 'vinte e dois', 'vinte e três', 'vinte e quatro', 'vinte e cinco',
    'vinte e seis', 'vinte e sete', 'vinte e oito', 'vinte e nove',
    'trinta', 'trinta e um', 'trinta e dois', 'trinta e três', 'trinta e quatro', 'trinta e cinco',
    'trinta e seis', 'trinta e sete', 'trinta e oito', 'trinta e nove',
    'quarenta', 'quarenta e um', 'quarenta e dois', 'quarenta e três', 'quarenta e quatro', 'quarenta e cinco',
    'quarenta e seis', 'quarenta e sete', 'quarenta e oito', 'quarenta e nove',
    'cinquenta', 'cinquenta e um', 'cinquenta e dois', 'cinquenta e três', 'cinquenta e quatro', 'cinquenta e cinco',
    'cinquenta e seis', 'cinquenta e sete', 'cinquenta e oito', 'cinquenta e nove',
    'sessenta', 'sessenta e um', 'sessenta e dois', 'sessenta e três', 'sessenta e quatro', 'sessenta e cinco',
    'sessenta e seis', 'sessenta e sete', 'sessenta e oito', 'sessenta e nove',
    'setenta', 'setenta e um', 'setenta e dois', 'setenta e três', 'setenta e quatro', 'setenta e cinco'
  ];

  const COLORS = {
    B: '#2f7cf6',
    I: '#f04a5b',
    N: '#ffce3d',
    G: '#2fd18b',
    O: '#a45cf5'
  };

  /* ---------------- utilidades ---------------- */

  const pad2 = (n) => String(n).padStart(2, '0');

  /** Letra correspondente a um número de 1 a 75 */
  function letterFor(num) {
    for (const L of LETTERS) {
      const [min, max] = RANGES[L];
      if (num >= min && num <= max) return L;
    }
    return null;
  }

  /** Faixa (letra) a que pertence uma coluna indexada 0..4 */
  function rangeOf(letter) {
    return RANGES[letter] ? RANGES[letter].slice() : null;
  }

  /** Palavra falada do número */
  function wordFor(num) {
    return NUMBER_WORDS[num] || String(num);
  }

  /** Texto falado de uma bola: "Bê, número sete" */
  function speechFor(num, opts) {
    const o = opts || {};
    const L = letterFor(num);
    if (!L) return '';
    const letterWord = PHONETIC[L];
    const numWord = wordFor(num);
    let base = `${letterWord}, número ${numWord}`;
    if (o.withLetterRepeat) base += `, ${letterWord}`;
    if (o.prefix) base = `${o.prefix} ${base}`;
    return base;
  }

  /** Rótulo visual curto: "B-07" */
  function labelFor(num) {
    const L = letterFor(num);
    return L ? `${L}-${pad2(num)}` : String(num);
  }

  /** Código de cartela amigável: "0001" */
  function padCode(n, size) {
    return String(n).padStart(size || 4, '0');
  }

  /** PRNG criptográfico quando disponível, com fallback seguro */
  function randomInt(maxExclusive) {
    if (maxExclusive <= 0) return 0;
    if (global.crypto && typeof global.crypto.getRandomValues === 'function') {
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      const buf = new Uint32Array(1);
      let v;
      do {
        global.crypto.getRandomValues(buf);
        v = buf[0];
      } while (v >= limit && limit > 0);
      return v % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  /** Fisher-Yates com PRNG criptográfico */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const escapeHtml = (str) => String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  function formatClock(ms) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return '--:--:--'; }
  }

  function formatDateTime(ts) {
    try {
      return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (e) { return '--'; }
  }

  /** Formatação de quantidade (1.234) */
  const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** Parse CSV simples com suporte a aspas e ; ou , */
  function parseCsv(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
    if (!clean) return [];
    const firstLine = clean.split('\n')[0];
    const semi = (firstLine.match(/;/g) || []).length;
    const comma = (firstLine.match(/,/g) || []).length;
    const delim = semi >= comma ? ';' : ',';

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (inQuotes) {
        if (ch === '"') {
          if (clean[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else field += ch;
    }
    row.push(field);
    rows.push(row);
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  }

  /** Gera CSV e dispara download */
  function downloadCsv(filename, rows) {
    const body = rows.map((r) => r.map((c) => {
      const v = String(c == null ? '' : c);
      return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }).join(';')).join('\r\n');
    downloadBlob(filename, '\uFEFF' + body, 'text/csv;charset=utf-8');
  }

  function downloadBlob(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 400);
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  /** Parse tolerante de números de cartela */
  function parseNumbers(str) {
    return String(str || '')
      .split(/[^0-9]+/)
      .filter((s) => s !== '')
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 75);
  }

  global.Bingo = {
    LETTERS,
    RANGES,
    PHONETIC,
    NUMBER_WORDS,
    COLORS,
    pad2,
    padCode,
    letterFor,
    rangeOf,
    wordFor,
    speechFor,
    labelFor,
    randomInt,
    shuffle,
    clamp,
    escapeHtml,
    formatClock,
    formatTime,
    formatDateTime,
    fmtNum,
    uid,
    parseCsv,
    downloadCsv,
    downloadBlob,
    debounce,
    parseNumbers
  };
})(window);

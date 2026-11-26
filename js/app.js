/* ============================================================
   app.js — Bootstrap e controlador da aplicação
   Liga Engine, Voice, Settings, Cards, Players, UI e persistência.
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;
  const $ = (id) => document.getElementById(id);
  const E = () => global.BingoEngine;
  const S = () => global.Settings;

  let editingPlayerId = null;
  let editingCardId = null;
  let importMode = 'players';
  let pendingImportRows = null;
  let confirmResolve = null;
  const modalStack = [];

  /* ============================================================
     MODAIS
     ============================================================ */
  function openModal(id) {
    const host = $('modalHost');
    const modal = $(id);
    if (!host || !modal) return;
    host.hidden = false;
    document.body.classList.add('no-scroll');
    document.querySelectorAll('#modalHost .modal').forEach((m) => {
      if (m.id !== id && m.id !== 'modalConfirm') m.hidden = true;
    });
    modal.hidden = false;
    if (!modalStack.includes(id)) modalStack.push(id);
    const focusable = modal.querySelector('input:not([type=hidden]), select, button');
    setTimeout(() => { if (focusable) focusable.focus(); }, 80);
  }

  function closeModal(id) {
    const modal = $(id);
    if (modal) modal.hidden = true;
    const idx = modalStack.indexOf(id);
    if (idx >= 0) modalStack.splice(idx, 1);
    if (!modalStack.length) {
      const host = $('modalHost');
      if (host) host.hidden = true;
      document.body.classList.remove('no-scroll');
    }
  }

  function closeAllModals() {
    modalStack.length = 0;
    document.querySelectorAll('#modalHost .modal').forEach((m) => { m.hidden = true; });
    const host = $('modalHost');
    if (host) host.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function anyOverlayOpen() {
    return modalStack.length > 0 || global.UI.isTelaoOpen() || global.UI.isStoneOpen();
  }

  function confirmDialog(title, message, confirmLabel) {
    return new Promise((resolve) => {
      const modal = $('modalConfirm');
      const host = $('modalHost');
      if (!modal || !host) return resolve(false);
      $('confirmTitle').textContent = title || 'Confirmar';
      $('confirmMessage').textContent = message || '';
      $('btnConfirmYes').textContent = confirmLabel || 'Confirmar';
      host.hidden = false;
      document.querySelectorAll('#modalHost .modal').forEach((m) => {
        if (m.id !== 'modalConfirm') m.hidden = true;
      });
      modal.hidden = false;
      document.body.classList.add('no-scroll');
      if (!modalStack.includes('modalConfirm')) modalStack.push('modalConfirm');
      confirmResolve = (value) => {
        confirmResolve = null;
        closeModal('modalConfirm');
        if (modalStack.length) {
          const prev = modalStack[modalStack.length - 1];
          const prevEl = $(prev);
          if (prevEl) prevEl.hidden = false;
        } else {
          closeAllModals();
        }
        resolve(value);
      };
      setTimeout(() => $('btnConfirmYes').focus(), 60);
    });
  }

  /* ============================================================
     PARTICIPANTES
     ============================================================ */
  function renderPlayers() {
    const tbody = $('playersTbody');
    const empty = $('playersEmpty');
    if (!tbody) return;
    const term = $('playerSearch') ? $('playerSearch').value : '';
    const list = global.Players.search(term);
    const cards = global.CardManager.all();

    if (!list.length) {
      tbody.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = term
          ? 'Nenhum participante encontrado para esta busca.'
          : 'Nenhum participante cadastrado ainda.';
      }
    } else {
      if (empty) empty.hidden = true;
      tbody.innerHTML = list.map((p) => {
        const count = cards.filter((c) => c.playerId === p.id).length;
        return `<tr>
          <td class="code">${B.escapeHtml(p.code)}</td>
          <td>${B.escapeHtml(p.name)}</td>
          <td>${B.escapeHtml(p.phone || '—')}</td>
          <td>${count}</td>
          <td class="right">
            <div class="row-actions">
              <button type="button" class="mini-btn" data-edit-player="${p.id}">Editar</button>
              <button type="button" class="mini-btn" data-cards-player="${p.id}">Cartelas</button>
              <button type="button" class="mini-btn danger" data-del-player="${p.id}">Excluir</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }
    fillPlayerSelects();
    global.UI.render(E().state);
  }

  function fillPlayerSelects() {
    const players = global.Players.all();
    const opts = players.map((p) => `<option value="${p.id}">${B.escapeHtml(p.name)} (${B.escapeHtml(p.code)})</option>`).join('');
    ['genPlayer', 'manualPlayer', 'cardFilterPlayer'].forEach((id) => {
      const sel = $(id);
      if (!sel) return;
      const current = sel.value;
      const isFilter = id === 'cardFilterPlayer';
      sel.innerHTML = (isFilter ? '<option value="">Todos os participantes</option>' : '<option value="">Selecione…</option>') + opts;
      if (current && Array.from(sel.options).some((o) => o.value === current)) sel.value = current;
    });
  }

  function resetPlayerForm() {
    editingPlayerId = null;
    if ($('playerName')) $('playerName').value = '';
    if ($('playerPhone')) $('playerPhone').value = '';
    if ($('playerCards')) $('playerCards').value = '1';
    if ($('btnPlayerSave')) $('btnPlayerSave').textContent = 'Cadastrar';
    if ($('btnPlayerCancel')) $('btnPlayerCancel').hidden = true;
    if ($('playerForm')) $('playerForm').dataset.mode = 'create';
  }

  function submitPlayer(ev) {
    ev.preventDefault();
    const name = $('playerName').value;
    const phone = $('playerPhone').value;
    const qty = parseInt($('playerCards').value, 10) || 0;

    if (editingPlayerId) {
      const up = global.Players.update(editingPlayerId, { name, phone });
      if (!up.ok) return global.UI.toast(up.error, 'err');
      global.UI.toast('Participante atualizado.', 'ok');
      resetPlayerForm();
      renderPlayers();
      return;
    }

    const res = global.Players.add({ name, phone });
    if (!res.ok) return global.UI.toast(res.error, 'err');

    let generated = 0;
    if (qty > 0) {
      const g = global.CardManager.generate(res.player.id, qty, 'C');
      if (g.ok) generated = g.added;
    }
    global.UI.toast(generated
      ? `${res.player.name} cadastrado com ${generated} cartela(s).`
      : `${res.player.name} cadastrado.`, 'ok');
    resetPlayerForm();
    renderPlayers();
    renderCards();
  }

  function editPlayer(id) {
    const p = global.Players.byId(id);
    if (!p) return;
    editingPlayerId = id;
    $('playerName').value = p.name;
    $('playerPhone').value = p.phone || '';
    $('playerCards').value = '0';
    $('playerCards').disabled = true;
    $('btnPlayerSave').textContent = 'Salvar';
    $('btnPlayerCancel').hidden = false;
    $('playerName').focus();
  }

  async function deletePlayer(id) {
    const p = global.Players.byId(id);
    if (!p) return;
    const cards = global.CardManager.byPlayer(id).length;
    const ok = await confirmDialog(
      'Excluir participante',
      `Excluir "${p.name}"${cards ? ` e suas ${cards} cartela(s)` : ''}? Esta ação não pode ser desfeita.`,
      'Excluir'
    );
    if (!ok) return;
    if (cards) global.CardManager.removeByPlayer(id);
    global.Players.remove(id);
    global.UI.toast('Participante excluído.', 'ok');
    renderPlayers();
    renderCards();
  }

  /* ============================================================
     CARTELAS
     ============================================================ */
  function progressCell(card) {
    const prog = global.CardManager.progress(card, E().drawnSet());
    const pct = Math.round((prog.hit / prog.total) * 100);
    return `<div class="progress-mini">
      <div class="bar"><i class="${prog.complete ? 'full' : ''}" style="width:${pct}%"></i></div>
      <span>${prog.hit}/${prog.total}${prog.complete ? ' ✔' : ''}</span>
    </div>`;
  }

  const selectedCardIds = new Set();

  function renderCards() {
    const tbody = $('cardsTbody');
    const empty = $('cardsEmpty');
    if (!tbody) return;
    const term = $('cardSearch') ? $('cardSearch').value : '';
    const filterId = $('cardFilterPlayer') ? $('cardFilterPlayer').value : '';
    const list = global.CardManager.search(term, filterId);
    const players = new Map(global.Players.all().map((p) => [p.id, p]));

    if (!list.length) {
      tbody.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = (term || filterId)
          ? 'Nenhuma cartela encontrada com esse filtro.'
          : 'Nenhuma cartela cadastrada ainda.';
      }
    } else {
      if (empty) empty.hidden = true;
      tbody.innerHTML = list.map((c) => {
        const p = players.get(c.playerId);
        const nums = c.grid.map((v, i) => (i === global.CardManager.FREE_INDEX ? '☆' : v)).join(' ');
        return `<tr>
          <td><input type="checkbox" class="card-print-select" data-select-card="${c.id}" ${selectedCardIds.has(c.id) ? 'checked' : ''} aria-label="Selecionar cartela ${B.escapeHtml(c.code)} para impressão"></td>
          <td class="code">${B.escapeHtml(c.code)}</td>
          <td>${B.escapeHtml(p ? p.name : '— removido —')}</td>
          <td class="card-nums">${nums}</td>
          <td>${progressCell(c)}</td>
          <td class="right">
            <div class="row-actions">
              <button type="button" class="mini-btn" data-view-card="${c.id}">Ver</button>
              <button type="button" class="mini-btn danger" data-del-card="${c.id}">Excluir</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }
    global.UI.render(E().state);
  }

  function printCards(cardsToPrint) {
    if (!cardsToPrint || !cardsToPrint.length) { global.UI.toast('Selecione pelo menos uma cartela.', 'warn'); return; }
    const playerMap = new Map(global.Players.all().map(p => [p.id, p]));
    const htmlCards = cardsToPrint.map(c => {
      const p = playerMap.get(c.playerId);
      const cells = B.LETTERS.map(L => `<div class="head">${L}</div>`).join('') + c.grid.map((v,i) => `<div class="cell ${i===global.CardManager.FREE_INDEX?'free':''}">${i===global.CardManager.FREE_INDEX?'LIVRE':B.pad2(v)}</div>`).join('');
      return `<article class="ticket"><div class="ticket-title">BINGO · ${B.escapeHtml(c.code)}</div><div class="ticket-player">${B.escapeHtml(p?p.name:'Participante removido')}</div><div class="grid">${cells}</div></article>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) { global.UI.toast('Permita pop-ups para abrir a impressão.', 'err'); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Cartelas de Bingo</title><style>body{font-family:Arial,sans-serif;margin:16px;color:#111}.tickets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.ticket{break-inside:avoid;border:2px solid #222;padding:12px}.ticket-title{text-align:center;font-size:20px;font-weight:bold}.ticket-player{text-align:center;margin:5px 0 12px;font-size:16px}.grid{display:grid;grid-template-columns:repeat(5,1fr)}.head,.cell{border:1px solid #222;min-height:45px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold}.head{background:#ddd}.free{font-size:13px;background:#eee}@media print{body{margin:8mm}.tickets{gap:10mm}}@media(max-width:600px){.tickets{grid-template-columns:1fr}}</style></head><body><div class="tickets">${htmlCards}</div><script>window.onload=()=>window.print()<\/script></body></html>`);
    w.document.close();
  }

  function buildManualGrid() {
    const grid = $('manualGrid');
    if (!grid) return;
    grid.innerHTML = B.LETTERS.map((L) => {
      const [min, max] = B.RANGES[L];
      const inputs = [];
      for (let r = 0; r < 5; r++) {
        const idx = r * 5 + B.LETTERS.indexOf(L);
        if (idx === global.CardManager.FREE_INDEX) {
          inputs.push('<input type="text" value="LIVRE" disabled aria-label="Centro livre">');
        } else {
          inputs.push(`<input type="number" min="${min}" max="${max}" inputmode="numeric" data-idx="${idx}" placeholder="—" aria-label="${L} linha ${r + 1}">`);
        }
      }
      return `<div class="mg-col">
        <div class="mg-head" data-letter="${L}">${L}<br><span style="font-size:9px;font-weight:600">${min}–${max}</span></div>
        ${inputs.join('')}
      </div>`;
    }).join('');
  }

  function submitManualCard(ev) {
    ev.preventDefault();
    const err = $('manualCardError');
    const playerId = $('manualPlayer').value;
    if (!playerId) {
      if (err) { err.hidden = false; err.textContent = 'Selecione o participante.'; }
      return;
    }
    const grid = new Array(25).fill(0);
    let missing = 0;
    $('manualGrid').querySelectorAll('input[data-idx]').forEach((inp) => {
      const idx = parseInt(inp.dataset.idx, 10);
      const v = parseInt(inp.value, 10);
      if (!Number.isInteger(v)) { missing++; return; }
      grid[idx] = v;
    });
    if (missing) {
      if (err) { err.hidden = false; err.textContent = `Preencha todos os ${missing === 1 ? 'campo vazio' : missing + ' campos vazios'}.`; }
      return;
    }
    const res = global.CardManager.addManual(playerId, grid, 'M');
    if (!res.ok) {
      if (err) { err.hidden = false; err.textContent = res.error; }
      return;
    }
    if (err) err.hidden = true;
    $('manualCardForm').hidden = true;
    global.UI.toast(`Cartela ${res.card.code} criada.`, 'ok');
    renderCards();
    renderPlayers();
  }

  function viewCard(id) {
    const c = global.CardManager.byId(id);
    if (!c) return;
    const p = global.Players.byId(c.playerId);
    const drawn = E().drawnSet();
    const prog = global.CardManager.progress(c, drawn);

    const cells = [];
    B.LETTERS.forEach((L) => {
      cells.push(`<div class="cv-head-cell" data-letter="${L}">${L}</div>`);
    });
    for (let r = 0; r < 5; r++) {
      for (let col = 0; col < 5; col++) {
        const idx = r * 5 + col;
        if (idx === global.CardManager.FREE_INDEX) {
          cells.push('<div class="cv-cell free">LIVRE</div>');
        } else {
          const v = c.grid[idx];
          cells.push(`<div class="cv-cell ${drawn.has(v) ? 'hit' : ''}">${B.pad2(v)}</div>`);
        }
      }
    }

    $('mcvTitle').textContent = `Cartela ${c.code}`;
    $('cardViewBody').innerHTML = `
      <div class="cv-head">
        <h4>${B.escapeHtml(p ? p.name : 'Participante removido')}</h4>
        <span class="tag">${prog.hit} de ${prog.total} marcados</span>
      </div>
      <div class="cv-card">${cells.join('')}</div>
      <div class="cv-meta">
        <span class="tag">Faltam: ${prog.missingNumbers.length ? prog.missingNumbers.map((n) => B.labelFor(n)).join(' · ') : 'nenhum — BINGO!'}</span>
      </div>`;
    openModal('modalCardView');
  }

  /* ============================================================
     IMPORTAÇÃO CSV
     ============================================================ */
  function openImport(mode) {
    importMode = mode;
    pendingImportRows = null;
    const file = $('importCsvFile');
    if (file) file.value = '';
    if ($('importResult')) $('importResult').hidden = true;
    if ($('importError')) $('importError').hidden = true;
    if ($('btnImportConfirm')) $('btnImportConfirm').disabled = true;

    if (mode === 'players') {
      $('miTitle').textContent = 'Importar participantes (CSV)';
      $('importHint').textContent = 'Arquivo CSV com colunas: codigo;nome;telefone. A primeira linha com cabeçalho é opcional.';
      $('importSample').textContent = 'codigo;nome;telefone\n001;Maria Silva;11999990000\n002;João Santos;';
    } else {
      $('miTitle').textContent = 'Importar cartelas (CSV)';
      $('importHint').textContent = 'Arquivo CSV com colunas: cartela;participante;numeros. Use os 25 valores na ordem das linhas (B I N G O) separados por espaço; o centro pode ser LIVRE ou 0. Também aceita 24 números por faixa.';
      $('importSample').textContent = 'cartela;participante;numeros\nC001;Maria Silva;1 16 31 46 61 2 17 32 47 62 3 18 LIVRE 48 63 4 19 34 49 64 5 20 35 50 65\nC002;João Santos;6 21 36 51 66 7 22 37 52 67 8 23 38 53 68 9 24 39 54 69 10 25 40 55 70';
    }
    openModal('modalImport');
  }

  function handleImportFile(ev) {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      pendingImportRows = String(reader.result || '');
      if ($('btnImportConfirm')) $('btnImportConfirm').disabled = false;
      if ($('importResult')) {
        $('importResult').hidden = false;
        $('importResult').textContent = `Arquivo carregado (${(file.size / 1024).toFixed(1)} KB). Clique em Importar para confirmar.`;
      }
    };
    reader.onerror = () => {
      if ($('importError')) {
        $('importError').hidden = false;
        $('importError').textContent = 'Não foi possível ler o arquivo.';
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function confirmImport() {
    if (!pendingImportRows) return;
    const res = importMode === 'players'
      ? global.Players.importCsv(pendingImportRows)
      : global.CardManager.importCsv(pendingImportRows);

    const box = $('importError');
    const out = $('importResult');

    if (!res.ok) {
      if (box) { box.hidden = false; box.textContent = res.error || 'Falha na importação.'; }
      return;
    }
    if (box) box.hidden = true;
    if (out) {
      out.hidden = false;
      out.innerHTML = `Importação concluída: <strong>${res.added}</strong> incluído(s), ${res.skipped} ignorado(s).`
        + (res.errors && res.errors.length ? `<br><span style="color:#ff98a2">${res.errors.map(B.escapeHtml).join('<br>')}</span>` : '');
    }
    $('btnImportConfirm').disabled = true;
    pendingImportRows = null;
    global.UI.toast(`${res.added} registro(s) importado(s).`, 'ok');
    renderPlayers();
    renderCards();
  }

  /* ============================================================
     CONFIGURAÇÕES
     ============================================================ */
  function fillVoiceSelect() {
    const sel = $('setVoice');
    if (!sel) return;
    const voices = global.Voice.listVoices();
    const current = S().get('voiceURI');

    const pt = voices.filter((v) => (v.lang || '').toLowerCase().replace('_', '-').startsWith('pt'));
    const other = voices.filter((v) => !pt.includes(v));

    const opt = (v) => `<option value="${B.escapeHtml(v.voiceURI)}">${B.escapeHtml(v.name)} — ${B.escapeHtml(v.lang)}${v.localService ? '' : ' (online)'}</option>`;

    sel.innerHTML = `<option value="">Automático (melhor voz pt-BR)</option>`
      + (pt.length ? `<optgroup label="Português (${pt.length})">${pt.map(opt).join('')}</optgroup>` : '')
      + (other.length ? `<optgroup label="Outros idiomas (${other.length})">${other.slice(0, 40).map(opt).join('')}</optgroup>` : '');

    sel.value = Array.from(sel.options).some((o) => o.value === current) ? current : '';

    const hint = $('voiceHint');
    if (hint) {
      const active = global.Voice.activeVoice();
      if (!global.Voice.supported) {
        hint.textContent = 'Este navegador não suporta síntese de voz. O texto de cada chamada aparece na tela como fallback visual.';
      } else if (!voices.length) {
        hint.textContent = 'Nenhuma voz detectada ainda. O navegador pode carregar as vozes após a primeira interação.';
      } else if (!pt.length) {
        hint.textContent = `Nenhuma voz pt-BR instalada. Voz em uso: ${active ? active.name : 'padrão'} (${active ? active.lang : '—'}). Instale uma voz em português nas configurações do sistema para melhor resultado.`;
      } else {
        hint.textContent = `${pt.length} voz(es) em português detectada(s). Em uso: ${active ? active.name : 'automática'} (${active ? active.lang : 'pt-BR'}).`;
      }
    }
  }

  function syncSettingsForm() {
    const s = S().state;
    const setVal = (id, v) => { const n = $(id); if (n) n.value = v; };
    const setChk = (id, v) => { const n = $(id); if (n) n.checked = !!v; };
    const setTxt = (id, v) => { const n = $(id); if (n) n.textContent = v; };

    setChk('setVoiceOn', s.voiceEnabled);
    setVal('setRate', s.rate); setTxt('outRate', Number(s.rate).toFixed(2).replace('.', ','));
    setVal('setPitch', s.pitch); setTxt('outPitch', Number(s.pitch).toFixed(2).replace('.', ','));
    setVal('setVolume', s.volume); setTxt('outVolume', Math.round(s.volume * 100) + '%');
    setVal('setSpeechDelay', s.speechDelay); setTxt('outSpeechDelay', Math.round(s.speechDelay) + ' ms');
    setVal('setRepeatLetter', s.repeatLetter ? '1' : '0');
    setVal('setAnnouncePrefix', s.announcePrefix || '');

    const isCustom = ![5000, 8000, 10000, 15000, 20000, 30000].includes(Number(s.interval));
    if (isCustom) {
      setVal('setInterval', 'custom');
      setVal('setCustomInterval', Math.round(Number(s.interval) / 1000));
      const f = $('customIntervalField');
      if (f) f.hidden = false;
    } else {
      setVal('setInterval', String(s.interval));
      const f = $('customIntervalField');
      if (f) f.hidden = true;
    }
    setChk('setIntervalAfterSpeech', s.intervalAfterSpeech);
    setChk('setAutoStart', s.autoStart);
    setChk('setPauseOnAlert', s.highlightImminent);

    setChk('setSfxOn', s.sfxEnabled);
    setVal('setSfxVolume', s.sfxVolume); setTxt('outSfxVolume', Math.round(s.sfxVolume * 100) + '%');

    setVal('setVictoryTemplate', s.victoryTemplate);
    setChk('setStoneAuto', s.stoneAuto);
    setChk('setAutoSave', s.autoSave);
  }

  function bindSettingsForm() {
    const on = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, fn); };

    on('setVoiceOn', 'change', (e) => { S().set({ voiceEnabled: e.target.checked }); });
    on('setVoice', 'change', (e) => {
      S().set({ voiceURI: e.target.value });
      global.Voice.setVoice(e.target.value);
      fillVoiceSelect();
    });
    on('setRate', 'input', (e) => {
      $('outRate').textContent = Number(e.target.value).toFixed(2).replace('.', ',');
      S().set({ rate: Number(e.target.value) });
    });
    on('setPitch', 'input', (e) => {
      $('outPitch').textContent = Number(e.target.value).toFixed(2).replace('.', ',');
      S().set({ pitch: Number(e.target.value) });
    });
    on('setVolume', 'input', (e) => {
      $('outVolume').textContent = Math.round(Number(e.target.value) * 100) + '%';
      S().set({ volume: Number(e.target.value) });
    });
    on('setSpeechDelay', 'input', (e) => {
      $('outSpeechDelay').textContent = e.target.value + ' ms';
      S().set({ speechDelay: Number(e.target.value) });
    });
    on('setRepeatLetter', 'change', (e) => S().set({ repeatLetter: e.target.value === '1' }));
    on('setAnnouncePrefix', 'change', (e) => S().set({ announcePrefix: e.target.value }));

    on('setInterval', 'change', (e) => {
      const f = $('customIntervalField');
      if (e.target.value === 'custom') {
        if (f) f.hidden = false;
        const secs = parseInt($('setCustomInterval').value, 10) || 12;
        S().set({ interval: Math.max(3, secs) * 1000 });
      } else {
        if (f) f.hidden = true;
        S().set({ interval: Number(e.target.value) });
      }
    });
    on('setCustomInterval', 'input', (e) => {
      const secs = B.clamp(parseInt(e.target.value, 10) || 12, 3, 300);
      S().set({ interval: secs * 1000 });
    });

    on('setIntervalAfterSpeech', 'change', (e) => S().set({ intervalAfterSpeech: e.target.checked }));
    on('setAutoStart', 'change', (e) => S().set({ autoStart: e.target.checked }));
    on('setPauseOnAlert', 'change', (e) => S().set({ highlightImminent: e.target.checked }));
    on('setSfxOn', 'change', (e) => S().set({ sfxEnabled: e.target.checked }));
    on('setSfxVolume', 'input', (e) => {
      $('outSfxVolume').textContent = Math.round(Number(e.target.value) * 100) + '%';
      S().set({ sfxVolume: Number(e.target.value) });
      global.Sound.setVolume(Number(e.target.value));
    });
    on('setVictoryTemplate', 'change', (e) => S().set({ victoryTemplate: e.target.value }));
    on('setStoneAuto', 'change', (e) => S().set({ stoneAuto: e.target.checked }));
    on('setAutoSave', 'change', (e) => S().set({ autoSave: e.target.checked }));

    document.querySelectorAll('[data-sfx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        global.Sound.unlock();
        global.Sound.play(btn.dataset.sfx, { force: true });
      });
    });

    on('btnTestVoice', 'click', () => {
      global.Sound.unlock();
      if (!global.Voice.supported) return global.UI.toast('Este navegador não suporta síntese de voz.', 'warn');
      global.Voice.test('Bê, número sete. Boa sorte a todos!');
      global.UI.toast('Testando o locutor…', 'gold');
    });

    on('btnTestBall', 'click', () => {
      global.Sound.unlock();
      const pool = E().remaining();
      const num = pool.length ? pool[B.randomInt(pool.length)] : 7;
      global.Voice.say(B.speechFor(num, { prefix: S().get('announcePrefix'), withLetterRepeat: S().get('repeatLetter') }), { force: true });
      global.UI.toast(`Teste: ${B.labelFor(num)}`, 'gold');
    });

    on('btnTestVictory', 'click', () => {
      global.Sound.unlock();
      const text = global.Voice.buildVictoryText([{ playerName: 'Maria Silva', code: 'C001', codeSpoken: 'C zero zero um' }]);
      global.Voice.say(text, { force: true });
      global.UI.toast('Testando anúncio de vitória…', 'gold');
    });

    on('btnSettingsReset', 'click', async () => {
      const ok = await confirmDialog('Restaurar padrões', 'Restaurar todas as configurações para o padrão de fábrica?', 'Restaurar');
      if (!ok) return;
      S().reset();
      syncSettingsForm();
      fillVoiceSelect();
      global.Voice.setVoice('');
      global.UI.render(E().state);
      global.UI.toast('Configurações restauradas.', 'ok');
    });

    on('btnSettingsClose', 'click', () => closeModal('modalSettings'));
  }

  /* ============================================================
     BACKUP
     ============================================================ */
  function renderBackupList() {
    const box = $('backupList');
    if (!box) return;
    const last = global.Persistence.loadLastGame();
    const auto = global.Persistence.loadAutoBackup();
    const rows = [];
    if (last) {
      rows.push(`<div class="backup-row">
        <span>Última partida finalizada<br><span class="meta">${B.formatDateTime(last.endedAt || last.createdAt)} · ${last.history ? last.history.length : 0} bolas</span></span>
        <button type="button" class="mini-btn" data-restore="last">Restaurar</button>
      </div>`);
    }
    if (auto && auto.state) {
      rows.push(`<div class="backup-row">
        <span>Backup automático<br><span class="meta">${B.formatDateTime(auto.at)} · ${auto.state.history ? auto.state.history.length : 0} bolas</span></span>
        <button type="button" class="mini-btn" data-restore="auto">Restaurar</button>
      </div>`);
    }
    if (!rows.length) {
      box.innerHTML = '<p class="hint">Nenhum jogo salvo anteriormente.</p>';
    } else {
      box.innerHTML = rows.join('');
    }
  }

  async function restoreState(state, label) {
    if (!state) return global.UI.toast('Nada para recuperar.', 'warn');
    const ok = await confirmDialog('Recuperar partida', `Substituir a partida atual por "${label}"? O progresso atual será arquivado.`, 'Recuperar');
    if (!ok) return;
    if (E().state.history.length) {
      global.Persistence.saveLastGame(E().state);
    }
    E().restore(state);
    closeAllModals();
    global.UI.render(E().state);
    global.UI.toast('Partida recuperada.', 'ok');
  }

  function bindBackup() {
    const on = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, fn); };

    on('btnExportJson', 'click', () => {
      const data = global.Persistence.exportAll();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      B.downloadBlob(`bingo75pro-backup-${stamp}.json`, JSON.stringify(data, null, 2), 'application/json');
      global.UI.toast('Backup exportado.', 'ok');
    });

    on('importJsonFile', 'change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        let data = null;
        try { data = JSON.parse(String(reader.result || '{}')); } catch (e) {
          return global.UI.toast('Arquivo JSON inválido.', 'err');
        }
        const ok = await confirmDialog(
          'Importar backup',
          'Importar este backup vai substituir participantes, cartelas, configurações e a partida atual. Uma cópia de segurança interna será guardada. Continuar?',
          'Importar'
        );
        if (!ok) { ev.target.value = ''; return; }

        const res = global.Persistence.importAll(data);
        if (!res.ok) { ev.target.value = ''; return global.UI.toast(res.error, 'err'); }

        global.Players.load();
        global.CardManager.load();
        S().load();
        if (E().state.history.length) global.Persistence.saveLastGame(E().state);
        E().load();
        syncSettingsForm();
        fillVoiceSelect();
        renderPlayers();
        renderCards();
        renderBackupList();
        global.UI.render(E().state);
        global.UI.toast(`Backup importado: ${res.players} participantes, ${res.cards} cartelas.`, 'ok');
        ev.target.value = '';
      };
      reader.readAsText(file, 'utf-8');
    });

    on('btnRestoreLastFinished', 'click', () => {
      const last = global.Persistence.loadLastGame();
      restoreState(last, 'última partida finalizada');
    });

    if ($('backupList')) {
      $('backupList').addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-restore]');
        if (!btn) return;
        if (btn.dataset.restore === 'last') {
          restoreState(global.Persistence.loadLastGame(), 'última partida finalizada');
        } else {
          const auto = global.Persistence.loadAutoBackup();
          restoreState(auto ? auto.state : null, 'backup automático');
        }
      });
    }

    on('btnResetData', 'click', async () => {
      const ok = await confirmDialog(
        'Limpar cadastro',
        'Remover todos os participantes e cartelas do cadastro? A partida atual e os backups são preservados.',
        'Remover cadastro'
      );
      if (!ok) return;
      global.Persistence.clearRegistry();
      global.Players.load();
      global.CardManager.load();
      renderPlayers();
      renderCards();
      global.UI.render(E().state);
      global.UI.toast('Cadastro limpo.', 'ok');
    });
  }

  /* ============================================================
     CONTROLES DO JOGO
     ============================================================ */
  async function doDraw(opts) {
    global.Sound.unlock();
    global.Voice.clearQueue();
    let res = await E().drawBall(opts || { manual: true });
    if (res && res.needsConfirm) {
      const ok = await confirmDialog(
        'Locutor anunciando',
        'O locutor ainda está narrando a última bola. Sortear a próxima agora vai interromper a narração. Deseja continuar?',
        'Sortear agora'
      );
      if (!ok) return res;
      global.Voice.stop();
      res = await E().drawBall({ manual: true, confirmed: true });
    }
    if (res && !res.ok && res.error) global.UI.toast(res.error, 'warn');
    return res;
  }

  function bindControls() {
    const on = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, fn); };

    on('btnStart', 'click', () => {
      global.Sound.unlock();
      const st = E().state;
      if (st.status === 'paused') {
        E().resume();
        global.Sound.play('start');
        global.UI.toast('Jogo retomado.', 'ok');
        return;
      }
      const cards = global.CardManager.count();
      if (!cards) {
        global.UI.toast('Nenhuma cartela cadastrada — o sorteio funciona, mas sem monitoramento.', 'warn', 4200);
      }
      const res = E().start({});
      if (!res.ok) return global.UI.toast(res.error, 'err');
      global.Sound.play('start');
      global.UI.toast('Boa sorte a todos!', 'gold');
      if (!E().state.autoRun) {
        global.UI.toast('Sorteio automático desativado: use "Sortear próxima bola".', 'warn');
      }
    });

    on('btnPause', 'click', () => {
      const res = E().pause();
      if (!res.ok) return global.UI.toast(res.error, 'warn');
      global.Sound.play('pause');
      global.UI.toast('Jogo pausado.', 'warn');
    });

    on('btnDraw', 'click', () => doDraw({ manual: true }));

    on('btnRepeat', 'click', () => {
      const res = E().repeatLast();
      if (!res.ok) return global.UI.toast(res.error, 'warn');
      if (!global.Voice.supported) {
        return global.UI.toast(`Repetindo: ${B.labelFor(res.ball.num)} (sem voz neste navegador)`, 'gold');
      }
      global.UI.toast(`Repetindo: ${B.labelFor(res.ball.num)}`, 'gold');
    });

    on('btnMute', 'click', () => {
      const muted = !S().get('muted');
      S().set({ muted });
      global.Voice.setMuted(muted);
      if (muted) global.Voice.stop();
      global.UI.renderVoiceChip(global.Voice.getState());
      global.UI.toast(muted ? 'Locutor silenciado.' : 'Locutor reativado.', muted ? 'warn' : 'ok');
    });

    on('btnUndo', 'click', async () => {
      const last = E().state.lastBall;
      if (!last) return;
      const ok = await confirmDialog(
        'Desfazer sorteio',
        `Desfazer a bola ${B.labelFor(last.num)}? Ela voltará a ficar disponível e as marcações serão recalculadas.`,
        'Desfazer'
      );
      if (!ok) return;
      global.Voice.stop();
      const res = E().undoLast();
      if (!res.ok) return global.UI.toast(res.error, 'warn');
      global.UI.toast(`Bola ${B.labelFor(res.removed.num)} desfeita.`, 'warn');
    });

    on('btnFinish', 'click', async () => {
      const ok = await confirmDialog('Finalizar jogo', 'Encerrar a partida atual? O histórico será salvo e você poderá recuperá-lo depois.', 'Finalizar');
      if (!ok) return;
      global.Voice.stop();
      E().finish();
      global.UI.render(E().state);
      global.UI.toast('Partida finalizada e salva.', 'ok');
      renderBackupList();
    });

    on('btnNewGame', 'click', async () => {
      const hasProgress = E().state.history.length > 0 || E().state.winners.length > 0;
      const ok = await confirmDialog(
        'Novo jogo',
        hasProgress
          ? 'Iniciar um novo jogo? A partida atual será arquivada e o tabuleiro será zerado. Participantes e cartelas são mantidos.'
          : 'Iniciar um novo jogo com o tabuleiro zerado?',
        'Novo jogo'
      );
      if (!ok) return;
      global.Voice.stop();
      global.UI.hideVictory();
      global.UI.hideBigStone();
      global.BigStoneManager.reset();
      E().newGame();
      global.UI.render(E().state);
      global.UI.toast('Novo jogo pronto. Bom bingo!', 'gold');
    });

    on('btnRecover', 'click', async () => {
      const auto = global.Persistence.loadAutoBackup();
      const last = global.Persistence.loadLastGame();
      const source = auto ? auto.state : last;
      if (!source) return global.UI.toast('Nenhuma partida salva encontrada.', 'warn');
      await restoreState(source, auto ? 'backup automático' : 'última partida salva');
    });

    on('btnTelao', 'click', () => {
      global.UI.openTelao();
      global.UI.toast('Modo telão ativo. Pressione F para tela cheia.', 'info');
    });

    on('btnExitTelao', 'click', () => global.UI.closeTelao());
  }

  /* ============================================================
     VITÓRIA / PEDRA MAIOR
     ============================================================ */
  function bindVictory() {
    const on = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, fn); };

    on('btnVictoryClose', 'click', () => {
      global.UI.hideVictory();
      global.UI.render(E().state);
    });

    on('btnVictoryNew', 'click', async () => {
      const ok = await confirmDialog('Novo jogo', 'Encerrar esta partida e começar um novo jogo?', 'Novo jogo');
      if (!ok) return;
      global.Voice.stop();
      global.UI.hideVictory();
      global.UI.hideBigStone();
      global.BigStoneManager.reset();
      E().newGame();
      global.UI.render(E().state);
    });

    on('btnVictoryStone', 'click', () => {
      global.UI.hideVictory();
      global.UI.showBigStone(E().state.winners);
    });

    on('btnStoneAdd', 'click', () => {
      const input = $('stoneName');
      const res = global.BigStoneManager.addCandidate(input.value);
      if (!res.ok) return global.UI.toast(res.error, 'warn');
      input.value = '';
      global.UI.renderStone();
    });

    on('stoneName', 'keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); $('btnStoneAdd').click(); }
    });

    if ($('stoneGrid')) {
      $('stoneGrid').addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-remove]');
        if (!btn) return;
        const res = global.BigStoneManager.removeCandidate(btn.dataset.remove);
        if (!res.ok) return global.UI.toast(res.error, 'warn');
        global.UI.renderStone();
      });
    }

    on('btnStoneDraw', 'click', async () => {
      const S_M = global.BigStoneManager;
      if (S_M.winner) return;
      global.Sound.unlock();
      global.Sound.play('stone');

      const chips = Array.from(document.querySelectorAll('.stone-chip'));
      let ticks = 0;
      const totalTicks = 18;
      const spin = setInterval(() => {
        ticks++;
        chips.forEach((c) => c.classList.remove('is-win'));
        const pick = chips[B.randomInt(chips.length || 1)];
        if (pick) pick.classList.add('is-win');
        if (ticks >= totalTicks) {
          clearInterval(spin);
          const res = S_M.draw();
          if (!res.ok) {
            global.UI.renderStone();
            return global.UI.toast(res.error, 'warn');
          }
          global.UI.renderStone();
          global.Sound.play('stoneWin');
          global.UI.confetti(6000);
          E().setBigStone(S_M.result());
          const text = S_M.announceText();
          if (global.Voice.supported && S().get('voiceEnabled') && !S().get('muted')) {
            global.Voice.say(text);
          }
          global.UI.toast(`${S_M.winner.name} venceu a pedra maior!`, 'gold', 6000);
        }
      }, 130);
    });

    on('btnStoneRepeat', 'click', () => {
      const text = global.BigStoneManager.announceText();
      if (global.Voice.supported && !S().get('muted')) {
        global.Voice.say(text);
        global.UI.toast('Repetindo anúncio.', 'info');
      } else {
        global.UI.toast(text, 'info', 5000);
      }
    });

    on('btnStoneClose', 'click', () => global.UI.hideBigStone());
  }

  /* ============================================================
     ATALHOS
     ============================================================ */
  function isTyping() {
    const a = document.activeElement;
    if (!a) return false;
    const tag = a.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || a.isContentEditable;
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (confirmResolve) { confirmResolve(false); return; }
        if (global.UI.isStoneOpen()) return global.UI.hideBigStone();
        if (global.UI.isVictoryOpen()) return global.UI.hideVictory();
        if (global.UI.isTelaoOpen()) return global.UI.closeTelao();
        if (modalStack.length) {
          global.UI.hideBigStone && global.UI.hideBigStone();
          return closeModal(modalStack[modalStack.length - 1]);
        }
        return;
      }

      if (isTyping()) return;

      if (ev.code === 'Space' || ev.key === ' ') {
        if (global.UI.isTelaoOpen() && !anyOverlayOpen()) {
          // no telão o espaço não deve sortear acidentalmente
        }
        if (anyOverlayOpen()) return;
        ev.preventDefault();
        $('btnDraw').click();
        return;
      }

      const k = ev.key.toLowerCase();
      if (k === 'p' && !anyOverlayOpen()) { ev.preventDefault(); $('btnPause').click(); }
      if (k === 'r' && !anyOverlayOpen()) { ev.preventDefault(); $('btnRepeat').click(); }
      if (k === 'f') {
        ev.preventDefault();
        if (global.UI.isTelaoOpen()) global.UI.requestFullscreen();
        else { global.UI.openTelao(); }
      }
      if (k === 'm' && !anyOverlayOpen()) { ev.preventDefault(); $('btnMute').click(); }
    });
  }

  /* ============================================================
     EVENTOS DO ENGINE
     ============================================================ */
  function bindEngine() {
    E().on('state', (state) => {
      global.UI.render(state);
    });

    E().on('drawing', () => {
      global.UI.paintDrawing(true);
      global.UI.setSpeech('');
    });

    E().on('ball', ({ ball }) => {
      global.UI.paintDrawing(false);
      global.UI.render(E().state);
      if (ball) {
        global.UI.setSpeech(B.speechFor(ball.num, {
          prefix: S().get('announcePrefix'),
          withLetterRepeat: S().get('repeatLetter')
        }), false);
      }
    });

    E().on('monitor', (analysis) => {
      global.UI.renderAlerts(analysis);
      global.UI.renderStats(E().stats());
    });

    E().on('countdown', (payload) => global.UI.renderCountdown(payload));
    E().on('tick', (payload) => global.UI.renderTick(payload));

    E().on('speaking', (payload) => {
      if (payload && payload.active) {
        global.UI.setSpeech(payload.text || '', true);
      } else {
        global.UI.setSpeech('');
      }
      global.UI.renderVoiceChip(global.Voice.getState());
    });

    E().on('paused', () => {
      global.UI.renderCountdown({ active: false });
    });

    E().on('winner', ({ winners, ball }) => {
      global.UI.paintDrawing(false);
      global.UI.render(E().state);
      global.UI.showVictory(winners, ball);
    });

    E().on('alertsNew', (fresh) => {
      // pequeno destaque do painel
      if (fresh.some((a) => a.level === 1)) {
        global.UI.toast('FALTA APENAS 1 NÚMERO!', 'gold', 2600);
      }
    });

    E().on('finished', () => {
      renderBackupList();
    });

    E().on('newGame', () => {
      global.UI.paintBall(null);
      global.UI.setSpeech('');
    });
  }

  /* ============================================================
     BOOTSTRAP
     ============================================================ */
  function bindModals() {
    document.querySelectorAll('#modalHost [data-close]').forEach((node) => {
      node.addEventListener('click', () => {
        const modal = node.closest('.modal');
        if (confirmResolve) { confirmResolve(false); return; }
        if (modal) closeModal(modal.id);
      });
    });

    const on = (id, ev, fn) => { const n = $(id); if (n) n.addEventListener(ev, fn); };

    on('btnPlayers', 'click', () => { resetPlayerForm(); renderPlayers(); openModal('modalPlayers'); });
    on('btnCards', 'click', () => { renderCards(); openModal('modalCards'); });

    on('btnSettings', 'click', () => {
      syncSettingsForm();
      fillVoiceSelect();
      openModal('modalSettings');
    });

    on('btnBackup', 'click', () => { renderBackupList(); openModal('modalBackup'); });

    on('btnHistoryFull', 'click', () => {
      global.UI.renderFullHistory(E().state.history);
      openModal('modalHistory');
    });

    on('playerForm', 'submit', submitPlayer);
    on('btnPlayerCancel', 'click', () => {
      resetPlayerForm();
      $('playerCards').disabled = false;
    });
    on('playerSearch', 'input', B.debounce(renderPlayers, 160));
    on('btnPlayersExport', 'click', () => global.Players.exportCsv());
    on('btnPlayersImport', 'click', () => openImport('players'));

    if ($('playersTbody')) {
      $('playersTbody').addEventListener('click', (ev) => {
        const edit = ev.target.closest('[data-edit-player]');
        const del = ev.target.closest('[data-del-player]');
        const cards = ev.target.closest('[data-cards-player]');
        if (edit) editPlayer(edit.dataset.editPlayer);
        if (del) deletePlayer(del.dataset.delPlayer);
        if (cards) {
          const id = cards.dataset.cardsPlayer;
          renderCards();
          openModal('modalCards');
          if ($('cardFilterPlayer')) {
            $('cardFilterPlayer').value = id;
            renderCards();
          }
        }
      });
    }

    on('btnGenCards', 'click', () => {
      const playerId = $('genPlayer').value;
      const qty = parseInt($('genQty').value, 10) || 1;
      const prefix = $('genPrefix').value || 'C';
      const res = global.CardManager.generate(playerId, qty, prefix);
      if (!res.ok) return global.UI.toast(res.error, 'err');
      global.UI.toast(`${res.added} cartela(s) gerada(s).`, 'ok');
      renderCards();
      renderPlayers();
    });

    on('btnManualCard', 'click', () => {
      const form = $('manualCardForm');
      if (form.hidden) {
        buildManualGrid();
        if ($('genPlayer').value && $('manualPlayer')) $('manualPlayer').value = $('genPlayer').value;
        form.hidden = false;
        if ($('manualCardError')) $('manualCardError').hidden = true;
      } else {
        form.hidden = true;
      }
    });
    on('manualCardForm', 'submit', submitManualCard);
    on('btnManualCancel', 'click', () => { $('manualCardForm').hidden = true; });

    on('cardSearch', 'input', B.debounce(renderCards, 160));
    on('cardFilterPlayer', 'change', renderCards);
    on('btnCardsExport', 'click', () => global.CardManager.exportCsv());
    on('btnPrintSelectedCards', 'click', () => printCards(global.CardManager.all().filter(c => selectedCardIds.has(c.id))));
    on('btnPrintAllCards', 'click', () => printCards(global.CardManager.all()));
    on('cardsSelectVisible', 'change', (ev) => { const visible = global.CardManager.search($('cardSearch')?.value || '', $('cardFilterPlayer')?.value || ''); visible.forEach(c => ev.target.checked ? selectedCardIds.add(c.id) : selectedCardIds.delete(c.id)); renderCards(); });
    on('btnCardsImport', 'click', () => openImport('cards'));

    on('btnCardsClear', 'click', async () => {
      const n = global.CardManager.count();
      if (!n) return global.UI.toast('Nenhuma cartela para remover.', 'warn');
      const ok = await confirmDialog('Remover cartelas', `Remover as ${n} cartelas cadastradas? Os participantes serão mantidos.`, 'Remover');
      if (!ok) return;
      global.CardManager.clearAll();
      renderCards();
      renderPlayers();
      global.UI.toast(`${n} cartela(s) removida(s).`, 'ok');
    });

    if ($('cardsTbody')) {
      $('cardsTbody').addEventListener('click', async (ev) => {
        const select = ev.target.closest('[data-select-card]');
        if (select) { select.checked ? selectedCardIds.add(select.dataset.selectCard) : selectedCardIds.delete(select.dataset.selectCard); return; }
        const view = ev.target.closest('[data-view-card]');
        const del = ev.target.closest('[data-del-card]');
        if (view) viewCard(view.dataset.viewCard);
        if (del) {
          const id = del.dataset.delCard;
          const card = global.CardManager.byId(id);
          const ok = await confirmDialog('Excluir cartela', `Excluir a cartela ${card ? card.code : ''}?`, 'Excluir');
          if (!ok) return;
          global.CardManager.remove(id);
          renderCards();
          renderPlayers();
          global.UI.toast('Cartela excluída.', 'ok');
        }
      });
    }

    on('importCsvFile', 'change', handleImportFile);
    on('btnImportConfirm', 'click', confirmImport);

    on('btnConfirmYes', 'click', () => { if (confirmResolve) confirmResolve(true); });
    on('btnConfirmNo', 'click', () => { if (confirmResolve) confirmResolve(false); });
  }

  function boot() {
    // 1) dados persistidos
    global.Players.load();
    global.CardManager.load();
    S().load();

    const hadGame = E().load();

    // 2) UI base
    global.UI.init();

    // 3) locutor
    global.Voice.init({
      onStateChange: (st) => {
        global.UI.renderVoiceChip(st);
        fillVoiceSelect();
      },
      onSpeakText: (text, active) => {
        if (active) global.UI.setSpeech(text, true);
      }
    });
    global.Voice.setVoice(S().get('voiceURI'));
    global.Voice.setMuted(!!S().get('muted'));

    // 4) ligações
    bindModals();
    bindControls();
    bindSettingsForm();
    bindBackup();
    bindVictory();
    bindKeyboard();
    bindEngine();

    // 5) render inicial
    global.UI.render(E().state);
    syncSettingsForm();
    fillVoiceSelect();
    renderPlayers();
    renderCards();
    renderBackupList();

    // 6) restauração após recarregar a página
    if (hadGame && E().state.history.length) {
      global.UI.toast(`Partida recuperada: ${E().state.history.length} bolas sorteadas.`, 'info', 4200);
    } else if (!E().state.history.length) {
      global.UI.paintBall(null);
    }

    // 7) desbloqueio de áudio no primeiro gesto
    const unlock = () => {
      global.Sound.unlock();
      global.Sound.setVolume(S().get('sfxVolume'));
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });

    // 8) salva ao sair (proteção extra)
    global.addEventListener('beforeunload', () => {
      try { E().persistNow(); } catch (e) { /* noop */ }
    });

    // 9) se o navegador carregar vozes depois
    [400, 1500, 3200].forEach((d) => setTimeout(() => {
      fillVoiceSelect();
      global.UI.renderVoiceChip(global.Voice.getState());
    }, d));

    // 10) atualiza relógio/estatísticas periodicamente enquanto ativo
    setInterval(() => {
      if (E().isActive()) global.UI.renderStats(E().stats());
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);

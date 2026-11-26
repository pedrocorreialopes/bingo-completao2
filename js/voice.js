/* ============================================================
   voice.js — VoiceAnnouncer (LOCUTOR BINGO)
   Narração em português do Brasil via Web Speech API.

   Regras implementadas:
   - anuncia somente bolas sorteadas
   - pronúncia natural da letra e do número por extenso
   - fila sequencial: nunca inicia fala sobre fala
   - permite repetir a última chamada
   - silenciamento instantâneo (cancel)
   - fallback visual quando não há suporte/voz
   ============================================================ */
(function (global) {
  'use strict';

  const B = global.Bingo;

  const synth = global.speechSynthesis || null;
  const supported = !!(synth && global.SpeechSynthesisUtterance);

  let voices = [];
  let voicesReady = false;
  let selectedURI = '';          // '' = escolher automaticamente
  let lastSpoken = null;         // { text, num }
  let speaking = false;
  let queue = [];                // fila própria (mais confiável que a do browser)
  let currentUtterance = null;
  let generation = 0;            // invalida callbacks antigos após cancel()
  let pendingTimer = null;
  let onStateChange = null;
  let onSpeakText = null;        // hook para fallback/legenda na tela
  let muted = false;

  /** Pontuação de preferência de voz (maior = melhor) */
  function scoreVoice(v) {
    const name = (v.name || '').toLowerCase();
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    let score = 0;

    // idioma
    if (lang === 'pt-br') score += 120;
    else if (lang.startsWith('pt-br')) score += 110;
    else if (lang === 'pt-br' || lang === 'pt_br') score += 110;
    else if (lang.startsWith('pt')) score += 55;
    else score -= 260;

    // vozes masculinas brasileiras conhecidas (Windows/Chrome/Android/macOS)
    const male = [
      'daniel', 'antonio', 'antônio', 'ricardo', 'felipe', 'marcos',
      'microsoft daniel', 'microsoft antonio', 'microsoft francisco',
      'google português do brasil', 'luciano', 'joao', 'joão', 'thiago'
    ];
    const female = ['maria', 'luciana', 'francisca', 'heloisa', 'heloísa', 'joana', 'fernanda', 'catarina', 'beatriz'];

    if (male.some((m) => name.includes(m))) score += 90;
    if (female.some((f) => name.includes(f))) score += 10;

    // nomes de motores com boa qualidade
    if (name.includes('natural') || name.includes('neural')) score += 45;
    if (name.includes('premium') || name.includes('enhanced')) score += 25;
    if (name.includes('compact') || name.includes('eloquence')) score -= 40;
    if (v.localService) score += 8;
    return score;
  }

  function refreshVoices() {
    if (!supported) return [];
    let raw = [];
    try { raw = synth.getVoices() || []; } catch (e) { raw = []; }
    if (!raw.length) return voices;

    voices = raw.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a));
    voicesReady = true;
    if (onStateChange) onStateChange(buildState());
    return voices;
  }

  /** Lista de vozes agrupada: preferidas pt-BR primeiro */
  function listVoices() {
    if (!voices.length) refreshVoices();
    return voices.slice();
  }

  function ptVoices() {
    return listVoices().filter((v) => {
      const lang = (v.lang || '').toLowerCase().replace('_', '-');
      return lang.startsWith('pt');
    });
  }

  function pickVoice() {
    const all = listVoices();
    if (!all.length) return null;

    if (selectedURI) {
      const found = all.find((v) => v.voiceURI === selectedURI || v.name === selectedURI);
      if (found) return found;
    }
    const brs = ptVoices();
    if (brs.length) {
      // já ordenado por pontuação: o primeiro é o melhor pt-BR
      return brs[0];
    }
    return all[0] || null;
  }

  /** Snapshot do estado do locutor (função local, usada nos callbacks) */
  function buildState() {
    const v = pickVoice();
    return {
      supported,
      speaking,
      muted,
      voiceName: v ? v.name : null,
      voiceLang: v ? v.lang : null,
      voiceCount: voices.length,
      ptCount: ptVoices().length,
      queued: queue.length
    };
  }

  function speakNow(text, opts) {
    if (!supported || muted) return false;
    const o = opts || {};
    const S = global.Settings ? global.Settings.state : {};

    const u = new global.SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang || 'pt-BR';
    } else {
      u.lang = 'pt-BR';
    }
    u.rate = B.clamp(Number(S.rate) || 0.95, 0.5, 2);
    u.pitch = B.clamp(Number(S.pitch) || 1, 0.5, 2);
    u.volume = B.clamp(o.volume != null ? o.volume : (Number(S.volume) || 1), 0, 1);

    const gen = generation;

    u.onstart = () => {
      if (gen !== generation) return;
      speaking = true;
      if (onStateChange) onStateChange(buildState());
      if (onSpeakText) onSpeakText(text, true);
    };

    u.onend = () => {
      if (gen !== generation) return;
      speaking = false;
      currentUtterance = null;
      if (onStateChange) onStateChange(buildState());
      if (onSpeakText) onSpeakText(text, false);
      drain();
    };

    u.onerror = (ev) => {
      if (gen !== generation) return;
      speaking = false;
      currentUtterance = null;
      if (onStateChange) onStateChange(buildState());
      if (onSpeakText) onSpeakText(text, false);
      // 'interrupted'/'canceled' não é erro real
      if (ev && ev.error && ev.error !== 'interrupted' && ev.error !== 'canceled') {
        console.warn('[locutor] erro na fala:', ev.error);
      }
      drain();
    };

    currentUtterance = u;
    try {
      // limpa resíduos apenas se o motor ainda estiver ocupado
      if (synth.speaking || synth.pending) synth.cancel();
      synth.speak(u);
    } catch (e) {
      console.warn('[locutor] falha ao falar', e);
      speaking = false;
      drain();
      return false;
    }

    // Watchdog: alguns motores não disparam onend (ex.: Chrome com aba em background)
    const estimated = Math.max(1600, text.length * 95 + 900);
    const genAtStart = generation;
    setTimeout(() => {
      if (genAtStart !== generation) return;
      if (currentUtterance === u && speaking) {
        speaking = false;
        currentUtterance = null;
        if (onStateChange) onStateChange(buildState());
        if (onSpeakText) onSpeakText(text, false);
        drain();
      }
    }, estimated + 2600);

    return true;
  }

  function drain() {
    if (speaking || !queue.length) {
      if (!speaking && !queue.length) {
        speaking = false;
        if (onStateChange) onStateChange(buildState());
      }
      return;
    }
    const item = queue.shift();
    speaking = true; // reserva o canal antes do onstart
    const ok = speakNow(item.text, item.opts);
    if (!ok) {
      // sem suporte/mudo: consome a fila emitindo apenas o callback visual
      speaking = false;
      if (onSpeakText) onSpeakText(item.text, false);
      drain();
    }
  }

  const Voice = {
    get supported() { return supported; },
    get speaking() { return speaking; },
    get voicesReady() { return voicesReady; },

    init(hooks) {
      const h = hooks || {};
      onStateChange = h.onStateChange || null;
      onSpeakText = h.onSpeakText || null;

      if (!supported) {
        if (onStateChange) onStateChange(this.getState());
        return;
      }
      refreshVoices();
      // as vozes carregam de forma assíncrona em vários navegadores
      if (synth.addEventListener) {
        synth.addEventListener('voiceschanged', refreshVoices);
      } else {
        synth.onvoiceschanged = refreshVoices;
      }
      // tenta novamente algumas vezes (Chrome/Safari às vezes demoram)
      [120, 500, 1200, 2600].forEach((d) => setTimeout(refreshVoices, d));
    },

    setVoice(uri) {
      selectedURI = uri || '';
      return pickVoice();
    },

    /** Lista completa de vozes disponíveis, já ordenada por preferência */
    listVoices() { return listVoices(); },

    /** Somente as vozes em português */
    ptVoices() { return ptVoices(); },

    /** Reconsulta as vozes no sistema (após o usuário instalar uma nova) */
    refreshVoices() { return refreshVoices(); },

    /** URI efetivamente usada */
    activeVoice() { return pickVoice(); },

    setMuted(value) {
      muted = !!value;
      if (muted) this.stop();
      if (onStateChange) onStateChange(this.getState());
    },

    /**
     * Enfileira um texto. Nunca fala por cima de outra fala.
     * @returns {Promise<void>} resolve quando termina (ou imediatamente sem suporte)
     */
    say(text, opts) {
      const o = opts || {};
      if (!text) return Promise.resolve();
      if (muted && !o.force) {
        if (onSpeakText) onSpeakText(text, false);
        return Promise.resolve();
      }

      // Se a fila estiver vazia e nada estiver tocando, fala direto.
      queue.push({ text, opts: o });
      if (!speaking) {
        speaking = true;
        const item = queue.shift();
        const gen = generation;
        const ok = speakNow(item.text, item.opts);
        if (!ok) {
          speaking = false;
          if (onSpeakText) onSpeakText(item.text, false);
        }
        void gen;
      }

      return new Promise((resolve) => {
        const start = Date.now();
        const poll = setInterval(() => {
          if (!speaking && !queue.length) {
            clearInterval(poll);
            resolve();
          } else if (Date.now() - start > 40000) {
            clearInterval(poll);
            resolve();
          }
        }, 110);
      });
    },

    /** Anúncio de uma bola: "Bê, número sete" */
    announceBall(num, opts) {
      const o = opts || {};
      const S = global.Settings ? global.Settings.state : {};
      const text = B.speechFor(num, {
        prefix: o.prefix != null ? o.prefix : S.announcePrefix,
        withLetterRepeat: o.repeatLetter != null ? o.repeatLetter : S.repeatLetter
      });
      lastSpoken = { text, num, at: Date.now() };
      return this.say(text, o);
    },

    /** Repete a última chamada (sem novo sorteio) */
    repeatLast() {
      if (!lastSpoken) return Promise.resolve('Nenhuma bola anunciada ainda.');
      return this.say(lastSpoken.text, { force: false }).then(() => lastSpoken.text);
    },

    getLastSpoken() { return lastSpoken; },

    /** Interrompe imediatamente (silenciar) */
    stop() {
      generation++;
      queue = [];
      speaking = false;
      currentUtterance = null;
      clearTimeout(pendingTimer);
      if (supported) {
        try { synth.cancel(); } catch (e) { /* noop */ }
      }
      if (onStateChange) onStateChange(this.getState());
    },

    /** Fala de teste */
    test(text) {
      const t = text || 'Bê, número sete. Boa sorte a todos!';
      return this.say(t, { force: true });
    },

    /** Texto da vitória a partir do template */
    buildVictoryText(winners) {
      const S = global.Settings ? global.Settings.state : {};
      const tpl = (S.victoryTemplate || 'Temos bingo! Parabéns, {nome}, cartela {cartela}!').trim();
      if (!winners || !winners.length) return 'Temos bingo!';

      if (winners.length === 1) {
        const w = winners[0];
        return tpl
          .replace(/\{nome\}/gi, w.playerName || 'participante')
          .replace(/\{cartela\}/gi, w.codeSpoken || w.code || '');
      }

      const names = winners.map((w) => `${w.playerName}, cartela ${w.codeSpoken || w.code}`).join('; ');
      return `Temos bingo! Temos ${winners.length} ganhadores: ${names}. Parabéns a todos!`;
    },

    getState() { return buildState(); },

    /** Descarta a fila mas mantém a fala atual */
    clearQueue() { queue = []; }
  };

  global.Voice = Voice;
})(window);

/* Código compartilhado entre a página do questionário e a página de resultados. */
(() => {
  'use strict';

  const LETRAS = 'ABCDEFGHIJ';
  const CORES = ['#0f766e', '#f59e0b', '#6366f1', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#64748b'];
  const soma = (v) => v.reduce((a, b) => a + b, 0);
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  /** Carrega as perguntas (fonte única, a mesma usada pelo servidor). */
  async function carregarPerguntas() {
    const r = await fetch('/questions.json');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /**
   * Conexão em tempo real (Server-Sent Events; o navegador reconecta sozinho).
   * Atualiza o indicador #status do cabeçalho e chama aoReceber(dados) a cada atualização.
   * dados = { counts, participantes, online }
   */
  function conectarTempoReal(aoReceber) {
    const el = document.getElementById('status');
    let ultimo = null;

    function definirStatus(ligado) {
      if (!el) return;
      el.className = 'status ' + (ligado ? 'on' : 'off');
      const texto = ligado
        ? `Ao vivo${ultimo ? ' · ' + plural(ultimo.online, 'pessoa online', 'pessoas online') : ''}`
        : 'Reconectando…';
      el.querySelector('span').textContent = texto;
    }

    const es = new EventSource('/api/stream');
    es.addEventListener('dados', (e) => {
      try { ultimo = JSON.parse(e.data); } catch (_) { return; }
      definirStatus(true);
      aoReceber(ultimo);
    });
    es.onerror = () => definirStatus(false);
    return es;
  }

  window.Questionario = { LETRAS, CORES, soma, plural, carregarPerguntas, conectarTempoReal };
})();

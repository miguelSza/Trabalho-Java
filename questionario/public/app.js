(() => {
  'use strict';

  const { LETRAS, plural, carregarPerguntas, conectarTempoReal } = window.Questionario;
  const STORE_KEY = 'questionario-socioeconomico:v1';
  const $ = (id) => document.getElementById(id);

  let CATEGORIAS = null; // vem de /questions.json
  let dados = null;      // último estado recebido do servidor: { counts, participantes, online }

  const estado = {
    participantId: null,
    cat: null,
    i: 0,
    resp: {},          // resp[categoria][indicePergunta] = indiceAlternativa
    outra: {},         // outra[categoria] = texto do campo "Outra. Qual?"
    concluidas: new Set(),
  };

  // ---------------------------------------------------------------------------
  // Persistência local (rascunho + identificador anônimo do participante)
  // ---------------------------------------------------------------------------
  function novoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  function carregarLocal() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (s && typeof s.participantId === 'string') {
        estado.participantId = s.participantId;
        estado.resp = s.resp || {};
        estado.outra = s.outra || {};
        estado.concluidas = new Set(s.concluidas || []);
      }
    } catch (_) { /* armazenamento indisponível: segue sem rascunho */ }
    if (!estado.participantId) estado.participantId = novoId();
    Object.keys(CATEGORIAS).forEach((c) => { estado.resp[c] = estado.resp[c] || {}; });
    // descarta categorias salvas que não existem mais
    estado.concluidas = new Set([...estado.concluidas].filter((c) => c in CATEGORIAS));
  }

  function salvarLocal() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        participantId: estado.participantId,
        resp: estado.resp,
        outra: estado.outra,
        concluidas: [...estado.concluidas],
      }));
    } catch (_) { /* ignora */ }
  }

  // ---------------------------------------------------------------------------
  // Telas
  // ---------------------------------------------------------------------------
  function mostrar(tela) {
    ['home', 'quiz', 'fim'].forEach((t) => ($(t).hidden = t !== tela));
    window.scrollTo(0, 0);
  }
  const telaAtual = () => ['home', 'quiz', 'fim'].find((t) => !$(t).hidden);

  function montarHome() {
    const box = $('cards');
    box.innerHTML = '';
    Object.entries(CATEGORIAS).forEach(([chave, c]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat';
      b.innerHTML = `<div class="ic"></div><h2></h2><p></p><span class="cnt"></span>` +
        (estado.concluidas.has(chave) ? `<span class="tag">Concluído</span>` : '');
      b.querySelector('.ic').textContent = c.icone;
      b.querySelector('h2').textContent = c.titulo;
      b.querySelector('p').textContent = c.desc;
      b.querySelector('.cnt').dataset.cat = chave;
      b.onclick = () => iniciar(chave);
      box.appendChild(b);
    });
    atualizarContadoresHome();
    mostrar('home');
  }

  function atualizarContadoresHome() {
    document.querySelectorAll('.cnt[data-cat]').forEach((el) => {
      const n = dados ? dados.participantes[el.dataset.cat] || 0 : 0;
      el.textContent = dados ? plural(n, 'participante', 'participantes') : '';
    });
  }

  function iniciar(cat) {
    estado.cat = cat;
    estado.i = 0;
    render();
    mostrar('quiz');
  }

  const perguntaAtual = () => CATEGORIAS[estado.cat].perguntas[estado.i];

  function render() {
    const c = CATEGORIAS[estado.cat];
    const p = perguntaAtual();
    const sel = estado.resp[estado.cat][estado.i];
    $('cat-titulo').textContent = 'Questionário ' + c.titulo;
    $('pergunta-num').textContent = `Pergunta ${estado.i + 1} de ${c.perguntas.length}`;
    $('barra').style.width = ((estado.i + 1) / c.perguntas.length) * 100 + '%';
    $('pergunta-texto').textContent = p.texto;
    $('erro').textContent = '';
    $('avancar').disabled = false;
    $('avancar').textContent = estado.i === c.perguntas.length - 1 ? 'Concluir' : 'Avançar';

    const lista = $('opcoes');
    lista.innerHTML = '';
    p.opcoes.forEach((txt, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opcao' + (sel === k ? ' sel' : '');
      b.innerHTML = `<span class="letra"></span><span class="t"></span>`;
      b.querySelector('.letra').textContent = LETRAS[k];
      b.querySelector('.t').textContent = txt;
      b.onclick = () => {
        estado.resp[estado.cat][estado.i] = k;
        salvarLocal();
        render();
      };
      lista.appendChild(b);
    });

    // Campo opcional "Outra. Qual?"
    const mostrarCampo = p.outra && sel === p.opcoes.length - 1;
    $('outra-txt').hidden = !mostrarCampo;
    $('outra-txt').value = estado.outra[estado.cat] || '';
  }

  // ---------------------------------------------------------------------------
  // Navegação e envio
  // ---------------------------------------------------------------------------
  function avancar() {
    const c = CATEGORIAS[estado.cat];
    if (estado.resp[estado.cat][estado.i] === undefined) {
      $('erro').textContent = 'Selecione uma alternativa para continuar.';
      return;
    }
    if (estado.i < c.perguntas.length - 1) {
      estado.i++;
      render();
    } else {
      concluir();
    }
  }

  function voltar() {
    if (estado.i > 0) {
      estado.i--;
      render();
    } else {
      montarHome();
    }
  }

  async function concluir() {
    const c = CATEGORIAS[estado.cat];
    const respostas = c.perguntas.map((_, k) => estado.resp[estado.cat][k]);
    const btn = $('avancar');
    btn.disabled = true;
    btn.textContent = 'Enviando…';
    $('erro').textContent = '';

    try {
      const r = await fetch('/api/respostas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantId: estado.participantId,
          categoria: estado.cat,
          respostas,
          outra: estado.outra[estado.cat] || '',
        }),
      });
      if (!r.ok) {
        const corpo = await r.json().catch(() => ({}));
        throw new Error(corpo.erro || 'Não foi possível enviar suas respostas.');
      }
    } catch (e) {
      $('erro').textContent = (e instanceof TypeError ? 'Sem conexão com o servidor.' : e.message) + ' Tente novamente.';
      btn.disabled = false;
      btn.textContent = 'Concluir';
      return;
    }

    estado.concluidas.add(estado.cat);
    salvarLocal();
    telaFim();
  }

  function telaFim() {
    const c = CATEGORIAS[estado.cat];
    const todas = estado.concluidas.size === Object.keys(CATEGORIAS).length;
    $('fim-titulo').textContent = todas
      ? 'Parabéns! Você concluiu todos os questionários.'
      : `Questionário ${c.titulo} concluído!`;
    $('fim-msg').textContent =
      'Obrigado por responder! Suas respostas (anônimas) foram enviadas. Veja o resultado geral na página de resultados.';
    const acoes = $('fim-acoes');
    acoes.innerHTML = '';
    Object.entries(CATEGORIAS).forEach(([chave, cat]) => {
      if (!estado.concluidas.has(chave)) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = 'Ir para ' + cat.titulo;
        b.onclick = () => iniciar(chave);
        acoes.appendChild(b);
      }
    });
    const rev = document.createElement('button');
    rev.className = 'btn sec';
    rev.textContent = 'Revisar respostas';
    rev.onclick = () => { estado.i = 0; render(); mostrar('quiz'); };
    const home = document.createElement('button');
    home.className = 'btn sec';
    home.textContent = 'Página inicial';
    home.onclick = montarHome;
    const res = document.createElement('a');
    res.className = 'btn sec';
    res.href = '/resultados';
    res.textContent = 'Ver resultados';
    acoes.append(rev, home, res);
    mostrar('fim');
  }

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------
  async function iniciarApp() {
    try {
      CATEGORIAS = await carregarPerguntas();
    } catch (_) {
      $('cards').innerHTML = '<p class="erro">Não foi possível carregar o questionário. Recarregue a página.</p>';
      return;
    }
    carregarLocal();
    $('avancar').onclick = avancar;
    $('voltar').onclick = voltar;
    $('outra-txt').oninput = (e) => {
      estado.outra[estado.cat] = e.target.value;
      salvarLocal();
    };
    montarHome();
    // Em tempo real só mantemos o contador de participantes da página inicial.
    conectarTempoReal((d) => {
      dados = d;
      if (telaAtual() === 'home') atualizarContadoresHome();
    });
  }

  iniciarApp();
})();

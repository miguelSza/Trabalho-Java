(() => {
  'use strict';

  const { LETRAS, CORES, soma, plural, carregarPerguntas, conectarTempoReal } = window.Questionario;
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

  /** Um gráfico por pergunta: graficos[categoria][indicePergunta] = { chart, card, ... } */
  const graficos = {};
  let CATEGORIAS = null;

  // ---------------------------------------------------------------------------
  // Montagem da página (uma vez): categorias → cartões de pergunta
  // ---------------------------------------------------------------------------
  function criarCartao(cat, i, p) {
    const card = document.createElement('article');
    card.className = 'qcard';
    card.id = `${cat}-${i + 1}`;
    card.innerHTML = `
      <span class="qnum"></span>
      <h3></h3>
      <p class="sub"></p>
      <div class="grafico-box">
        <canvas role="img"></canvas>
        <div class="vazio" hidden>Nenhuma resposta registrada ainda</div>
      </div>
      <ul class="leg"></ul>`;
    card.querySelector('.qnum').textContent = `Pergunta ${i + 1}`;
    card.querySelector('h3').textContent = p.texto;
    const canvas = card.querySelector('canvas');
    canvas.setAttribute('aria-label', `Gráfico de pizza: ${p.texto}`);

    const cores = p.opcoes.map((_, k) => CORES[k % CORES.length]);
    const chart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels: p.opcoes.map((t, k) => `${LETRAS[k]}) ${t}`),
        datasets: [{
          data: p.opcoes.map(() => 0),
          backgroundColor: cores,
          borderColor: '#fff',
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }, // a legenda é a lista abaixo do gráfico
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const t = soma(ctx.dataset.data);
                return ` ${plural(ctx.parsed, 'pessoa', 'pessoas')} (${pct(ctx.parsed, t)}%)`;
              },
            },
          },
          datalabels: {
            color: '#fff',
            font: { weight: 'bold', size: 13 },
            display: (ctx) => {
              const t = soma(ctx.dataset.data);
              return t > 0 && ctx.dataset.data[ctx.dataIndex] / t >= 0.05;
            },
            formatter: (valor, ctx) => pct(valor, soma(ctx.dataset.data)) + '%',
          },
        },
      },
    });

    // Legenda fixa (cores + texto); os números são preenchidos em preencher()
    const leg = card.querySelector('.leg');
    p.opcoes.forEach((t, k) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="cor"></span><span class="txt"></span><span class="num"></span>';
      li.querySelector('.cor').style.background = cores[k];
      li.querySelector('.txt').textContent = `${LETRAS[k]}) ${t}`;
      leg.appendChild(li);
    });
    const rodape = document.createElement('li');
    rodape.innerHTML = '<span class="txt"><strong>Total</strong></span><span class="num"><strong></strong></span>';
    leg.appendChild(rodape);

    return { card, chart, canvas, n: p.opcoes.length };
  }

  function montar() {
    const raiz = $('resultados');
    const links = $('nav-cat-links');
    raiz.innerHTML = '';
    links.innerHTML = '';

    Object.entries(CATEGORIAS).forEach(([chave, c]) => {
      graficos[chave] = [];

      const a = document.createElement('a');
      a.href = '#cat-' + chave;
      a.innerHTML = '<span></span><small></small>';
      a.querySelector('span').textContent = `${c.icone} ${c.titulo}`;
      a.querySelector('small').dataset.part = chave;
      links.appendChild(a);

      const sec = document.createElement('section');
      sec.className = 'categoria';
      sec.id = 'cat-' + chave;
      sec.innerHTML = '<header><h2></h2><span class="qtd"></span></header><div class="grade"></div>';
      sec.querySelector('h2').textContent = `${c.icone} Questionário ${c.titulo}`;
      sec.querySelector('.qtd').dataset.part = chave;
      const grade = sec.querySelector('.grade');
      c.perguntas.forEach((p, i) => {
        const g = criarCartao(chave, i, p);
        graficos[chave].push(g);
        grade.appendChild(g.card);
      });
      raiz.appendChild(sec);
    });
    $('nav-cat').hidden = false;
  }

  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------------------
  // Atualização (a cada evento do servidor): só altera dados, não recria nada
  // ---------------------------------------------------------------------------
  function preencher(dados) {
    Object.entries(CATEGORIAS).forEach(([chave, c]) => {
      const partic = (dados.participantes && dados.participantes[chave]) || 0;
      const txt = plural(partic, 'participante', 'participantes');
      document.querySelectorAll(`[data-part="${chave}"]`).forEach((el) => {
        el.textContent = el.tagName === 'SMALL' ? txt : `${plural(c.perguntas.length, 'pergunta', 'perguntas')} · ${txt}`;
      });

      c.perguntas.forEach((p, i) => {
        const g = graficos[chave][i];
        const linha = dados.counts && dados.counts[chave] && dados.counts[chave][i];
        const v = p.opcoes.map((_, k) => (linha && Number.isFinite(linha[k]) ? linha[k] : 0));
        const total = soma(v);

        g.chart.data.datasets[0].data = v;
        g.chart.update();

        g.card.querySelector('.vazio').hidden = total > 0;
        g.canvas.classList.toggle('oculto', total === 0);
        g.card.querySelector('.sub').textContent = total
          ? plural(total, 'resposta', 'respostas')
          : 'Sem respostas';

        const itens = g.card.querySelectorAll('.leg li');
        v.forEach((n, k) => {
          itens[k].querySelector('.num').textContent = `${plural(n, 'pessoa', 'pessoas')} · ${pct(n, total)}%`;
        });
        itens[v.length].querySelector('strong:last-child').textContent = plural(total, 'resposta', 'respostas');
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------
  async function iniciar() {
    try {
      CATEGORIAS = await carregarPerguntas();
    } catch (_) {
      $('resultados').innerHTML = '<p class="erro">Não foi possível carregar as perguntas. Recarregue a página.</p>';
      return;
    }
    Chart.register(ChartDataLabels);
    montar();
    conectarTempoReal(preencher); // o 1º evento já traz o estado atual; os seguintes, as novas respostas
  }

  iniciar();
})();

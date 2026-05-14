/**
 * Lógica principal da interface
 */

const App = (() => {
  // Seletores do DOM
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let relatorioAtual = null;
  let sortCol = null;
  let sortAsc = true;
  let autocompleteIndex = -1;

  /* Inicialização */
  async function init() {
    mostrarLoading(true);
    try {
      await DataService.carregar();
      popularPeriodos();
      bindEventos();
      mostrarLoading(false);
      mostrarEstadoInicial();
    } catch (err) {
      mostrarLoading(false);
      mostrarToast(err.message, 'error');
    }
  }

  /* Eventos da tela */
  function bindEventos() {
    // Campo de busca
    const inputBusca = $('#search-input');
    inputBusca.addEventListener('input', onInputBusca);
    inputBusca.addEventListener('keydown', onKeydownBusca);
    inputBusca.addEventListener('focus', () => {
      if (inputBusca.value.trim().length >= 2) onInputBusca();
    });

    // Fecha sugestões ao clicar fora
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-wrapper')) {
        fecharAutocomplete();
      }
    });

    // Botão de busca
    $('#btn-buscar').addEventListener('click', executarBusca);

    // Botão de limpar
    $('#btn-limpar').addEventListener('click', limparBusca);

    // Troca de período
    $('#select-periodo').addEventListener('change', () => {
      if (relatorioAtual) executarBusca();
    });

    // Fecha o painel de detalhes
    $('#detail-close').addEventListener('click', fecharDetalhe);
    $('#detail-overlay').addEventListener('click', fecharDetalhe);

    // Escape fecha painel e sugestões
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        fecharDetalhe();
        fecharAutocomplete();
      }
    });

    // Enter executa a busca
    inputBusca.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && autocompleteIndex === -1) {
        executarBusca();
      }
    });
  }

  /* Autocomplete */
  function onInputBusca() {
    const texto = $('#search-input').value;
    const lista = $('#autocomplete-list');

    // Limpa erro anterior
    $('#search-input').classList.remove('input--error');
    setInputHint('');

    if (texto.trim().length < 2) {
      fecharAutocomplete();
      return;
    }

    const resultados = DataService.buscarAlunos(texto);
    if (resultados.length === 0) {
      fecharAutocomplete();
      return;
    }

    lista.innerHTML = resultados
      .map(
        (a, i) => `
      <div class="autocomplete-item" data-matricula="${a.matricula}" data-index="${i}"
           role="option" tabindex="-1">
        <span>${destacarTexto(a.nome, texto)}</span>
        <span class="autocomplete-item__matricula">${a.matricula}</span>
      </div>`
      )
      .join('');

    // Eventos das sugestões
    lista.querySelectorAll('.autocomplete-item').forEach((item) => {
      item.addEventListener('click', () => selecionarAluno(item.dataset.matricula));
      item.addEventListener('mouseenter', () => {
        autocompleteIndex = parseInt(item.dataset.index);
        atualizarHighlight();
      });
    });

    lista.classList.add('active');
    autocompleteIndex = -1;
  }

  function onKeydownBusca(e) {
    const lista = $('#autocomplete-list');
    const items = lista.querySelectorAll('.autocomplete-item');
    if (!lista.classList.contains('active') || items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autocompleteIndex = Math.min(autocompleteIndex + 1, items.length - 1);
      atualizarHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autocompleteIndex = Math.max(autocompleteIndex - 1, 0);
      atualizarHighlight();
    } else if (e.key === 'Enter' && autocompleteIndex >= 0) {
      e.preventDefault();
      selecionarAluno(items[autocompleteIndex].dataset.matricula);
    }
  }

  function atualizarHighlight() {
    const items = $$('#autocomplete-list .autocomplete-item');
    items.forEach((el, i) => {
      el.classList.toggle('highlighted', i === autocompleteIndex);
    });
    // Mantém o item visível
    if (items[autocompleteIndex]) {
      items[autocompleteIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function fecharAutocomplete() {
    $('#autocomplete-list').classList.remove('active');
    autocompleteIndex = -1;
  }

  function selecionarAluno(matricula) {
    const aluno = DataService.getAlunoPorMatricula(matricula);
    if (aluno) {
      // Preenche o campo com o aluno selecionado
      $('#search-input').value = `${aluno.nome} (${aluno.matricula})`;
      $('#search-input').dataset.matricula = matricula;
      fecharAutocomplete();
      executarBusca();
    }
  }

  function destacarTexto(texto, busca) {
    const regex = new RegExp(`(${escapeRegex(busca)})`, 'gi');
    return texto.replace(regex, '<strong>$1</strong>');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /* Busca e renderização */
  function executarBusca() {
    const input = $('#search-input');
    const matricula = input.dataset.matricula;
    const periodo = $('#select-periodo').value;

    // Validação da busca
    if (!matricula) {
      // Tenta localizar pelo texto digitado
      const texto = input.value.trim();
      if (!texto) {
        input.classList.add('input--error');
        setInputHint('Digite o nome ou a matrícula do aluno.', true);
        input.focus();
        return;
      }
      const resultados = DataService.buscarAlunos(texto);
      if (resultados.length === 1) {
        // Se encontrou apenas um, seleciona automaticamente
        input.dataset.matricula = resultados[0].matricula;
        input.value = `${resultados[0].nome} (${resultados[0].matricula})`;
        return executarBusca();
      } else if (resultados.length > 1) {
        setInputHint('Selecione um aluno da lista de sugestões.', true);
        onInputBusca(); // reabre sugestões
        return;
      } else {
        input.classList.add('input--error');
        setInputHint('Nenhum aluno encontrado com esse termo.', true);
        return;
      }
    }

    const relatorio = DataService.getRelatorioFaltas(matricula, periodo);
    if (!relatorio) {
      mostrarToast('Aluno não encontrado.', 'error');
      return;
    }

    relatorioAtual = relatorio;
    sortCol = null;
    sortAsc = true;
    renderizarRelatorio(relatorio);
  }

  function limparBusca() {
    const input = $('#search-input');
    input.value = '';
    delete input.dataset.matricula;
    input.classList.remove('input--error');
    setInputHint('');
    fecharAutocomplete();
    fecharDetalhe();
    relatorioAtual = null;

    $('#results-area').innerHTML = '';
    mostrarEstadoInicial();
    input.focus(); // volta o foco para a busca
  }

  /* Renderização do relatório */
  function renderizarRelatorio(rel) {
    const area = $('#results-area');

    const { aluno, resumo, linhas, periodo } = rel;
    const initials = aluno.nome
      .split(' ')
      .filter((_, i, a) => i === 0 || i === a.length - 1)
      .map((w) => w[0])
      .join('');

    // Define o status geral
    let statusGeral = 'safe';
    if (resumo.disciplinasRisco > 0) statusGeral = 'danger';
    else if (resumo.disciplinasAtencao > 0) statusGeral = 'warn';

    area.innerHTML = `
      <!-- Dados do aluno -->
      <div class="student-info">
        <div class="student-info__avatar" aria-hidden="true">${initials}</div>
        <div class="student-info__details">
          <h2 class="student-info__name">${aluno.nome}</h2>
          <div class="student-info__meta">
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><path d="M16 3v4M8 3v4M2 9h20"/></svg>
              ${periodo}
            </span>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/></svg>
              ${aluno.curso}
            </span>
            <span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6"/></svg>
              Mat. ${aluno.matricula}
            </span>
          </div>
        </div>
      </div>

      <!-- Resumo geral -->
      <div class="summary-section">
        <div class="summary-grid">
          <div class="summary-card summary-card--info">
            <div class="summary-card__label">Disciplinas</div>
            <div class="summary-card__value">${resumo.totalDisciplinas}</div>
            <div class="summary-card__detail">${resumo.totalAulas} aulas lançadas</div>
          </div>
          <div class="summary-card summary-card--${statusGeral}">
            <div class="summary-card__label">Total de Faltas</div>
            <div class="summary-card__value">${resumo.totalFaltas}</div>
            <div class="summary-card__detail">${resumo.percentualGeral}% geral</div>
          </div>
          <div class="summary-card summary-card--${resumo.disciplinasAtencao > 0 ? 'warn' : 'safe'}">
            <div class="summary-card__label">Em Atenção</div>
            <div class="summary-card__value">${resumo.disciplinasAtencao}</div>
            <div class="summary-card__detail">entre 15% e 25%</div>
          </div>
          <div class="summary-card summary-card--${resumo.disciplinasRisco > 0 ? 'danger' : 'safe'}">
            <div class="summary-card__label">Em Risco</div>
            <div class="summary-card__value">${resumo.disciplinasRisco}</div>
            <div class="summary-card__detail">≥ 25% de faltas</div>
          </div>
        </div>
      </div>

      <!-- Tabela de disciplinas -->
      <div class="table-section">
        <div class="table-header">
          <h3 class="table-header__title">Detalhamento por Disciplina</h3>
          <div class="legend" aria-label="Legenda de status">
            <div class="legend__item"><span class="legend__dot legend__dot--safe"></span> Adequado</div>
            <div class="legend__item"><span class="legend__dot legend__dot--warn"></span> Atenção</div>
            <div class="legend__item"><span class="legend__dot legend__dot--danger"></span> Risco</div>
          </div>
        </div>
        <div class="table-wrapper" role="region" aria-label="Tabela de faltas por disciplina" tabindex="0">
          <table class="table" id="tabela-faltas">
            <thead>
              <tr>
                <th data-col="codigo" scope="col">Código <span class="sort-icon">▲</span></th>
                <th data-col="nome" scope="col">Componente Curricular <span class="sort-icon">▲</span></th>
                <th data-col="aulasLancadas" scope="col">Aulas <span class="sort-icon">▲</span></th>
                <th data-col="faltas" scope="col">Faltas <span class="sort-icon">▲</span></th>
                <th data-col="percentual" scope="col">% Faltas <span class="sort-icon">▲</span></th>
                <th data-col="status" scope="col">Status <span class="sort-icon">▲</span></th>
              </tr>
            </thead>
            <tbody id="tabela-body"></tbody>
          </table>
        </div>
      </div>

      <!-- Painel de ajuda -->
      <div class="help-panel">
        <button class="help-panel__toggle" id="help-toggle" type="button" aria-expanded="false" aria-controls="help-content">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
            <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
          </svg>
          Entenda os indicadores de frequência
          <span class="help-panel__chevron" aria-hidden="true">▼</span>
        </button>
        <div class="help-panel__content" id="help-content" hidden>

          <div class="help-panel__block">
            <h4 class="help-panel__subtitle">Regra dos 25%</h4>
            <p>
              Conforme a <strong>LDB (Lei nº 9.394/96)</strong> e o regimento interno do IFC, o aluno precisa ter no mínimo <strong>75% de presença</strong> nas aulas de cada disciplina para ser aprovado. Isso significa que o <strong>limite máximo de faltas é 25%</strong> do total de aulas lançadas. Ultrapassar esse limite resulta em <strong>reprovação por infrequência</strong>, independentemente das notas obtidas.
            </p>
          </div>

          <div class="help-panel__block">
            <h4 class="help-panel__subtitle">Como ler a barra de progresso</h4>
            <p>
              A barra ao lado do percentual representa visualmente quanto do limite de 25% já foi consumido. Quando a barra está completamente preenchida, o aluno atingiu ou ultrapassou o limite de faltas naquela disciplina.
            </p>
          </div>

          <div class="help-panel__block">
            <h4 class="help-panel__subtitle">Significado dos status</h4>
            <div class="help-panel__statuses">
              <div class="help-panel__status-item">
                <span class="status-badge status-badge--safe">
                  <span class="status-badge__dot"></span>
                  Adequado
                </span>
                <p>Menos de 15% de faltas. Situação confortável, mas é importante manter a frequência regular.</p>
              </div>
              <div class="help-panel__status-item">
                <span class="status-badge status-badge--warn">
                  <span class="status-badge__dot"></span>
                  Atenção
                </span>
                <p>Entre 15% e 24,9% de faltas. O aluno está se aproximando do limite. Cada falta adicional conta muito nesse estágio.</p>
              </div>
              <div class="help-panel__status-item">
                <span class="status-badge status-badge--danger">
                  <span class="status-badge__dot"></span>
                  Risco
                </span>
                <p>25% ou mais de faltas. O aluno já atingiu ou ultrapassou o limite permitido e está em situação de reprovação por infrequência.</p>
              </div>
              <div class="help-panel__status-item">
                <span class="status-badge status-badge--neutral">
                  <span class="status-badge__dot"></span>
                  Sem aulas
                </span>
                <p>Nenhuma aula foi lançada até o momento para esta disciplina. O cálculo de frequência ainda não se aplica.</p>
              </div>
            </div>
          </div>

          <div class="help-panel__block">
            <h4 class="help-panel__subtitle">Exemplo prático</h4>
            <p>
              Se uma disciplina tem <strong>20 aulas lançadas</strong>, o máximo de faltas permitido é <strong>5</strong> (25% de 20). Com 4 faltas o aluno está em <em>atenção</em> (20%), e com 5 ou mais entra em <em>risco</em> de reprovação.
            </p>
          </div>

        </div>
      </div>
    `;

    renderizarLinhasTabela(linhas);
    bindOrdenacao();
    bindLinhasTabela();
    bindHelpToggle();

    // Avisa quando houver disciplina em risco
    if (resumo.disciplinasRisco > 0) {
      mostrarToast(
        `⚠️ ${resumo.disciplinasRisco} disciplina(s) com risco de reprovação por falta!`,
        'warn'
      );
    }
  }

  function renderizarLinhasTabela(linhas) {
    const tbody = $('#tabela-body');
    tbody.innerHTML = linhas
      .map(
        (l) => `
      <tr data-codigo="${l.codigo}" tabindex="0" role="button" title="Pressione Enter para ver detalhes" aria-label="${l.nome}: ${l.faltas} faltas">
        <td class="col-code">${l.codigo}</td>
        <td class="col-name">${l.nome}</td>
        <td class="col-number">${l.aulasLancadas || '—'}</td>
        <td class="col-number">${l.faltas}</td>
        <td class="col-number">
          ${l.aulasLancadas > 0 ? l.percentual + '%' : '—'}
          ${l.aulasLancadas > 0 ? `
          <div class="progress-bar" data-tooltip="Limite: 25%">
            <div class="progress-bar__fill progress-bar__fill--${l.status}" style="width: ${Math.min(l.percentual / 25 * 100, 100)}%"></div>
          </div>` : ''}
        </td>
        <td>
          <span class="status-badge status-badge--${l.status}">
            <span class="status-badge__dot"></span>
            ${statusLabel(l.status)}
          </span>
        </td>
      </tr>`
      )
      .join('');
  }

  function statusLabel(status) {
    const labels = {
      safe: 'Adequado',
      warn: 'Atenção',
      danger: 'Risco',
      neutral: 'Sem aulas',
    };
    return labels[status] || status;
  }

  /* Painel de ajuda */
  function bindHelpToggle() {
    const toggle = $('#help-toggle');
    const content = $('#help-content');
    if (!toggle || !content) return;

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      content.hidden = expanded;
      toggle.querySelector('.help-panel__chevron').textContent = expanded ? '▼' : '▲';
    });
  }

  /* Ordenação da tabela */
  function bindOrdenacao() {
    $$('#tabela-faltas th[data-col]').forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) {
          sortAsc = !sortAsc;
        } else {
          sortCol = col;
          sortAsc = true;
        }

        // Atualiza o cabeçalho ordenado
        $$('#tabela-faltas th').forEach((h) => h.classList.remove('sorted'));
        th.classList.add('sorted');
        th.querySelector('.sort-icon').textContent = sortAsc ? '▲' : '▼';

        const sorted = [...relatorioAtual.linhas].sort((a, b) => {
          let va = a[col],
            vb = b[col];
          if (typeof va === 'string') va = va.toLowerCase();
          if (typeof vb === 'string') vb = vb.toLowerCase();
          if (va < vb) return sortAsc ? -1 : 1;
          if (va > vb) return sortAsc ? 1 : -1;
          return 0;
        });

        renderizarLinhasTabela(sorted);
        bindLinhasTabela();
      });
    });
  }

  /* Detalhe da disciplina */
  function bindLinhasTabela() {
    $$('#tabela-body tr').forEach((tr) => {
      tr.addEventListener('click', () => abrirDetalhe(tr.dataset.codigo));
      // Permite abrir pelo teclado
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          abrirDetalhe(tr.dataset.codigo);
        }
      });
    });
  }

  function abrirDetalhe(codigo) {
    if (!relatorioAtual) return;
    const linha = relatorioAtual.linhas.find((l) => l.codigo === codigo);
    if (!linha) return;

    const panel = $('#detail-panel');
    const overlay = $('#detail-overlay');

    // Monta os dados do painel
    $('#detail-title').textContent = linha.nome;
    $('#detail-body').innerHTML = `
      <div class="detail-panel__info-row">
        <span class="detail-panel__info-label">Código</span>
        <span class="detail-panel__info-value" style="font-family:var(--font-mono)">${linha.codigo}</span>
      </div>
      <div class="detail-panel__info-row">
        <span class="detail-panel__info-label">Aulas Lançadas</span>
        <span class="detail-panel__info-value">${linha.aulasLancadas || '—'}</span>
      </div>
      <div class="detail-panel__info-row">
        <span class="detail-panel__info-label">Faltas</span>
        <span class="detail-panel__info-value">${linha.faltas}</span>
      </div>
      <div class="detail-panel__info-row">
        <span class="detail-panel__info-label">Percentual</span>
        <span class="detail-panel__info-value">${linha.aulasLancadas > 0 ? linha.percentual + '%' : '—'}</span>
      </div>
      <div class="detail-panel__info-row">
        <span class="detail-panel__info-label">Status</span>
        <span class="status-badge status-badge--${linha.status}">
          <span class="status-badge__dot"></span>
          ${statusLabel(linha.status)}
        </span>
      </div>
      ${
        linha.aulasLancadas > 0
          ? `
      <div class="detail-panel__info-row">
        <span class="detail-panel__info-label">Faltas restantes</span>
        <span class="detail-panel__info-value">${Math.max(0, Math.floor(linha.aulasLancadas * 0.25) - linha.faltas)} até o limite</span>
      </div>`
          : ''
      }

      ${
        linha.datasFaltas.length > 0
          ? `
      <div class="absence-dates">
        <div class="absence-dates__title">Datas das Faltas</div>
        <ul class="absence-dates__list">
          ${linha.datasFaltas.map((d) => `<li class="absence-dates__item">${formatarData(d)}</li>`).join('')}
        </ul>
      </div>`
          : '<p style="margin-top:var(--space-lg);color:var(--gray-400);font-size:0.9rem;">Nenhuma falta registrada nesta disciplina. 🎉</p>'
      }
    `;

    panel.classList.add('open');
    overlay.classList.add('open');
    // Foca no botão de fechar
    $('#detail-close').focus();
    // Evita scroll da página ao abrir o painel
    document.body.style.overflow = 'hidden';
  }

  function fecharDetalhe() {
    $('#detail-panel').classList.remove('open');
    $('#detail-overlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* Funções auxiliares da interface */
  function popularPeriodos() {
    const select = $('#select-periodo');
    const periodos = DataService.getPeriodos();
    select.innerHTML = periodos
      .map((p, i) => `<option value="${p}" ${i === 0 ? 'selected' : ''}>${p}</option>`)
      .join('');
  }

  function mostrarEstadoInicial() {
    const area = $('#results-area');
    area.innerHTML = `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <h2 class="empty-state__title">Relatório de Faltas por Período</h2>
        <p class="empty-state__text">
          Pesquise pelo nome ou matrícula de um aluno para visualizar o relatório detalhado de frequência no período selecionado.
        </p>
      </div>
    `;
  }

  function mostrarLoading(show) {
    const area = $('#results-area');
    if (show) {
      area.innerHTML = `
        <div class="loading" role="status" aria-label="Carregando dados">
          <div class="spinner"></div>
          <span>Carregando dados...</span>
        </div>`;
    }
  }

  function setInputHint(msg, isError = false) {
    const hint = $('#input-hint');
    hint.textContent = msg;
    hint.className = isError ? 'input-hint input-hint--error' : 'input-hint';
  }

  function formatarData(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  let toastTimeout;
  function mostrarToast(msg, type = 'info') {
    const toast = $('#toast');
    toast.textContent = msg;
    toast.className = `toast toast--${type} show`;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  /* Start */
  document.addEventListener('DOMContentLoaded', init);

  return { init };
})();
/**
 * Dados e consultas do monitor de faltas
 */

const DataService = (() => {
  let _data = null;

  /**
   * Carrega os dados dos alunos.
   */
  async function carregar() {
    try {
      const resp = await fetch('./data/alunos.json');
      if (!resp.ok) throw new Error(`Erro ao carregar dados (${resp.status})`);
      _data = await resp.json();
      return _data;
    } catch (err) {
      console.error('DataService.carregar:', err);
      throw new Error(
        'Não foi possível carregar os dados dos alunos. Verifique sua conexão e tente novamente.'
      );
    }
  }

  function getData() {
    return _data;
  }

  /**
   * Retorna os períodos disponíveis.
   */
  function getPeriodos() {
    return _data ? _data.periodos : [];
  }

  /**
   * Busca alunos por nome ou matrícula.
   */
  function buscarAlunos(texto) {
    if (!_data || !texto || texto.trim().length < 2) return [];
    const termo = texto.trim().toLowerCase();
    return _data.alunos.filter(
      (a) =>
        a.nome.toLowerCase().includes(termo) ||
        a.matricula.includes(termo)
    );
  }

  /**
   * Busca aluno pela matrícula.
   */
  function getAlunoPorMatricula(matricula) {
    if (!_data) return null;
    return _data.alunos.find((a) => a.matricula === matricula) || null;
  }

  /**
   * Organiza as disciplinas pelo código.
   */
  function getDisciplinasMap() {
    if (!_data) return {};
    const map = {};
    _data.disciplinas.forEach((d) => (map[d.codigo] = d));
    return map;
  }

  /**
   * Monta o relatório de faltas do aluno no período informado.
   */
  function getRelatorioFaltas(matricula, periodo) {
    const aluno = getAlunoPorMatricula(matricula);
    if (!aluno) return null;

    const discMap = getDisciplinasMap();
    const inscricoes = aluno.matriculas.filter((m) => m.periodo === periodo);

    const linhas = inscricoes.map((m) => {
      const disc = discMap[m.disciplina] || {
        codigo: m.disciplina,
        nome: 'Disciplina desconhecida',
      };
      const totalFaltas = m.faltas.length;
      const percentual =
        m.aulasLancadas > 0
          ? ((totalFaltas / m.aulasLancadas) * 100).toFixed(1)
          : 0;

      let status;
      if (m.aulasLancadas === 0) {
        status = 'neutral';
      } else if (percentual < 15) {
        status = 'safe';
      } else if (percentual < 25) {
        status = 'warn';
      } else {
        status = 'danger';
      }

      return {
        codigo: disc.codigo,
        nome: disc.nome,
        aulasLancadas: m.aulasLancadas,
        faltas: totalFaltas,
        percentual: parseFloat(percentual),
        status,
        datasFaltas: [...m.faltas].sort(),
      };
    });

    // Calcula o resumo geral
    const totalAulas = linhas.reduce((s, l) => s + l.aulasLancadas, 0);
    const totalFaltas = linhas.reduce((s, l) => s + l.faltas, 0);
    const disciplinasRisco = linhas.filter((l) => l.status === 'danger').length;
    const disciplinasAtencao = linhas.filter((l) => l.status === 'warn').length;

    return {
      aluno,
      periodo,
      linhas,
      resumo: {
        totalDisciplinas: linhas.length,
        totalAulas,
        totalFaltas,
        percentualGeral:
          totalAulas > 0 ? ((totalFaltas / totalAulas) * 100).toFixed(1) : '0.0',
        disciplinasRisco,
        disciplinasAtencao,
      },
    };
  }

  return {
    carregar,
    getData,
    getPeriodos,
    buscarAlunos,
    getAlunoPorMatricula,
    getDisciplinasMap,
    getRelatorioFaltas,
  };
})();
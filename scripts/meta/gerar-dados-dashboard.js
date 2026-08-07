// Gera o JSON de um cliente no formato do dashboard de trafego da Vertice.
// Saida: Projetos/vertice/dashboards/trafego/dados/<slug>.json
//
// Uso: node src/gerar-dados-dashboard.js <slug>
//      node src/gerar-dados-dashboard.js cfc-academy
//
// O formato e o de dados/_EXEMPLO-cliente.json: serie_diaria e a fonte de
// verdade e o dashboard deriva os totais dela conforme o filtro de periodo.

const fs = require('fs');
const path = require('path');
const meta = require('./meta-client');

// ---------------------------------------------------------------
// Clientes configurados. Para adicionar outro, crie uma entrada
// aqui e outra em dados/clientes.json do dashboard.
// ---------------------------------------------------------------
const CLIENTES = {
  'cfc-academy': {
    slug: 'cfc-academy',
    nome: 'CFC Academy',
    segmento: 'Educação',
    conta: 'act_530764754757626',
    objetivo: 'vendas',
    rotulo_resultado: 'Compras',
    // Acao da Meta que conta como "resultado" deste cliente.
    acao_resultado: 'purchase',
    // Quantos meses de historico puxar.
    meses: 6,
    metas: {
      investimento_previsto: 4000,
      custo_por_resultado_alvo: 40,
      resultados_alvo: 80,
    },
  },
};

// Copia usada pela automacao: grava em scripts/dados/.
const DESTINO = path.join(__dirname, '..', 'dados');

const num = (v) => Number(v || 0);

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

function mesesAtras(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

// Soma as ocorrencias de uma acao num registro de insights.
function contarAcao(registro, tipo) {
  const acoes = registro.actions || [];
  const achada = acoes.find((a) => a.action_type === tipo);
  return achada ? num(achada.value) : 0;
}

// O resultado do cliente e uma acao so — a definida em 'acao_resultado'.
// A conta tem campanhas de venda, de conversa e de topo de funil, mas o
// painel conta apenas a acao principal em todos os niveis (serie, campanha,
// anuncio, publico). Um anuncio de engajamento aparece com 0 compras porque
// e isso que ele entregou: mistura de moedas numa coluna so engana mais do
// que informa.

// ---------------------------------------------------------------
// Serie diaria — a fonte de verdade do dashboard.
// ---------------------------------------------------------------
async function serieDiaria(cfg, desde, ate) {
  const r = await meta.get(`${cfg.conta}/insights`, {
    fields: 'spend,impressions,reach,clicks,actions',
    time_range: JSON.stringify({ since: desde, until: ate }),
    time_increment: 1,
    limit: 500,
  });

  return (r.data || []).map((d) => ({
    data: d.date_start,
    investimento: num(d.spend),
    resultados: contarAcao(d, cfg.acao_resultado),
    impressoes: num(d.impressions),
    alcance: num(d.reach),
    cliques: num(d.clicks),
  }));
}

// ---------------------------------------------------------------
// Alcance real do periodo (deduplicado) — nao e a soma dos dias.
// ---------------------------------------------------------------
async function alcanceDoPeriodo(cfg, desde, ate) {
  const r = await meta.get(`${cfg.conta}/insights`, {
    fields: 'reach,frequency',
    time_range: JSON.stringify({ since: desde, until: ate }),
  });
  const d = (r.data || [])[0] || {};
  return { alcance: num(d.reach), frequencia: num(d.frequency) };
}

// ---------------------------------------------------------------
// Campanhas com investimento no periodo.
// ---------------------------------------------------------------
async function campanhas(cfg, desde, ate) {
  const r = await meta.get(`${cfg.conta}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: desde, until: ate }),
    level: 'campaign',
    limit: 300,
  });

  const lista = (r.data || []).map((d) => ({
    id: d.campaign_id,
    nome: d.campaign_name,
    investimento: num(d.spend),
    resultados: contarAcao(d, cfg.acao_resultado),
    impressoes: num(d.impressions),
    cliques: num(d.clicks),
  }));

  // O status atual nao e mais puxado: ele descreve o agora, enquanto o
  // investimento e do periodo filtrado. Juntos na mesma linha davam a
  // impressao de que uma campanha pausada estaria gastando.

  return lista.filter((c) => c.investimento > 0)
              .sort((a, b) => b.investimento - a.investimento);
}

// O relatorio nao mostra anuncio individual (decisao de 2026-08-07): e
// detalhe operacional da assessoria, nao do cliente. Por isso o nivel 'ad'
// nao e mais puxado — eram 40 chamadas extras por rodada.

// ---------------------------------------------------------------
// Quebra por idade e genero.
// ---------------------------------------------------------------
async function publico(cfg, desde, ate) {
  try {
    const r = await meta.get(`${cfg.conta}/insights`, {
      fields: 'spend,actions',
      time_range: JSON.stringify({ since: desde, until: ate }),
      breakdowns: 'age,gender',
      limit: 200,
    });

    return (r.data || [])
      .map((d) => ({
        faixa: d.age,
        genero: d.gender,
        investimento: num(d.spend),
        resultados: contarAcao(d, cfg.acao_resultado),
      }))
      .filter((x) => x.investimento > 0)
      .sort((a, b) => b.investimento - a.investimento);
  } catch (e) {
    console.log(`  aviso: demografia nao carregada (${e.message})`);
    return [];
  }
}

// ---------------------------------------------------------------
async function main() {
  const slug = process.argv[2] || 'cfc-academy';
  const cfg = CLIENTES[slug];

  if (!cfg) {
    console.error(`Cliente "${slug}" nao configurado.`);
    console.error(`Disponiveis: ${Object.keys(CLIENTES).join(', ')}`);
    process.exit(1);
  }

  const desde = mesesAtras(cfg.meses);
  const ate = hojeISO();

  console.log(`Gerando dados de ${cfg.nome} (${desde} a ${ate})...`);

  const [serie, alc, camps, pub] = await Promise.all([
    serieDiaria(cfg, desde, ate),
    alcanceDoPeriodo(cfg, desde, ate),
    campanhas(cfg, desde, ate),
    publico(cfg, desde, ate),
  ]);

  console.log(`  ${serie.length} dias de serie`);
  console.log(`  ${camps.length} campanhas com investimento`);
  console.log(`  ${pub.length} recortes de publico`);

  const saida = {
    _gerado_por: 'vertice-meta-api/src/gerar-dados-dashboard.js',
    cliente: {
      slug: cfg.slug,
      nome: cfg.nome,
      segmento: cfg.segmento,
      objetivo: cfg.objetivo,
      rotulo_resultado: cfg.rotulo_resultado,
      moeda: 'BRL',
    },
    periodo_disponivel: {
      de: serie.length ? serie[0].data : desde,
      ate: serie.length ? serie[serie.length - 1].data : ate,
      atualizado_em: new Date().toISOString(),
    },
    serie_diaria: serie,
    alcance_periodo: alc.alcance,
    frequencia_periodo: alc.frequencia,
    metas: cfg.metas,
    campanhas: camps,
    publico: { idade_genero: pub },
    comercial: {
      ativo: false,
      fonte: 'planilha',
      leads_recebidos: null,
      leads_atendidos: null,
      agendamentos: null,
      vendas: null,
      faturamento: null,
    },
  };

  fs.mkdirSync(DESTINO, { recursive: true });
  const arquivo = path.join(DESTINO, `${cfg.slug}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2), 'utf8');

  const totalGasto = serie.reduce((a, x) => a + x.investimento, 0);
  const totalRes = serie.reduce((a, x) => a + x.resultados, 0);

  console.log(`\nGravado em dashboards/trafego/dados/${cfg.slug}.json`);
  console.log(`Periodo: R$ ${totalGasto.toFixed(2)} | ${totalRes} ${cfg.rotulo_resultado.toLowerCase()}`);
}

main().catch((e) => {
  console.error('\nFALHA AO GERAR OS DADOS');
  console.error(e.message);
  if (e.metaError) console.error(JSON.stringify(e.metaError, null, 2));
  process.exit(1);
});

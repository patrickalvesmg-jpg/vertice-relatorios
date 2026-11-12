// Coleta por grupo de produto e por criativo ativo.
// Complementa gerar-dados-dashboard.js, que continua cuidando dos totais
// da conta inteira.
//
// Nasceu para a CFC Academy, mas o mapa de produtos agora e escolhido por
// cliente (12/11/2026, entrada da Vital Clean): criarColeta(mapa) recebe o
// modulo grupos-<cliente>.js. O export padrao continua sendo o da CFC, para
// nenhum script antigo quebrar.
const meta = require('./meta-client');
const mapaCfc = require('./grupos-cfc');

const num = (v) => Number(v || 0);

function contarAcao(registro, tipo) {
  if (!tipo) return 0;
  const a = (registro.actions || []).find((x) => x.action_type === tipo);
  return a ? num(a.value) : 0;
}

// Divide [desde, ate] (AAAA-MM-DD) em janelas de no maximo 31 dias,
// sem buraco nem sobreposicao: { since, until } prontas para time_range.
function janelasMensais(desde, ate) {
  const dia = (s) => new Date(s + 'T00:00:00Z');
  const iso = (d) => d.toISOString().slice(0, 10);
  const fim = dia(ate);
  const saida = [];
  let ini = dia(desde);
  while (ini <= fim) {
    const corte = new Date(ini);
    corte.setUTCDate(corte.getUTCDate() + 30);
    const ate_ = corte < fim ? corte : fim;
    saida.push({ since: iso(ini), until: iso(ate_) });
    ini = new Date(ate_);
    ini.setUTCDate(ini.getUTCDate() + 1);
  }
  return saida;
}

// `apelido` e opcional: troca o nome tecnico da campanha por um nome
// legivel no relatorio do cliente. O agrupamento sempre usa o nome real.
function criarColeta({ GRUPOS, OUTROS, grupoDaCampanha, apelido = (n) => n }) {

// ---------------------------------------------------------------
// Serie diaria por campanha. E a base de tudo: agrupando por produto
// se obtem a serie do grupo, e somando por mes se obtem a visao mensal.
// Uma chamada so (time_increment=1 + level=campaign) em vez de uma por
// campanha.
// ---------------------------------------------------------------
async function serieDiariaPorCampanha(conta, desde, ate) {
  let corpo = await meta.get(`${conta}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,reach,clicks,actions',
    time_range: JSON.stringify({ since: desde, until: ate }),
    level: 'campaign',
    time_increment: 1,
    limit: 500,
  });

  const linhas = [...(corpo.data || [])];

  // A conta tem muita campanha antiga: sem paginar, perde-se dia.
  let guarda = 0;
  while (corpo.paging && corpo.paging.next && guarda < 40) {
    corpo = await meta.getUrl(corpo.paging.next);
    linhas.push(...(corpo.data || []));
    guarda++;
  }

  return linhas.map((d) => ({
    data: d.date_start,
    campanha_id: d.campaign_id,
    campanha: apelido(d.campaign_name),
    grupo: grupoDaCampanha(d.campaign_name).id,
    investimento: num(d.spend),
    impressoes: num(d.impressions),
    alcance: num(d.reach),
    cliques: num(d.clicks),
    acoes: (d.actions || []).reduce((acc, a) => {
      acc[a.action_type] = num(a.value);
      return acc;
    }, {}),
  }));
}

// ---------------------------------------------------------------
// Monta, para cada grupo, a serie diaria ja com o resultado contado
// na moeda certa daquele produto.
// ---------------------------------------------------------------
function seriesPorGrupo(linhas) {
  const todos = [...GRUPOS, OUTROS];
  const saida = {};

  for (const g of todos) {
    const doGrupo = linhas.filter((l) => l.grupo === g.id);
    if (!doGrupo.length) continue;

    const porDia = new Map();
    for (const l of doGrupo) {
      const d = porDia.get(l.data) || {
        data: l.data, investimento: 0, resultados: 0,
        secundario: 0, impressoes: 0, cliques: 0, alcance: 0,
      };
      d.investimento += l.investimento;
      d.impressoes += l.impressoes;
      d.cliques += l.cliques;
      // Soma diaria de alcance, nao deduplicada: a mesma pessoa pode
      // aparecer em dias diferentes. Serve de ordem de grandeza.
      d.alcance += l.alcance;
      d.resultados += l.acoes[g.acao_resultado] || 0;
      d.secundario += g.acao_secundaria ? (l.acoes[g.acao_secundaria] || 0) : 0;
      porDia.set(l.data, d);
    }

    const serie = [...porDia.values()].sort((a, b) => a.data.localeCompare(b.data));
    const invest = serie.reduce((s, x) => s + x.investimento, 0);
    if (invest <= 0) continue;

    const res = serie.reduce((s, x) => s + x.resultados, 0);
    const sec = serie.reduce((s, x) => s + x.secundario, 0);

    saida[g.id] = {
      id: g.id,
      nome: g.nome,
      descricao: g.descricao,
      rotulo_resultado: g.rotulo_resultado,
      rotulo_secundario: g.rotulo_secundario,
      investimento: Number(invest.toFixed(2)),
      resultados: res,
      secundario: g.acao_secundaria ? sec : null,
      custo_por_resultado: res > 0 ? Number((invest / res).toFixed(2)) : null,
      campanhas: [...new Set(doGrupo.map((l) => l.campanha))],
      serie_diaria: serie.map((d) => ({
        ...d, investimento: Number(d.investimento.toFixed(2)),
      })),
    };
  }

  return saida;
}

// ---------------------------------------------------------------
// Investimento por mes (conta inteira e por grupo).
// ---------------------------------------------------------------
function porMes(linhas) {
  const mapa = new Map();

  for (const l of linhas) {
    const mes = l.data.slice(0, 7);
    const m = mapa.get(mes) || { mes, investimento: 0, grupos: {} };
    m.investimento += l.investimento;

    const g = [...GRUPOS, OUTROS].find((x) => x.id === l.grupo);
    const gm = m.grupos[l.grupo] || {
      investimento: 0, resultados: 0, rotulo: g.rotulo_resultado,
    };
    gm.investimento += l.investimento;
    gm.resultados += l.acoes[g.acao_resultado] || 0;
    m.grupos[l.grupo] = gm;

    mapa.set(mes, m);
  }

  return [...mapa.values()]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map((m) => ({
      mes: m.mes,
      investimento: Number(m.investimento.toFixed(2)),
      grupos: Object.fromEntries(
        Object.entries(m.grupos).map(([k, v]) => [k, {
          ...v, investimento: Number(v.investimento.toFixed(2)),
        }])
      ),
    }));
}

// ---------------------------------------------------------------
// Criativos ATIVOS agora, com desempenho no periodo e link de preview.
//
// Duas verdades diferentes na mesma tabela, de proposito:
//   - o status e de AGORA (so entra quem esta rodando)
//   - o desempenho e do PERIODO filtrado
// Um criativo ligado ha 2 dias aparece com o gasto desses 2 dias.
// ---------------------------------------------------------------
// `gruposHistoricos`: ids de grupo que tambem trazem criativos PAUSADOS,
// desde que tenham gastado no periodo. Serve para produto que saiu do ar
// mas cujo aprendizado ainda interessa — o CFC Express, por exemplo:
// esta pausado, e saber qual criativo vendeu melhor orienta a proxima
// rodada. Cada criativo carrega `ativo`, e o painel marca os pausados.
async function criativosAtivos(conta, desde, ate, gruposHistoricos = []) {
  const querHistorico = new Set(gruposHistoricos);

  const campos = 'id,name,effective_status,campaign{id,name},creative{thumbnail_url,object_type},preview_shareable_link';
  const status = querHistorico.size
    ? ['ACTIVE', 'PAUSED', 'ADSET_PAUSED', 'CAMPAIGN_PAUSED']
    : ['ACTIVE'];

  // limit baixo de proposito: com PAUSED incluido a conta devolve
  // centenas de anuncios, e cada um carrega creative + preview. Em
  // paginas de 500 a Meta responde "reduce the amount of data".
  let rAds = await meta.get(`${conta}/ads`, {
    fields: campos,
    effective_status: JSON.stringify(status),
    limit: 50,
  });

  const brutos = [...(rAds.data || [])];
  let g2 = 0;
  while (rAds.paging && rAds.paging.next && g2 < 200) {
    rAds = await meta.getUrl(rAds.paging.next);
    brutos.push(...(rAds.data || []));
    g2++;
  }

  const ativos = new Map();
  for (const a of brutos) {
    const nomeCampanha = a.campaign ? a.campaign.name : '';
    const grupo = grupoDaCampanha(nomeCampanha).id;
    const estaAtivo = a.effective_status === 'ACTIVE';

    // Pausado so entra se for de um grupo marcado como historico.
    if (!estaAtivo && !querHistorico.has(grupo)) continue;

    ativos.set(a.id, {
      id: a.id,
      nome: a.name,
      campanha: nomeCampanha ? apelido(nomeCampanha) : null,
      grupo,
      ativo: estaAtivo,
      link: a.preview_shareable_link || null,
      miniatura: a.creative ? a.creative.thumbnail_url || null : null,
      tipo: a.creative ? a.creative.object_type || null : null,
    });
  }

  if (!ativos.size) return { lista: [], por_dia: [] };

  // 2) desempenho DIA A DIA, nivel anuncio. E por dia porque o painel
  // precisa recortar pelo filtro escolhido: com o total do periodo, um
  // criativo mostrava gasto de junho enquanto o filtro dizia agosto.
  //
  // Pedido em janelas de ~1 mes, uma depois da outra. Em 12/11/2026 o
  // pedido unico de 6 meses (nivel anuncio x dia) caia quase toda hora na
  // CFC com "Service temporarily unavailable" / "unknown error" mesmo
  // depois de 4 tentativas — a conta tem centenas de anuncios e a Meta
  // desiste no meio. Fatiado, cada pedido e leve e o resultado e o mesmo.
  const linhasAd = [];
  for (const janela of janelasMensais(desde, ate)) {
    let corpo = await meta.get(`${conta}/insights`, {
      fields: 'ad_id,spend,impressions,reach,clicks,actions',
      time_range: JSON.stringify(janela),
      level: 'ad',
      time_increment: 1,
      limit: 500,
    });
    linhasAd.push(...(corpo.data || []));
    let guarda = 0;
    while (corpo.paging && corpo.paging.next && guarda < 60) {
      corpo = await meta.getUrl(corpo.paging.next);
      linhasAd.push(...(corpo.data || []));
      guarda++;
    }
  }

  // serie por criativo, so dos que estao ativos
  const porDia = [];
  const insights = new Map();
  for (const d of linhasAd) {
    if (!ativos.has(d.ad_id)) continue;

    const g = [...GRUPOS, OUTROS].find((x) => x.id === ativos.get(d.ad_id).grupo);
    const gasto = num(d.spend);
    if (gasto > 0) {
      porDia.push({
        data: d.date_start,
        ad_id: d.ad_id,
        investimento: Number(gasto.toFixed(2)),
        resultados: contarAcao(d, g.acao_resultado),
      });
    }

    // acumulado do periodo inteiro, usado como fallback
    const a = insights.get(d.ad_id) || { spend: 0, impressions: 0, reach: 0, clicks: 0, acoes: {} };
    a.spend += gasto;
    a.impressions += num(d.impressions);
    a.reach += num(d.reach);
    a.clicks += num(d.clicks);
    for (const x of d.actions || []) a.acoes[x.action_type] = (a.acoes[x.action_type] || 0) + num(x.value);
    insights.set(d.ad_id, a);
  }

  const saida = [];
  for (const [id, base] of ativos) {
    const d = insights.get(id);
    const g = [...GRUPOS, OUTROS].find((x) => x.id === base.grupo);

    const investimento = d ? d.spend : 0;
    const resultados = d ? (d.acoes[g.acao_resultado] || 0) : 0;
    const secundario = d && g.acao_secundaria ? (d.acoes[g.acao_secundaria] || 0) : null;

    // Criativo pausado so entra se tiver gastado: a conta tem dezenas de
    // anuncios antigos parados que nunca entregaram nada, e listar todos
    // enterraria o que interessa. O ativo sem gasto continua aparecendo
    // (esmaecido) porque esta no ar e ainda pode entregar.
    if (!base.ativo && investimento <= 0) continue;

    saida.push({
      ...base,
      grupo_nome: g.nome,
      rotulo_resultado: g.rotulo_resultado,
      rotulo_secundario: g.rotulo_secundario,
      investimento: Number(investimento.toFixed(2)),
      resultados,
      secundario,
      custo_por_resultado: resultados > 0 ? Number((investimento / resultados).toFixed(2)) : null,
      impressoes: d ? d.impressions : 0,
      // soma diaria de alcance: nao e deduplicado (a mesma pessoa pode
      // aparecer em dias diferentes)
      alcance: d ? d.reach : 0,
      cliques: d ? d.clicks : 0,
      sem_dados_no_periodo: !d || investimento === 0,
    });
  }

  saida.sort((a, b) => {
    if (a.sem_dados_no_periodo !== b.sem_dados_no_periodo) return a.sem_dados_no_periodo ? 1 : -1;
    if (a.custo_por_resultado === null && b.custo_por_resultado === null) return b.investimento - a.investimento;
    if (a.custo_por_resultado === null) return 1;
    if (b.custo_por_resultado === null) return -1;
    return a.custo_por_resultado - b.custo_por_resultado;
  });

  // A serie por dia acompanha a lista: e o que permite o painel recortar
  // os criativos pelo filtro escolhido em vez de mostrar o periodo fixo.
  return { lista: saida, por_dia: porDia };
}

// ---------------------------------------------------------------
// Serie por campanha e por dia, enxuta, para o painel filtrar sem
// rateio. O rateio proporcional que existia antes dava numero errado:
// uma campanha que so gastou em maio recebia uma fatia do investimento
// de agosto e aparecia como se estivesse rodando agora.
// ---------------------------------------------------------------
function campanhasPorDia(linhas) {
  return linhas
    .filter((l) => l.investimento > 0)
    .map((l) => {
      const g = [...GRUPOS, OUTROS].find((x) => x.id === l.grupo);
      return {
        data: l.data,
        nome: l.campanha,
        grupo: l.grupo,
        grupo_nome: g.nome,
        rotulo_resultado: g.rotulo_resultado,
        investimento: Number(l.investimento.toFixed(2)),
        resultados: l.acoes[g.acao_resultado] || 0,
      };
    });
}

// ---------------------------------------------------------------
// Quantas campanhas de cada grupo estao ativas AGORA. E o que permite o
// painel dizer "parado" num produto que ainda aparece com gasto no
// periodo — caso do formulario de lead, desativado em agosto/2026.
// ---------------------------------------------------------------
async function statusDosGrupos(conta) {
  const r = await meta.get(`${conta}/campaigns`, {
    fields: 'name,effective_status',
    limit: 500,
  });

  const mapa = {};
  for (const c of r.data || []) {
    const id = grupoDaCampanha(c.name).id;
    const m = mapa[id] || { ativas: 0, total: 0 };
    m.total++;
    if (c.effective_status === 'ACTIVE') m.ativas++;
    mapa[id] = m;
  }
  return mapa;
}

  return {
    serieDiariaPorCampanha, seriesPorGrupo, porMes, criativosAtivos,
    campanhasPorDia, statusDosGrupos,
  };
}

module.exports = { ...criarColeta(mapaCfc), criarColeta };

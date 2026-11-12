// Coleta por TIPO DE RESULTADO, igual a coluna "Resultados" do Gerenciador.
//
// Criado em 12/11/2026, a pedido do Patrick: "personalizar cada relatorio
// de acordo com a campanha do cliente" — cliente com campanha de mensagem,
// de visita ao perfil e de compra ve as tres; cliente so de mensagem ve so
// mensagem.
//
// Em vez de um mapa escrito a mao por cliente (grupos-cfc.js, regex no nome
// da campanha), o tipo vem da propria Meta: o campo `results` do insights
// traz, para cada campanha e cada dia, o indicador que o Gerenciador usa
// (ex.: actions:onsite_conversion.messaging_conversation_started_7d,
// profile_visit_view, conversions:offsite_conversion.fb_pixel_custom.X) e o
// valor. Cliente novo nao precisa de configuracao: o relatorio se monta com
// os tipos que existem na conta.
//
// Campanha com conjuntos de objetivos diferentes vem com indicador "mixed"
// naquele dia; esses dias sao buscados no nivel conjunto, onde cada um tem
// o seu indicador. A campanha aparece entao em mais de um tipo.

const meta = require('./meta-client');
const { janelasMensais } = require('./coleta-cfc');

const num = (v) => Number(v || 0);

// Tipos conhecidos. `re` casa o indicador sem o prefixo actions:/conversions:.
// A ordem importa: o primeiro que casar vence.
const TIPOS = [
  { re: /messaging_conversation_started/, id: 'mensagens', nome: 'Mensagens', rotulo: 'Conversas iniciadas',
    descricao: 'Campanhas que levam para o WhatsApp ou o Direct' },
  { re: /^profile_visit_view$/, id: 'perfil', nome: 'Visitas ao perfil', rotulo: 'Visitas ao perfil',
    descricao: 'Campanhas que levam para o perfil do Instagram' },
  { re: /thruplay/, id: 'video', nome: 'Visualizações de vídeo', rotulo: 'Visualizações completas',
    descricao: 'Vídeo assistido até o fim ou por pelo menos 15 segundos' },
  { re: /^(offsite_conversion\.fb_pixel_purchase|purchase|omni_purchase|onsite_web_purchase|onsite_conversion\.purchase)$/,
    id: 'compras', nome: 'Vendas', rotulo: 'Compras', descricao: 'Compras registradas pelo pixel' },
  { re: /^(lead|onsite_conversion\.lead_grouped|offsite_conversion\.fb_pixel_lead|leadgen_grouped|onsite_web_lead)$/,
    id: 'leads', nome: 'Cadastros', rotulo: 'Leads', descricao: 'Formulários preenchidos' },
  { re: /complete_registration/, id: 'cadastros', nome: 'Cadastros no site', rotulo: 'Cadastros' },
  { re: /initiate_checkout/, id: 'checkout', nome: 'Checkout', rotulo: 'Checkouts iniciados' },
  { re: /landing_page_view/, id: 'site', nome: 'Visitas ao site', rotulo: 'Visualizações da página' },
  { re: /^link_click$/, id: 'cliques', nome: 'Tráfego', rotulo: 'Cliques no link' },
  { re: /post_engagement|page_engagement/, id: 'engajamento', nome: 'Engajamento', rotulo: 'Engajamentos' },
  { re: /^(like|onsite_conversion\.page_like)$/, id: 'curtidas', nome: 'Curtidas na página', rotulo: 'Curtidas' },
  { re: /^reach$/, id: 'alcance', nome: 'Alcance', rotulo: 'Pessoas alcançadas' },
  { re: /^impressions$/, id: 'impressoes', nome: 'Reconhecimento', rotulo: 'Impressões' },
];

const SEM_TIPO = { id: 'outros', nome: 'Outras campanhas', rotulo: 'Resultados',
  descricao: 'Campanhas sem um resultado definido no Gerenciador' };

// "LeadWhatsApp" -> "Lead WhatsApp"; "lead_qualificado" -> "lead qualificado"
function humanizar(t) {
  return String(t || '')
    .replace(/([a-zà-ú])([A-Z])/g, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .trim();
}

// Monta o tipo de um indicador. `rotulos` (do cliente) sobrescreve nome e
// rotulo por id do tipo ou pelo nome do evento do site.
function tipoDoIndicador(ind, rotulos, nomesConversao) {
  if (!ind) return { ...SEM_TIPO };
  const sobre = (chave) => rotulos[chave] || {};

  let m = ind.match(/fb_pixel_custom\.(.+)$/);
  if (m) {
    const ev = m[1], o = sobre(ev);
    return { id: 'ev-' + ev.toLowerCase(), nome: o.nome || humanizar(ev),
      rotulo: o.rotulo || humanizar(ev), descricao: o.descricao || 'Evento do site: ' + ev };
  }
  m = ind.match(/offsite_conversion\.custom\.(\d+)$/);
  if (m) {
    const id = m[1], o = sobre(id), n = nomesConversao[id] || 'Conversão ' + id;
    return { id: 'cc-' + id, nome: o.nome || n, rotulo: o.rotulo || n,
      descricao: o.descricao || 'Conversão personalizada do site' };
  }

  const base = ind.replace(/^(actions|conversions):/, '');
  const t = TIPOS.find((x) => x.re.test(base));
  if (t) {
    const o = sobre(t.id);
    return { id: t.id, nome: o.nome || t.nome, rotulo: o.rotulo || t.rotulo,
      descricao: o.descricao || t.descricao || '' };
  }
  const n = humanizar(base.split('.').pop());
  return { id: 'x-' + base.replace(/[^a-z0-9]+/gi, '-').toLowerCase(), nome: n, rotulo: n, descricao: '' };
}

function lerResultado(d) {
  const r = (d.results || [])[0];
  if (!r) return { ind: null, valor: 0 };
  const v = (r.values || [])[0];
  return { ind: r.indicator, valor: num(v && v.value) };
}

// Quando a Meta nao devolve `results` (acontece com campanha de formulario
// instantaneo: "[LEAD][FORMULARIO]" da CFC teve 759 leads e results vazio),
// o tipo sai da meta de otimizacao do conjunto, e o valor da acao
// correspondente em `actions`.
const ACAO_POR_OTIMIZACAO = {
  LEAD_GENERATION: 'lead',
  QUALITY_LEAD: 'lead',
  CONVERSATIONS: 'onsite_conversion.messaging_conversation_started_7d',
  REPLIES: 'onsite_conversion.messaging_conversation_started_7d',
  LINK_CLICKS: 'link_click',
  LANDING_PAGE_VIEWS: 'landing_page_view',
  POST_ENGAGEMENT: 'post_engagement',
  PAGE_LIKES: 'like',
};

function acaoDoConjunto(c) {
  if (!c) return null;
  if (ACAO_POR_OTIMIZACAO[c.optimization_goal]) return ACAO_POR_OTIMIZACAO[c.optimization_goal];
  const po = c.promoted_object || {};
  if (c.optimization_goal === 'OFFSITE_CONVERSIONS') {
    if (po.custom_conversion_id) return 'offsite_conversion.custom.' + po.custom_conversion_id;
    if (po.custom_event_type && po.custom_event_type !== 'OTHER')
      return 'offsite_conversion.fb_pixel_' + po.custom_event_type.toLowerCase();
  }
  return null;
}

async function acoesPorCampanha(ids) {
  const saida = {};
  for (const id of ids) {
    try {
      const r = await meta.get(`${id}/adsets`, { fields: 'optimization_goal,promoted_object', limit: 5 });
      saida[id] = acaoDoConjunto((r.data || [])[0]);
    } catch (e) {
      saida[id] = null;
    }
  }
  return saida;
}

function contarAcao(d, tipo) {
  const a = (d.actions || []).find((x) => x.action_type === tipo);
  return a ? num(a.value) : 0;
}

async function paginar(caminho, params) {
  let corpo = await meta.get(caminho, params);
  const out = [...(corpo.data || [])];
  let guarda = 0;
  while (corpo.paging && corpo.paging.next && guarda < 80) {
    corpo = await meta.getUrl(corpo.paging.next);
    out.push(...(corpo.data || []));
    guarda++;
  }
  return out;
}

async function nomesDasConversoes(conta) {
  try {
    const r = await meta.get(`${conta}/customconversions`, { fields: 'id,name', limit: 200 });
    return Object.fromEntries((r.data || []).map((c) => [c.id, c.name]));
  } catch (e) {
    console.log(`  aviso: nomes das conversões personalizadas não carregados (${e.message})`);
    return {};
  }
}

// ---------------------------------------------------------------
// Linhas campanha x dia, cada uma com o seu tipo de resultado.
// ---------------------------------------------------------------
async function linhasPorTipo(cfg, desde, ate) {
  const rotulos = cfg.rotulos || {};
  const apelido = cfg.apelido || ((n) => n);
  const nomesConversao = await nomesDasConversoes(cfg.conta);
  const campos = 'campaign_id,campaign_name,spend,impressions,reach,clicks,results,actions';

  const linhas = [];
  const mistos = new Set();          // "campanha|dia" que vieram como mixed
  const idsMistos = new Set();
  const semResultado = [];           // linhas sem `results`: tipo pela otimizacao

  const montar = (d, r) => ({
    data: d.date_start,
    campanha_id: d.campaign_id,
    campanha: apelido(d.campaign_name),
    tipo: tipoDoIndicador(r.ind, rotulos, nomesConversao),
    investimento: num(d.spend),
    impressoes: num(d.impressions),
    alcance: num(d.reach),
    cliques: num(d.clicks),
    resultados: r.valor,
  });

  for (const janela of janelasMensais(desde, ate)) {
    const rows = await paginar(`${cfg.conta}/insights`, {
      fields: campos, level: 'campaign', time_increment: 1,
      time_range: JSON.stringify(janela), limit: 500,
    });
    for (const d of rows) {
      const r = lerResultado(d);
      if (r.ind === 'mixed') {
        mistos.add(d.campaign_id + '|' + d.date_start);
        idsMistos.add(d.campaign_id);
        continue;
      }
      if (!r.ind && num(d.spend) > 0) { semResultado.push(d); continue; }
      linhas.push(montar(d, r));
    }
  }

  if (semResultado.length) {
    const acoes = await acoesPorCampanha([...new Set(semResultado.map((d) => d.campaign_id))]);
    for (const d of semResultado) {
      const acao = acoes[d.campaign_id];
      linhas.push(montar(d, acao
        ? { ind: 'actions:' + acao, valor: contarAcao(d, acao) }
        : { ind: null, valor: 0 }));
    }
  }

  // Dias "mixed": cada conjunto entra com o seu proprio tipo. So os dias
  // que vieram mixed — os outros ja foram contados no nivel campanha.
  if (idsMistos.size) {
    for (const janela of janelasMensais(desde, ate)) {
      const rows = await paginar(`${cfg.conta}/insights`, {
        fields: 'adset_id,adset_name,' + campos, level: 'adset', time_increment: 1,
        time_range: JSON.stringify(janela), limit: 500,
        filtering: JSON.stringify([{ field: 'campaign.id', operator: 'IN', value: [...idsMistos] }]),
      });
      for (const d of rows) {
        if (!mistos.has(d.campaign_id + '|' + d.date_start)) continue;
        linhas.push(montar(d, lerResultado(d)));
      }
    }
  }

  return linhas.filter((l) => l.investimento > 0 || l.resultados > 0);
}

// ---------------------------------------------------------------
// Formatos que o painel le (os mesmos do modo por produto).
// ---------------------------------------------------------------
function tiposDasLinhas(linhas) {
  const m = new Map();
  for (const l of linhas) if (!m.has(l.tipo.id)) m.set(l.tipo.id, l.tipo);
  return m;
}

function campanhasPorDia(linhas) {
  return linhas.map((l) => ({
    data: l.data,
    nome: l.campanha,
    grupo: l.tipo.id,
    grupo_nome: l.tipo.nome,
    rotulo_resultado: l.tipo.rotulo,
    investimento: Number(l.investimento.toFixed(2)),
    resultados: l.resultados,
  }));
}

function gruposPorTipo(linhas) {
  const saida = {};
  for (const [id, t] of tiposDasLinhas(linhas)) {
    const doTipo = linhas.filter((l) => l.tipo.id === id);
    const inv = doTipo.reduce((s, l) => s + l.investimento, 0);
    const res = doTipo.reduce((s, l) => s + l.resultados, 0);
    saida[id] = {
      id, nome: t.nome, descricao: t.descricao || '',
      rotulo_resultado: t.rotulo, rotulo_secundario: null,
      investimento: Number(inv.toFixed(2)), resultados: res, secundario: null,
      custo_por_resultado: res > 0 ? Number((inv / res).toFixed(2)) : null,
      campanhas: [...new Set(doTipo.map((l) => l.campanha))],
    };
  }
  return saida;
}

function campanhasDoPeriodo(linhas) {
  const m = new Map();
  for (const l of linhas) {
    const k = l.campanha_id + '|' + l.tipo.id;
    const a = m.get(k) || { id: l.campanha_id, nome: l.campanha, grupo: l.tipo.id,
      grupo_nome: l.tipo.nome, rotulo_resultado: l.tipo.rotulo,
      investimento: 0, resultados: 0, impressoes: 0, cliques: 0 };
    a.investimento += l.investimento; a.resultados += l.resultados;
    a.impressoes += l.impressoes; a.cliques += l.cliques;
    m.set(k, a);
  }
  return [...m.values()]
    .map((c) => ({ ...c, investimento: Number(c.investimento.toFixed(2)) }))
    .filter((c) => c.investimento > 0)
    .sort((a, b) => b.investimento - a.investimento);
}

function porMes(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const mes = l.data.slice(0, 7);
    const m = mapa.get(mes) || { mes, investimento: 0, grupos: {} };
    m.investimento += l.investimento;
    const g = m.grupos[l.tipo.id] || { investimento: 0, resultados: 0, rotulo: l.tipo.rotulo };
    g.investimento += l.investimento; g.resultados += l.resultados;
    m.grupos[l.tipo.id] = g;
    mapa.set(mes, m);
  }
  return [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes))
    .map((m) => ({ ...m, investimento: Number(m.investimento.toFixed(2)) }));
}

// Quantas campanhas de cada tipo estao no ar AGORA. O tipo de cada
// campanha vem das linhas (uma campanha mista conta nos dois tipos).
async function statusPorTipo(conta, linhas) {
  const tiposDa = new Map();
  for (const l of linhas) {
    const s = tiposDa.get(l.campanha_id) || new Set();
    s.add(l.tipo.id); tiposDa.set(l.campanha_id, s);
  }
  const camps = await paginar(`${conta}/campaigns`, { fields: 'id,effective_status', limit: 500 });
  const saida = {};
  for (const c of camps) {
    for (const t of tiposDa.get(c.id) || []) {
      const m = saida[t] || { ativas: 0, total: 0 };
      m.total++;
      if (c.effective_status === 'ACTIVE') m.ativas++;
      saida[t] = m;
    }
  }
  return saida;
}

module.exports = {
  linhasPorTipo, campanhasPorDia, gruposPorTipo, campanhasDoPeriodo, porMes,
  statusPorTipo, tipoDoIndicador,
};

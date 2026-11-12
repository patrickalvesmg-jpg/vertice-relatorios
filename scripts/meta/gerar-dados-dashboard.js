// Gera o JSON de um cliente no formato do dashboard de trafego da Vertice.
// Saida: Projetos/vertice/sistemas/dashboard-trafego/dados/<slug>.json
//
// Uso: node src/gerar-dados-dashboard.js <slug>
//      node src/gerar-dados-dashboard.js cfc-academy
//
// O formato e o de dados/_EXEMPLO-cliente.json: serie_diaria e a fonte de
// verdade e o dashboard deriva os totais dela conforme o filtro de periodo.

const fs = require('fs');
const path = require('path');
const meta = require('./meta-client');
const { criarColeta } = require('./coleta-cfc');
const porResultado = require('./coleta-resultados');

// ---------------------------------------------------------------
// Clientes configurados. Para adicionar outro, crie uma entrada
// aqui e outra em dados/clientes.json do dashboard.
//
// modo: 'resultados' (padrao desde 12/11/2026) agrupa as campanhas pelo
// TIPO de resultado que o Gerenciador mostra (mensagem, visita ao perfil,
// compra, evento do site...) — o relatorio se adapta sozinho ao que roda
// na conta. Ver coleta-resultados.js. `rotulos` so troca nomes; nada
// precisa ser mapeado a mao. Sem `modo`, usa o mapa antigo por produto
// (`grupos`, regex no nome da campanha).
// ---------------------------------------------------------------
const CLIENTES = {
  'cfc-academy': {
    slug: 'cfc-academy',
    nome: 'CFC Academy',
    segmento: 'Educação',
    conta: 'act_530764754757626',
    modo: 'resultados',
    rotulos: {
      // Evento do site da LP do Contador Concursado (botao do WhatsApp).
      LeadWhatsApp: { nome: 'Site → WhatsApp', rotulo: 'Leads no WhatsApp',
        descricao: 'Quem clicou para chamar no WhatsApp na página' },
    },
    objetivo: 'vendas',
    rotulo_resultado: 'Compras',
    // Acao da Meta que conta como "resultado" deste cliente.
    acao_resultado: 'purchase',
    // Quantos meses de historico puxar.
    meses: 6,
    // Recorte do painel operacional (criativos/grupos): 2 meses.
    meses_operacional: 2,
    // Grupos que tambem mostram criativos PAUSADOS (com gasto no periodo).
    // O CFC Express esta fora do ar, mas saber qual criativo vendeu
    // melhor orienta a proxima rodada — pedido do Patrick em 21/08/2026.
    criativos_historicos: ['cfc-express'],
    // Mapa de produto (grupos de campanha) desta conta.
    grupos: './grupos-cfc',
    metas: {
      investimento_previsto: 4000,
      custo_por_resultado_alvo: 40,
      resultados_alvo: 80,
    },
  },
  'vital-clean': {
    slug: 'vital-clean',
    nome: 'Vital Clean Nordeste',
    segmento: 'Higiene profissional',
    conta: 'act_464010796779854',
    objetivo: 'conversas',
    rotulo_resultado: 'Conversas iniciadas',
    // Mesma metrica da coluna "Resultados" do Gerenciador nas campanhas
    // de mensagem, que sao as que estao no ar.
    acao_resultado: 'onsite_conversion.messaging_conversation_started_7d',
    // O relatorio comeca no inicio do contrato com a Vertice. Antes disso
    // a conta foi gerida por outra agencia, e misturar os dois periodos
    // no mesmo painel confundiria o Douglas.
    desde: '2026-11-06',
    meses: 6,
    criativos_historicos: [],
    grupos: './grupos-vital-clean',
    modo: 'resultados',
    rotulos: {
      mensagens: { nome: 'Conversas no WhatsApp',
        descricao: 'Anúncios que levam direto para o WhatsApp da Vital Clean' },
      LeadQualificado: { nome: 'Formulário RestoClean', rotulo: 'Leads qualificados',
        descricao: 'Cadastros de quem gasta a partir de R$ 950 por mês com limpeza' },
    },
    // Os nomes reais das campanhas tem "ALTUS"; no relatorio do Douglas
    // aparece o nome legivel (ver grupos-vital-clean.js).
    apelido: require('./grupos-vital-clean').apelido,
    // Sem meta combinada ainda: o painel simplesmente nao mostra a barra.
    metas: {},
  },
};

// DESTINO_DADOS existe para a automacao do GitHub (relatorios-online), que
// roda uma copia IDENTICA destes arquivos e grava em scripts/dados/. Sem a
// variavel, grava no dashboard local, como sempre.
const DESTINO = process.env.DESTINO_DADOS || path.join(
  __dirname, '..', '..', 'dashboard-trafego', 'dados'
);

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
async function campanhas(cfg, desde, ate, mapa) {
  const { grupoDaCampanha, apelido = (n) => n } = mapa;
  const r = await meta.get(`${cfg.conta}/insights`, {
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: desde, until: ate }),
    level: 'campaign',
    limit: 300,
  });

  // Cada campanha e contada na moeda do seu proprio produto. Antes tudo
  // era 'purchase': a campanha de formulario aparecia com 6 resultados
  // quando tinha gerado 276 leads, e parecia um fracasso sem ser.
  const lista = (r.data || []).map((d) => {
    const g = grupoDaCampanha(d.campaign_name);
    return {
      id: d.campaign_id,
      nome: apelido(d.campaign_name),
      grupo: g.id,
      grupo_nome: g.nome,
      investimento: num(d.spend),
      resultados: contarAcao(d, g.acao_resultado),
      rotulo_resultado: g.rotulo_resultado,
      impressoes: num(d.impressions),
      cliques: num(d.clicks),
    };
  });

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

  const desde = cfg.desde || mesesAtras(cfg.meses);
  const ate = hojeISO();

  console.log(`Gerando dados de ${cfg.nome} (${desde} a ${ate})...`);

  // As consultas leves vao em paralelo.
  const [serie, alc, pub] = await Promise.all([
    serieDiaria(cfg, desde, ate),
    alcanceDoPeriodo(cfg, desde, ate),
    publico(cfg, desde, ate),
  ]);

  // As pesadas (campanha-dia, conjunto-dia, anuncio-dia) vao em serie:
  // disparadas junto com as outras, a Meta derruba a rodada inteira com
  // "An unknown error occurred" (subcode 99), que e como ela sinaliza carga
  // demais de uma vez.
  let camps, campDia, grupos, meses, statusGrupos, criativos;

  if (cfg.modo === 'resultados') {
    // Por tipo de resultado (coluna "Resultados" do Gerenciador). Sem a
    // coleta de criativos: o relatorio nao mostra mais criativos, e ela
    // era a consulta mais pesada da rodada.
    const linhas = await porResultado.linhasPorTipo(cfg, desde, ate);
    camps = porResultado.campanhasDoPeriodo(linhas);
    campDia = porResultado.campanhasPorDia(linhas);
    grupos = porResultado.gruposPorTipo(linhas);
    meses = porResultado.porMes(linhas);
    statusGrupos = await porResultado.statusPorTipo(cfg.conta, linhas);
    criativos = { lista: [], por_dia: [] };
  } else {
    const mapa = require(cfg.grupos || './grupos-cfc');
    const coleta = criarColeta(mapa);
    statusGrupos = await coleta.statusDosGrupos(cfg.conta);
    const linhasTudo = await coleta.serieDiariaPorCampanha(cfg.conta, desde, ate);
    criativos = await coleta.criativosAtivos(cfg.conta, desde, ate, cfg.criativos_historicos);
    camps = await campanhas(cfg, desde, ate, mapa);
    campDia = coleta.campanhasPorDia(linhasTudo);
    grupos = coleta.seriesPorGrupo(linhasTudo);
    meses = coleta.porMes(linhasTudo);
  }

  console.log(`  ${serie.length} dias de serie`);
  console.log(`  ${camps.length} campanhas com investimento`);
  console.log(`  ${pub.length} recortes de publico`);
  console.log(`  ${Object.keys(grupos).length} ${cfg.modo === 'resultados' ? 'tipos de resultado' : 'grupos de produto'}: ${
    Object.values(grupos).map((g) => `${g.nome} (${g.resultados} ${g.rotulo_resultado.toLowerCase()})`).join(' · ')}`);

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
    // Campanha x dia: o painel soma so os dias do filtro, em vez de
    // ratear o total do periodo inteiro (que inventava gasto atual para
    // campanha que so rodou meses atras).
    campanhas_por_dia: campDia,
    grupos_produto: grupos,
    status_grupos: statusGrupos,
    investimento_mensal: meses,
    criativos_ativos: criativos.lista,
    criativos_por_dia: criativos.por_dia,
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

  console.log(`\nGravado em dashboard-trafego/dados/${cfg.slug}.json`);
  console.log(`Periodo: R$ ${totalGasto.toFixed(2)} | ${totalRes} ${cfg.rotulo_resultado.toLowerCase()}`);
}

main().catch((e) => {
  console.error('\nFALHA AO GERAR OS DADOS');
  console.error(e.message);
  if (e.metaError) console.error(JSON.stringify(e.metaError, null, 2));
  process.exit(1);
});

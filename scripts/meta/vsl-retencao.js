// Retenção da VSL da VitalClean (vitalclean.com.br/assista), lida da contagem de eventos do Pixel.
// Pedido do Patrick em 25/11/2026: ver onde o pessoal sai do vídeo, publicado e se atualizando sozinho.
//
// A página manda um evento no começo de cada bloco do roteiro (VSL01Pia ... VSL16Fim), uma vez por visita, só quando
// a pessoa chega assistindo (assista.js). Aqui eu somo os eventos desde INICIO_PADRAO.
// O Pixel recebe cada evento DUAS vezes, pelo navegador e pelo servidor (25/11: 115 x 118, todas as contagens pares):
// quando chega a cópia do servidor, divido por 2.
//
// Na automação (GitHub Actions): node scripts/meta/vsl-retencao.js  ->  <DESTINO_DADOS>/vital-clean-vsl.json
// O publicar.js cifra esse arquivo com a senha da Vital Clean e publica /vital-clean/vsl/.
// O relatório local (meta-api/src/vital-vsl-retencao.js --html) usa este mesmo arquivo com o cliente da Meta dele.
const fs = require('fs');
const path = require('path');

const PIXEL = '680556785020968';
const CAMPANHA = '120252355793250544'; // campanha da VSL (agendamento)
const DURACAO = 550;                   // segundos do vídeo no ar (video-v4 = VSL v5)
const CONVITE = 399;                   // CTA_SEGUNDOS do assista.js: o botão do WhatsApp aparece
const INICIO_PADRAO = '2026-11-24 19:00'; // VSL v4 no ar e campanha ligada (antes disso o Android travava no 1:36)
// Segundo em que cada bloco começa no vídeo no ar (os BLOCOS do assista.js?v=10) e o que acontece nele.
// Vídeo novo = copiar os segundos do assista.js pra cá e acertar DURACAO e CONVITE.
const BLOCOS = [
  ['VSL01Pia', 1, 'a pia às 23h e a pergunta'], ['VSL02QuemFala', 17, 'quem fala e o que vem'],
  ['VSL03Conta', 42, 'a conta de hoje'], ['VSL04Crosta', 94, 'por que a conta não cai'],
  ['VSL05Tanque', 139, 'o RestoClean'], ['VSL06UmaNoite', 163, 'uma noite no tanque'],
  ['VSL07ContaNova', 206, 'a conta com o RestoClean'], ['VSL07bDono', 261, 'Augustín e Karla (L\'Ô)'],
  ['VSL08PizzaHut', 314, 'Pizza Hut do Eusébio'], ['VSL09ProntoPizza', 343, 'Pronto Pizza'],
  ['VSL10Jacquin', 364, 'Jacquin'], ['VSL11Fotos', 389, 'fotos (aos 6:39 aparece o botão)'],
  ['VSL12Aluguel', 409, 'o aluguel'], ['VSL13Duvidas', 441, 'as dúvidas'],
  ['VSL14Valor', 491, 'o valor e a conversa'], ['VSL15Convite', 523, 'convite e fecho'], ['VSL16Fim', 541, 'fim do vídeo'],
];
const OUTROS = ['DeuPlayVSL', 'AssistiuVSL25', 'AssistiuVSL50', 'AssistiuVSL75', 'AssistiuVSL95', 'ChegouNoConvite', 'Schedule', 'AvisoSaida', 'FicouNoVideo'];

const diaBR = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

// "2026-11-27" (0h) ou "2026-11-27 14:00", hora de Brasília -> segundos
function inicioEm(texto) {
  const t = String(texto).trim();
  const quando = /^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00` : t.replace(' ', 'T');
  const s = Math.floor(new Date(`${quando}:00-03:00`).getTime() / 1000);
  if (!s) throw new Error(`data inválida: ${texto} (use 2026-11-27 ou "2026-11-27 14:00")`);
  return s;
}

async function somar(meta, aggregation, ini, fim) {
  const tot = {};
  let pg = await meta.get(`${PIXEL}/stats`, { aggregation, start_time: ini, end_time: fim });
  for (;;) {
    for (const b of pg.data || []) for (const d of b.data || []) tot[d.value] = (tot[d.value] || 0) + d.count;
    if (!pg.paging || !pg.paging.next) break;
    pg = await meta.getUrl(pg.paging.next);
  }
  return tot;
}

// meta = cliente com get(caminho, params) e getUrl(url)
async function coletar(meta, inicio = INICIO_PADRAO) {
  const ini = inicioEm(inicio);
  const fim = Math.floor(Date.now() / 1000);
  const bruto = await somar(meta, 'event', ini, fim);
  const fonte = await somar(meta, 'event_source', ini, fim);
  const dobrado = (fonte.SERVER || 0) > 0 && (fonte.SERVER || 0) >= 0.8 * (fonte.BROWSER || 0);
  const n = (ev) => Math.round((bruto[ev] || 0) / (dobrado ? 2 : 1));

  let anuncio = null;
  try {
    const r = await meta.get(`${CAMPANHA}/insights`, {
      fields: 'spend,inline_link_clicks,actions',
      time_range: JSON.stringify({ since: diaBR(ini * 1000), until: diaBR(fim * 1000) }),
    });
    const d = (r.data || [])[0];
    if (d) {
      const lpv = (d.actions || []).find((a) => a.action_type === 'landing_page_view');
      anuncio = { gasto: Number(d.spend || 0), cliques: Number(d.inline_link_clicks || 0), visitas: Number(lpv ? lpv.value : d.inline_link_clicks || 0) };
    }
  } catch (e) { console.log(`  vsl: não consegui ler o gasto da campanha (${e.message})`); }

  return {
    titulo: 'VSL do RestoClean: onde o pessoal sai', pagina: 'VitalClean · vitalclean.com.br/assista',
    inicioTexto: inicio, inicio: ini * 1000, fim: fim * 1000, geradoEm: Date.now(),
    duracao: DURACAO, conviteSeg: CONVITE, dobrado, fonte: { navegador: fonte.BROWSER || 0, servidor: fonte.SERVER || 0 },
    abriu: n('AbriuVSL'), deuPlay: n('DeuPlayVSL'), chegouConvite: n('ChegouNoConvite'), schedule: n('Schedule'),
    aviso: n('AvisoSaida'), ficou: n('FicouNoVideo'), anuncio,
    outros: Object.fromEntries(OUTROS.map((ev) => [ev, n(ev)])),
    blocos: BLOCOS.map(([ev, seg, desc]) => ({ ev, seg, desc, n: n(ev) })),
  };
}

module.exports = { coletar, inicioEm, INICIO_PADRAO };

if (require.main === module) {
  const meta = require('./meta-client');
  const RAIZ = path.join(__dirname, '..', '..');
  const local = path.join(RAIZ, '..', 'dashboard-trafego', 'dados'); // mesma regra do publicar.js
  const destino = process.env.DESTINO_DADOS
    ? path.resolve(RAIZ, process.env.DESTINO_DADOS)
    : (fs.existsSync(local) ? local : path.join(RAIZ, 'scripts', 'dados'));
  coletar(meta).then((dados) => {
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, 'vital-clean-vsl.json'), JSON.stringify(dados), 'utf8');
    console.log(`  vsl: ${dados.abriu} abriram a página, ${dados.blocos[0].n} viram o vídeo começar, ${dados.blocos[dados.blocos.length - 1].n} até o fim`);
  }).catch((e) => { console.error(`  vsl: ERRO ${e.message}`); process.exit(1); });
}

// Mapa de produto da conta CFC Academy.
//
// A conta roda produtos diferentes ao mesmo tempo, e cada um entrega numa
// moeda diferente. Contar 'purchase' em tudo (como era ate 21/08/2026)
// fazia a campanha de formulario aparecer com 6 resultados quando tinha
// gerado 276 leads. Cada grupo abaixo declara a acao que conta para ele.
//
// Definicao de produto dada pelo Patrick em 21/08/2026:
//   - "CFC ACADEMY PRO" e "ACADEMY PRO MENSAGEM" sao a MESMA campanha,
//     mesmo produto — entram no mesmo grupo.
//   - "CFC EXPRESS" e outro produto, de venda no site.
//   - "LEAD FORMULARIO" e outra coisa (e ja esta desativado).
//   - "CRESCIMENTO IG" e topo de funil, nao vende.

const GRUPOS = [
  {
    id: 'academy-pro',
    nome: 'CFC Academy Pro',
    descricao: 'Venda por mensagem — as duas campanhas do mesmo produto',
    // A conversa e o resultado real: a venda acontece no WhatsApp/Direct,
    // fora do rastreio do pixel. Por isso a compra entra como metrica
    // secundaria, nao como o numero principal.
    //
    // 'messaging_conversation_started_7d' e a MESMA metrica que o
    // Gerenciador mostra na coluna "Resultados" (conferido em 21/08/2026
    // contra print da conta: 212 e 189). Usar 'messaging_first_reply'
    // dava 188 e 163 — numero valido, mas que nao bate com a tela que o
    // Patrick olha, e relatorio que diverge do Gerenciador nao serve.
    acao_resultado: 'onsite_conversion.messaging_conversation_started_7d',
    rotulo_resultado: 'Conversas iniciadas',
    acao_secundaria: 'purchase',
    rotulo_secundario: 'Compras',
    // Casa por prefixo do nome da campanha, sem depender de ID.
    // "[NOVO Nº ...]" na frente = cópia da campanha no número novo (29/10/2026),
    // que depois foi renomeada para "[9090][CFC ACADEMY PRO]..." (prefixo só de número).
    padrao: /^(\[(NOVO[^\]]*|\d+)\]\s*)?\[(REMARKETING\])?\s*\[?CFC ACADEMY PRO\]/i,
  },
  {
    id: 'cfc-express',
    nome: 'CFC Express',
    descricao: 'Venda direta no site (checkout com pixel)',
    acao_resultado: 'purchase',
    rotulo_resultado: 'Compras',
    acao_secundaria: 'initiate_checkout',
    rotulo_secundario: 'Checkouts iniciados',
    padrao: /CFC EXPRESS/i,
  },
  {
    id: 'crescimento',
    nome: 'Crescimento IG',
    descricao: 'Topo de funil — leva gente para o perfil, nao vende',
    acao_resultado: 'link_click',
    rotulo_resultado: 'Cliques no link',
    acao_secundaria: 'post_engagement',
    rotulo_secundario: 'Engajamentos',
    padrao: /CRESCIMENTO IG|CRESCIMENTI IG/i,
  },
  {
    // 12/11/2026: conversão do grupo grátis — o anúncio leva pra grupowhatsapp.cfcacademy.com.br e o resultado
    // é o clique no botão de entrar no grupo (evento CliqueGrupoWhatsApp do pixel do Pro, conversão
    // personalizada 1146659917905354). Fica ANTES do 'grupo-gratis' porque os dois nomes têm "GRUPO GRÁTIS".
    id: 'grupo-gratis-conversao',
    nome: 'Grupo grátis — página',
    descricao: 'Página do grupo gratuito → clique em entrar no grupo do WhatsApp',
    acao_resultado: 'offsite_conversion.custom.1146659917905354',
    rotulo_resultado: 'Cliques em entrar no grupo',
    acao_secundaria: 'link_click',
    rotulo_secundario: 'Cliques no link',
    padrao: /GRUPO GR[AÁ]TIS.*CONVERS[AÃ]O/i,
  },
  {
    // 11/11/2026: tráfego direto pro link de convite do grupo gratuito de estudos no WhatsApp
    // (sem página no meio, então não há pixel: o resultado é o clique no link).
    id: 'grupo-gratis',
    nome: 'Grupo grátis de estudos',
    descricao: 'Tráfego direto pro grupo gratuito do WhatsApp',
    acao_resultado: 'link_click',
    rotulo_resultado: 'Cliques no link',
    acao_secundaria: null,
    rotulo_secundario: null,
    padrao: /GRUPO GR[AÁ]TIS/i,
  },
  {
    id: 'leads',
    nome: 'Captação por formulário',
    descricao: 'Formulário de lead — desativado em ago/2026',
    acao_resultado: 'offsite_complete_registration_add_meta_leads',
    rotulo_resultado: 'Leads',
    acao_secundaria: null,
    rotulo_secundario: null,
    padrao: /\[LEAD\]\[FORMULARIO\]|CAPTURA DE LEADS|CAPTURA LEADS|\[CCC\] \[LEADS\]/i,
  },
];

// Grupo de sobra: campanhas antigas que nao se encaixam em nenhum produto
// atual. Existe para nenhum gasto sumir do total da conta.
const OUTROS = {
  id: 'outros',
  nome: 'Outras campanhas',
  descricao: 'Campanhas antigas fora dos produtos atuais',
  acao_resultado: 'purchase',
  rotulo_resultado: 'Compras',
  acao_secundaria: null,
  rotulo_secundario: null,
  padrao: null,
};

function grupoDaCampanha(nome) {
  return GRUPOS.find((g) => g.padrao.test(nome || '')) || OUTROS;
}

module.exports = { GRUPOS, OUTROS, grupoDaCampanha };

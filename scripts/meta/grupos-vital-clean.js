// Mapa de produto da conta Vital Clean Nordeste (act_464010796779854).
// Mesmo formato de grupos-cfc.js — ver coleta-cfc.js / criarColeta().
//
// Montado em 12/11/2026, quando o relatorio do Douglas foi criado:
//   - as campanhas de ENGAJAMENTO e de TRAFEGO levam para o WhatsApp
//     (558585611601) e rodam juntas como teste A/B do mesmo produto. O
//     resultado e a conversa iniciada — a mesma metrica que o Gerenciador
//     mostra na coluna "Resultados" dessas campanhas.
//   - a de VENDAS/FORMRESPONDI otimiza o evento LeadQualificado, mandado
//     pelo CRM so para quem marca gasto a partir de R$ 950 no formulario.
//     Estava pausada nesse dia.

const GRUPOS = [
  {
    id: 'whatsapp',
    nome: 'Conversas no WhatsApp',
    descricao: 'Anúncios que levam direto para o WhatsApp da Vital Clean',
    acao_resultado: 'onsite_conversion.messaging_conversation_started_7d',
    rotulo_resultado: 'Conversas iniciadas',
    acao_secundaria: null,
    rotulo_secundario: null,
    padrao: /\[MENSAGEM\]/i,
  },
  {
    id: 'formulario',
    nome: 'Formulário RestoClean',
    descricao: 'Cadastros de quem gasta a partir de R$ 950 por mês com limpeza',
    acao_resultado: 'offsite_conversion.fb_pixel_custom',
    rotulo_resultado: 'Leads qualificados',
    acao_secundaria: null,
    rotulo_secundario: null,
    padrao: /FORMRESPONDI/i,
  },
];

// Sobra: campanhas antigas da conta (antes da Vertice). O relatorio comeca
// em 06/11/2026, entao normalmente nada cai aqui — existe para nenhum gasto
// sumir do total se o periodo for ampliado.
const OUTROS = {
  id: 'outros',
  nome: 'Outras campanhas',
  descricao: 'Campanhas fora dos produtos atuais',
  acao_resultado: 'onsite_conversion.messaging_conversation_started_7d',
  rotulo_resultado: 'Conversas iniciadas',
  acao_secundaria: null,
  rotulo_secundario: null,
  padrao: null,
};

function grupoDaCampanha(nome) {
  return GRUPOS.find((g) => g.padrao.test(nome || '')) || OUTROS;
}

// O nome tecnico da campanha ("[TRAFEGO][MENSAGEM][ALTUS][PA]") nao diz nada
// ao cliente e ainda carrega sigla interna. No relatorio aparece o nome
// legivel; o agrupamento continua usando o nome real.
const APELIDOS = [
  [/\[ENGAJAMENT[^\]]*\]\s*\[MENSAGEM\]/i, 'WhatsApp · Engajamento'],
  [/\[TR[AÁ]FEGO\]\s*\[MENSAGEM\]/i, 'WhatsApp · Tráfego'],
  [/FORMRESPONDI/i, 'Formulário RestoClean'],
];

function apelido(nome) {
  const achado = APELIDOS.find(([re]) => re.test(nome || ''));
  return achado ? achado[1] : nome;
}

module.exports = { GRUPOS, OUTROS, grupoDaCampanha, apelido };

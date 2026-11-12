// Cliente minimo da Graph API do Meta. Usa fetch nativo (Node 18+).
const config = require('./config');

const BASE = 'https://graph.facebook.com';

/**
 * Faz um GET na Graph API.
 * @param {string} caminho - ex: 'me' ou 'me/adaccounts'
 * @param {object} params - query params extras (ex: { fields: 'id,name' })
 */
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Erros que somem sozinhos: a Meta responde assim quando a conta pediu
// dado demais em pouco tempo. O 'unknown error' (code 1 / subcode 99) e o
// mais comum ao puxar varios meses no nivel de anuncio por dia — nao ha o
// que corrigir na chamada, so esperar e repetir.
function ehTemporario(erro) {
  const c = erro.code, s = erro.error_subcode;
  return (c === 1 && s === 99) || c === 2 || c === 4 || c === 17 || c === 341 || c === 613;
}

async function get(caminho, params = {}, tentativa = 1) {
  const url = new URL(`${BASE}/${config.apiVersion}/${caminho}`);

  for (const [chave, valor] of Object.entries(params)) {
    url.searchParams.set(chave, valor);
  }
  url.searchParams.set('access_token', config.accessToken);

  const resposta = await fetch(url);
  const corpo = await resposta.json();

  if (corpo.error && ehTemporario(corpo.error) && tentativa <= 4) {
    const pausa = tentativa * 5000;
    console.log(`  aviso: Meta pediu pausa (${corpo.error.message}). Tentando de novo em ${pausa / 1000}s...`);
    await espera(pausa);
    return get(caminho, params, tentativa + 1);
  }

  if (!resposta.ok || corpo.error) {
    const erro = corpo.error || {};
    const detalhe = [
      erro.message || `HTTP ${resposta.status}`,
      erro.type ? `tipo: ${erro.type}` : null,
      erro.code ? `codigo: ${erro.code}` : null,
    ].filter(Boolean).join(' | ');

    const e = new Error(detalhe);
    e.metaError = erro;
    throw e;
  }

  return corpo;
}

// Busca uma URL de paginacao (paging.next) com a mesma tolerancia a
// erro temporario do get(). O next ja vem com token embutido.
async function getUrl(url, tentativa = 1) {
  const resposta = await fetch(url);
  const corpo = await resposta.json();

  if (corpo.error && ehTemporario(corpo.error) && tentativa <= 4) {
    const pausa = tentativa * 5000;
    console.log(`  aviso: Meta pediu pausa na paginacao. Tentando de novo em ${pausa / 1000}s...`);
    await espera(pausa);
    return getUrl(url, tentativa + 1);
  }
  if (corpo.error) throw new Error(corpo.error.message);
  return corpo;
}

module.exports = { get, getUrl };

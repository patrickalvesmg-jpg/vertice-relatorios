// Cliente minimo da Graph API do Meta. Usa fetch nativo (Node 18+).
const config = require('./config');

const BASE = 'https://graph.facebook.com';

/**
 * Faz um GET na Graph API.
 * @param {string} caminho - ex: 'me' ou 'me/adaccounts'
 * @param {object} params - query params extras (ex: { fields: 'id,name' })
 */
async function get(caminho, params = {}) {
  const url = new URL(`${BASE}/${config.apiVersion}/${caminho}`);

  for (const [chave, valor] of Object.entries(params)) {
    url.searchParams.set(chave, valor);
  }
  url.searchParams.set('access_token', config.accessToken);

  const resposta = await fetch(url);
  const corpo = await resposta.json();

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

module.exports = { get };

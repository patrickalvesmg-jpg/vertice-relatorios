// Carrega e valida credenciais do .env (sem dependencias externas).
const fs = require('fs');
const path = require('path');

const CAMINHO_ENV = path.join(__dirname, '..', '.env');

function carregarEnv() {
  // Na automacao (GitHub Actions) nao existe .env: as credenciais vem por
  // variavel de ambiente, a partir dos Secrets do repositorio.
  if (!fs.existsSync(CAMINHO_ENV)) {
    if (process.env.META_ACCESS_TOKEN) {
      return {
        META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN,
        META_APP_ID: process.env.META_APP_ID,
        META_APP_SECRET: process.env.META_APP_SECRET,
        META_BUSINESS_ID: process.env.META_BUSINESS_ID,
        META_API_VERSION: process.env.META_API_VERSION,
        META_AD_ACCOUNT_ID: process.env.META_AD_ACCOUNT_ID,
      };
    }
    throw new Error(`.env nao encontrado em ${CAMINHO_ENV}. Copie o .env.example e preencha.`);
  }

  const valores = {};
  const linhas = fs.readFileSync(CAMINHO_ENV, 'utf8').split(/\r?\n/);

  for (const linha of linhas) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith('#')) continue;

    const separador = limpa.indexOf('=');
    if (separador === -1) continue;

    const chave = limpa.slice(0, separador).trim();
    let valor = limpa.slice(separador + 1).trim();

    // Remove aspas envolventes, se houver
    if (valor.length >= 2 && /^(".*"|'.*')$/.test(valor)) {
      valor = valor.slice(1, -1);
    }

    valores[chave] = valor;
  }

  return valores;
}

const env = carregarEnv();

if (!env.META_ACCESS_TOKEN) {
  throw new Error('META_ACCESS_TOKEN esta vazio no .env.');
}

module.exports = {
  accessToken: env.META_ACCESS_TOKEN,
  appId: env.META_APP_ID || null,
  appSecret: env.META_APP_SECRET || null,
  apiVersion: env.META_API_VERSION || 'v21.0',
  adAccountId: env.META_AD_ACCOUNT_ID || null,
};

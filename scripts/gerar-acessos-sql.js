// Gera supabase/acessos.sql: a linha de acesso do registro diario de cada
// cliente marcado com "registro": true em scripts/dados/clientes.json.
//
// Uso: node scripts/gerar-acessos-sql.js
//
// O arquivo gerado leva so sha256(slug:chave), nunca a chave — mesmo
// assim fica fora do Git (.gitignore): o repositorio e publico, e um hash
// de senha curta pode ser quebrado por forca bruta.
//
// Rodar de novo sempre que trocar a senha de um cliente com registro, e
// colar o resultado no SQL Editor do Supabase.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const indice = JSON.parse(fs.readFileSync(path.join(__dirname, 'dados', 'clientes.json'), 'utf8'));
const proprias = fs.existsSync(path.join(RAIZ, 'senhas-clientes.json'))
  ? JSON.parse(fs.readFileSync(path.join(RAIZ, 'senhas-clientes.json'), 'utf8')) : {};
const padrao = fs.existsSync(path.join(RAIZ, 'senha.txt'))
  ? fs.readFileSync(path.join(RAIZ, 'senha.txt'), 'utf8').trim() : null;

const linhas = [];
for (const c of indice.clientes || []) {
  if (!c.registro || c.ativo === false) continue;
  const chave = proprias[c.slug] || (c.senha_propria ? null : padrao);
  if (!chave) { console.error(`sem chave para ${c.slug}, pulado`); continue; }
  const hash = crypto.createHash('sha256').update(`${c.slug}:${chave}`, 'utf8').digest('hex');
  linhas.push(`insert into relatorio.acessos (slug, chave_hash) values ('${c.slug}', '${hash}')
  on conflict (slug) do update set chave_hash = excluded.chave_hash;`);
}

if (!linhas.length) { console.error('nenhum cliente com "registro": true'); process.exit(1); }

const sql = `-- Acesso ao registro diario (gerado por scripts/gerar-acessos-sql.js).
-- NAO vai para o Git. Rode DEPOIS de supabase/registro-diario.sql.
${linhas.join('\n')}
`;
fs.writeFileSync(path.join(RAIZ, 'supabase', 'acessos.sql'), sql, 'utf8');
console.log(`supabase/acessos.sql gerado (${linhas.length} cliente(s))`);

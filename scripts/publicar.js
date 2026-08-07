// Empacota o dashboard da Vertice num HTML unico e protegido por senha.
//
// Uso: node scripts/publicar.js
//
// O que ele faz:
//   1. le o dashboard.html original (fonte da verdade, nao e copiado no repo)
//   2. le os JSONs de dados dos clientes
//   3. criptografa os dados com AES-GCM usando a senha
//   4. embute tudo num unico index.html
//
// Por que embutir em vez de servir JSON separado: no GitHub Pages qualquer
// arquivo e acessivel por URL direta. Uma tela de senha em JS esconderia a
// tela, mas dados/cliente.json continuaria baixavel. Criptografado dentro do
// HTML, sem a senha nao existe nada legivel para baixar.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, '..', 'vertice', 'dashboards', 'trafego');
const DADOS = path.join(ORIGEM, 'dados');
const SAIDA = path.join(RAIZ, 'docs');           // GitHub Pages serve /docs
const CONFIG = path.join(RAIZ, 'senha.txt');     // fora do Git

// ---------------------------------------------------------------
// Senha
// ---------------------------------------------------------------
function lerSenha() {
  if (!fs.existsSync(CONFIG)) {
    console.error(`\nFalta o arquivo senha.txt em ${RAIZ}`);
    console.error('Crie o arquivo com a senha de acesso numa linha so.');
    console.error('Ele esta no .gitignore e nao vai para o GitHub.\n');
    process.exit(1);
  }
  const s = fs.readFileSync(CONFIG, 'utf8').trim();
  if (s.length < 6) {
    console.error('\nA senha precisa de pelo menos 6 caracteres.\n');
    process.exit(1);
  }
  return s;
}

// ---------------------------------------------------------------
// Criptografia — precisa casar com o que o navegador faz na volta:
// PBKDF2-SHA256 (210k iteracoes) para derivar a chave, AES-256-GCM
// para cifrar. Sao os mesmos parametros do lado do cliente.
// ---------------------------------------------------------------
const ITERACOES = 210000;

function criptografar(texto, senha) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const chave = crypto.pbkdf2Sync(senha, salt, ITERACOES, 32, 'sha256');

  const cipher = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const cifrado = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // Web Crypto espera o tag concatenado ao final do conteudo cifrado.
    dados: Buffer.concat([cifrado, tag]).toString('base64'),
  };
}

// ---------------------------------------------------------------
// Tela de senha + ponte para o dashboard original.
// ---------------------------------------------------------------
function telaSenha(pacote) {
  return `
<div id="portao" style="position:fixed;inset:0;z-index:9999;background:#0B0920;
  display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:Montserrat,system-ui,sans-serif">
  <div style="width:100%;max-width:380px;text-align:center">
    <div style="font-size:21px;font-weight:800;letter-spacing:.14em;color:#fff;margin-bottom:8px">
      VÉRTICE<span style="color:#A855F7">.</span>
    </div>
    <div style="font-size:12.5px;color:rgba(255,255,255,.45);margin-bottom:30px;
      letter-spacing:.04em">Relatório de tráfego</div>

    <form id="fSenha" autocomplete="off">
      <input id="iSenha" type="password" placeholder="Senha de acesso" autocomplete="current-password"
        style="width:100%;padding:14px 16px;border-radius:11px;
          background:rgba(255,255,255,.05);border:1px solid rgba(168,85,247,.25);
          color:#fff;font-size:15px;font-family:inherit;outline:none;text-align:center">
      <button type="submit" id="bEntrar"
        style="width:100%;margin-top:12px;padding:14px;border-radius:11px;border:none;
          background:#6B21E8;color:#fff;font-size:14.5px;font-weight:700;
          font-family:inherit;cursor:pointer;letter-spacing:.03em">Entrar</button>
    </form>

    <div id="mSenha" style="margin-top:16px;font-size:13px;color:#f87171;min-height:20px"></div>
  </div>
</div>

<script>
/* ============================================================
   Portão de acesso.
   Os dados do painel estão criptografados (AES-GCM) dentro desta
   página. A senha deriva a chave — sem ela não há nada legível
   para ler no código-fonte nem para baixar por URL.
   ============================================================ */
const PACOTE = ${JSON.stringify(pacote)};
let COFRE = null;   // dados decifrados, preenchido após a senha correta

const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function abrir(senha){
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey(
    { name:'PBKDF2', salt:b64(PACOTE.salt), iterations:${ITERACOES}, hash:'SHA-256' },
    base, { name:'AES-GCM', length:256 }, false, ['decrypt']
  );
  const claro = await crypto.subtle.decrypt(
    { name:'AES-GCM', iv:b64(PACOTE.iv) }, chave, b64(PACOTE.dados)
  );
  return JSON.parse(new TextDecoder().decode(claro));
}

document.getElementById('fSenha').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('bEntrar');
  const msg = document.getElementById('mSenha');
  const senha = document.getElementById('iSenha').value;

  if(!senha) return;
  btn.disabled = true; btn.textContent = 'Verificando...'; msg.textContent = '';

  try{
    COFRE = await abrir(senha);
    sessionStorage.setItem('vertice_s', senha);   // não repete a senha ao navegar
    document.getElementById('portao').remove();
    iniciar();                                     // função do dashboard original
  }catch(err){
    // AES-GCM falha na autenticação quando a senha está errada.
    msg.textContent = 'Senha incorreta.';
    btn.disabled = false; btn.textContent = 'Entrar';
    document.getElementById('iSenha').select();
  }
});

/* Já autenticado nesta aba: entra direto. */
(async () => {
  const s = sessionStorage.getItem('vertice_s');
  if(!s) return;
  try{
    COFRE = await abrir(s);
    document.getElementById('portao').remove();
    iniciar();
  }catch(e){ sessionStorage.removeItem('vertice_s'); }
})();
<\/script>
`;
}

// ---------------------------------------------------------------
function main() {
  const senha = lerSenha();

  const arquivoDash = path.join(ORIGEM, 'dashboard.html');
  if (!fs.existsSync(arquivoDash)) {
    console.error(`\nNao encontrei o dashboard em:\n  ${arquivoDash}\n`);
    process.exit(1);
  }

  let html = fs.readFileSync(arquivoDash, 'utf8');

  // --- junta o indice e os dados de cada cliente num pacote so ---
  const indice = JSON.parse(fs.readFileSync(path.join(DADOS, 'clientes.json'), 'utf8'));
  const ativos = (indice.clientes || []).filter((c) => c.ativo !== false);

  if (!ativos.length) {
    console.error('\nNenhum cliente ativo em dados/clientes.json.\n');
    process.exit(1);
  }

  const cofre = { 'dados/clientes.json': indice };
  for (const c of ativos) {
    const arq = path.join(DADOS, `${c.slug}.json`);
    if (!fs.existsSync(arq)) {
      console.log(`  aviso: ${c.slug}.json nao encontrado, cliente ignorado`);
      continue;
    }
    cofre[`dados/${c.slug}.json`] = JSON.parse(fs.readFileSync(arq, 'utf8'));
    console.log(`  incluido: ${c.nome}`);
  }

  const pacote = criptografar(JSON.stringify(cofre), senha);

  // --- o painel busca por fetch; aqui ele passa a ler do cofre ---
  // Regex em vez de texto literal: nao depende de CRLF/LF nem de espacos.
  const reCarregar = /async\s+function\s+carregarJSON\s*\([^)]*\)\s*\{[\s\S]*?\n\}/;
  const substituto = `async function carregarJSON(c){
  /* Publicado: os dados vem do cofre decifrado, nao de arquivo externo. */
  const nome=c.replace(/^.*?(dados\\/)/,'$1');
  if(COFRE && COFRE[nome]) return JSON.parse(JSON.stringify(COFRE[nome]));
  throw new Error(nome+' nao esta no pacote publicado');
}`;

  if (!reCarregar.test(html)) {
    console.error('\nNao consegui localizar carregarJSON() no dashboard.html.');
    console.error('O arquivo original mudou — ajuste o regex em scripts/publicar.js.\n');
    process.exit(1);
  }
  html = html.replace(reCarregar, substituto);

  // --- o dashboard chama iniciar() sozinho; agora quem chama e o portao ---
  const autoStart = 'iniciar();';
  const ultima = html.lastIndexOf(autoStart);
  if (ultima === -1) {
    console.error('\nNao encontrei a chamada iniciar() no dashboard.html.\n');
    process.exit(1);
  }
  html = html.slice(0, ultima) +
    '/* iniciar() e chamado pelo portao de senha, apos decifrar. */' +
    html.slice(ultima + autoStart.length);

  // --- injeta o portao e o noindex ---
  html = html.replace('</head>',
    '<meta name="robots" content="noindex, nofollow">\n</head>');
  html = html.replace('</body>', telaSenha(pacote) + '\n</body>');

  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(SAIDA, '.nojekyll'), '', 'utf8');

  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
  console.log(`\nGerado docs/index.html (${kb} KB)`);
  console.log('Dados criptografados com AES-256-GCM. Sem a senha, nada legivel.');
}

main();

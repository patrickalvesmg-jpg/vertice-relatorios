// Empacota o dashboard da Vertice em paginas protegidas por senha,
// UMA POR CLIENTE.
//
// Uso: node scripts/publicar.js
//
// Gera:
//   docs/index.html            indice com os clientes
//   docs/<slug>/index.html     relatorio daquele cliente
//
// Cada pasta leva SOMENTE os dados do proprio cliente. Assim o link de um
// cliente nao da acesso aos numeros de outro, mesmo com a senha correta —
// os dados dos demais simplesmente nao estao naquele arquivo.
//
// Por que embutir em vez de servir JSON separado: no GitHub Pages qualquer
// arquivo e acessivel por URL direta. Uma tela de senha em JS esconderia a
// tela, mas dados/cliente.json continuaria baixavel. Criptografado dentro do
// HTML, sem a senha nao existe nada legivel para baixar.

// Favicon da marca, usado nas duas paginas geradas.
const ICONES = [
  "<link rel=\"icon\" type=\"image/png\" sizes=\"32x32\" href=\"/img/favicon-32.png\">",
  "<link rel=\"icon\" type=\"image/png\" sizes=\"16x16\" href=\"/img/favicon-16.png\">",
  "<link rel=\"apple-touch-icon\" sizes=\"180x180\" href=\"/img/apple-touch-icon.png\">",
  "<meta name=\"theme-color\" content=\"#6B21E8\">",
].join('\n');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const ORIGEM = path.join(RAIZ, '..', 'dashboard-trafego');
const SAIDA = path.join(RAIZ, 'docs');           // GitHub Pages serve /docs
const CONFIG = path.join(RAIZ, 'senha.txt');     // fora do Git
// Senha propria por cliente: { "<slug>": "<senha>" }. Fora do Git; no
// GitHub Actions vem do Secret SENHAS_CLIENTES. Quem nao estiver aqui usa
// a senha de senha.txt.
const SENHAS_CLIENTES = path.join(RAIZ, 'senhas-clientes.json');

// O dashboard.html e os dados moram em ../dashboard-trafego. Na automacao
// (GitHub Actions) esse projeto nao existe, entao ha uma copia em
// scripts/. A copia local sempre perde para o original: assim nao
// existem duas versoes do painel divergindo sem ninguem perceber.
function origemDe(relativo, alternativa) {
  const oficial = path.join(ORIGEM, relativo);
  if (fs.existsSync(oficial)) return oficial;
  return path.join(__dirname, alternativa);
}

const DADOS = fs.existsSync(path.join(ORIGEM, 'dados'))
  ? path.join(ORIGEM, 'dados')
  : path.join(__dirname, 'dados');

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

// Por que senha por cliente (12/11/2026, entrada da Vital Clean): com uma
// senha so, o cliente que a recebe consegue abrir /<outro-cliente>/ e ver
// investimento e vendas de outra empresa — cada pagina leva so os proprios
// dados, mas a MESMA chave abria todas. Com senha propria, a senha da Vital
// Clean nao decifra a pagina da CFC, e vice-versa.
function lerSenhasClientes() {
  if (!fs.existsSync(SENHAS_CLIENTES)) return {};
  let mapa;
  try {
    mapa = JSON.parse(fs.readFileSync(SENHAS_CLIENTES, 'utf8'));
  } catch (e) {
    console.error(`\nsenhas-clientes.json invalido: ${e.message}\n`);
    process.exit(1);
  }
  for (const [slug, s] of Object.entries(mapa)) {
    if (typeof s !== 'string' || s.trim().length < 6) {
      console.error(`\nA senha de "${slug}" precisa de pelo menos 6 caracteres.\n`);
      process.exit(1);
    }
    mapa[slug] = s.trim();
  }
  return mapa;
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
  /* A senha pode vir de tres lugares, nesta ordem:
     1. o hash da URL (#k=...) — e como o sistema interno da Vertice abre
        o relatorio ja destravado, sem o Patrick digitar de novo;
     2. a sessao, de um acesso anterior nesta aba;
     3. o formulario.

     O hash e usado, e nao um parametro ?senha=, porque o que vem depois
     do # NAO e enviado ao servidor: nao entra em log de acesso nem no
     cabecalho Referer ao clicar num link de saida. Ele tambem e apagado
     da barra de enderecos assim que lido, para nao ficar no historico
     nem ser copiado junto se o cliente compartilhar o endereco. */
  let s = null, veioDoLink = false;

  const m = location.hash.match(/[#&]k=([^&]+)/);
  if(m){
    try{ s = decodeURIComponent(escape(atob(decodeURIComponent(m[1])))); veioDoLink = true; }
    catch(e){ s = null; }
    history.replaceState(null, '', location.pathname + location.search);
  }
  if(!s) s = sessionStorage.getItem('vertice_s');
  if(!s) return;

  try{
    COFRE = await abrir(s);
    if(veioDoLink) sessionStorage.setItem('vertice_s', s);
    document.getElementById('portao').remove();
    iniciar();
  }catch(e){ sessionStorage.removeItem('vertice_s'); }
})();
<\/script>
`;
}

// Aplica no dashboard original as mudancas comuns a todos os clientes.
function prepararBase(html) {
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

  // --- filtro de abertura ---
  // O painel abre no mes corrente (aplicar('mes')), decisao do Patrick em
  // 21/08/2026. O site publicado usa o MESMO filtro: antes ele sobrescrevia
  // com um recorte de 2 meses, e o cliente caia num total acumulado em vez
  // do mes. Aqui so conferimos que a chamada continua existindo — se o
  // original mudar de forma, e melhor parar do que publicar em silencio
  // com um filtro que ninguem escolheu.
  if (!/aplicar\(\s*'mes'\s*\)\s*;/.test(html)) {
    console.error('\nNao encontrei aplicar(\'mes\') no dashboard.html.');
    console.error('O filtro de abertura mudou — ajuste scripts/publicar.js.\n');
    process.exit(1);
  }

  // --- o seletor de cliente nao faz sentido numa pagina de um cliente so ---
  html = html.replace(
    /function\s+montarSeletor\s*\([^)]*\)\s*\{[\s\S]*?\n\}/,
    `function montarSeletor(ativos,atual){
  /* Publicado: uma pagina por cliente, entao o seletor fica oculto. */
  const s=el('selCliente');
  if(s) s.style.display='none';
}`
  );

  // --- auto-refresh: no site publicado, releR o cofre nao traz nada ---
  // No painel local o auto-refresh refaz o fetch do JSON e pega o arquivo
  // que o .bat regravou. Aqui os dados estao cifrados DENTRO desta pagina:
  // reler o cofre devolveria sempre os mesmos numeros e o rodape mentiria
  // "verificado agora" sem nada ter sido verificado.
  //
  // O dado novo chega quando o GitHub Actions republica o HTML (de hora em
  // hora). Entao o refresh aqui checa se o proprio arquivo mudou no
  // servidor e, se mudou, recarrega a pagina inteira.
  const reAtualizar = /async\s+function\s+atualizarDados\s*\(\s*\)\s*\{[\s\S]*?\n\}/;
  if (reAtualizar.test(html)) {
    html = html.replace(reAtualizar, `async function atualizarDados(){
  /* Publicado: os dados vem cifrados nesta pagina. Reler o cofre nao
     traria numero novo — a atualizacao chega quando a automacao
     republica o HTML. Aqui so verificamos se isso ja aconteceu. */
  try{
    const r=await fetch(location.pathname,{method:'HEAD',cache:'no-store'});
    const tag=r.headers.get('etag')||r.headers.get('last-modified');
    if(tag && window.__tagPagina && tag!==window.__tagPagina){
      location.reload();
      return;
    }
    if(tag && !window.__tagPagina) window.__tagPagina=tag;
    marcarAtualizacao(false);
  }catch(e){
    /* silencioso: sem rede, a pagina segue com os dados que ja tem */
  }
}`);
  } else {
    console.error('\nNao consegui localizar atualizarDados() no dashboard.html.');
    console.error('O arquivo original mudou — ajuste o regex em scripts/publicar.js.\n');
    process.exit(1);
  }

  // --- noindex ---
  return html.replace('</head>',
    '<meta name="robots" content="noindex, nofollow">\n' + ICONES + '\n</head>');
}

// Pagina de indice: so a marca, SEM a lista de clientes. Ate 12/11/2026
// ela listava todos — com mais de um cliente, quem abrisse a raiz veria o
// nome das outras empresas atendidas. Cada cliente entra pelo proprio link.
function paginaIndice() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Relatórios — Vértice Assessoria</title>
${ICONES}
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0B0920;color:#fff;font-family:Montserrat,system-ui,sans-serif;
  min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.wrap{width:100%;max-width:440px}
.marca{font-size:21px;font-weight:800;letter-spacing:.14em;text-align:center;margin-bottom:6px}
.marca span{color:#A855F7}
.sub{font-size:12.5px;color:rgba(255,255,255,.45);text-align:center;
  letter-spacing:.04em;margin-bottom:34px}
.item{display:flex;align-items:center;gap:14px;padding:18px 20px;margin-bottom:10px;
  border-radius:13px;background:rgba(255,255,255,.03);
  border:1px solid rgba(168,85,247,.13);text-decoration:none;color:#fff;
  transition:background .15s,border-color .15s}
.item:hover{background:rgba(168,85,247,.09);border-color:rgba(168,85,247,.32)}
.nome{font-size:15px;font-weight:600}
.seg{font-size:11px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:.08em}
.seta{margin-left:auto;color:#A855F7;font-size:17px}
.rodape{margin-top:30px;text-align:center;font-size:11.5px;color:rgba(255,255,255,.25)}
.aviso{padding:18px 20px;border-radius:13px;background:rgba(255,255,255,.03);
  border:1px solid rgba(168,85,247,.13);font-size:14px;line-height:1.55;
  color:rgba(255,255,255,.75);text-align:center}
</style>
</head>
<body>
  <div class="wrap">
    <div class="marca">VÉRTICE<span>.</span></div>
    <div class="sub">Relatórios de tráfego</div>
    <div class="aviso">Para ver o seu relatório, use o link que você recebeu da Vértice.</div>
    <div class="rodape">Acesso restrito · cada relatório exige senha</div>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------
function main() {
  const senha = lerSenha();
  const senhasProprias = lerSenhasClientes();

  const arquivoDash = origemDe('dashboard.html', 'dashboard.html');
  if (!fs.existsSync(arquivoDash)) {
    console.error(`\nNao encontrei o dashboard em:\n  ${arquivoDash}\n`);
    process.exit(1);
  }
  console.log(`  painel: ${arquivoDash.startsWith(ORIGEM) ? 'original' : 'copia (automacao)'}`);

  const base = prepararBase(fs.readFileSync(arquivoDash, 'utf8'));

  const indice = JSON.parse(fs.readFileSync(path.join(DADOS, 'clientes.json'), 'utf8'));
  const ativos = (indice.clientes || []).filter((c) => c.ativo !== false);

  if (!ativos.length) {
    console.error('\nNenhum cliente ativo em dados/clientes.json.\n');
    process.exit(1);
  }

  fs.mkdirSync(SAIDA, { recursive: true });
  fs.writeFileSync(path.join(SAIDA, '.nojekyll'), '', 'utf8');

  const publicados = [];

  const faltando = [];

  for (const c of ativos) {
    const arq = path.join(DADOS, `${c.slug}.json`);
    if (!fs.existsSync(arq)) {
      console.log(`  aviso: ${c.slug}.json nao encontrado, cliente ignorado`);
      faltando.push(c.slug);
      continue;
    }

    const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));

    // O cofre desta pagina leva SO este cliente. O indice tambem vai
    // reduzido a ele, senao o painel listaria os outros no seletor.
    const cofre = {
      'dados/clientes.json': { ...indice, clientes: [c] },
      [`dados/${c.slug}.json`]: dados,
    };

    const propria = Object.prototype.hasOwnProperty.call(senhasProprias, c.slug);
    // Cliente marcado com senha_propria NUNCA sai com a senha padrao: se o
    // Secret SENHAS_CLIENTES sumir, publicar com a padrao reabriria o
    // vazamento entre clientes sem ninguem notar. Melhor deixar no ar a
    // versao anterior da pagina dele.
    if (c.senha_propria && !propria) {
      console.log(`  ERRO: ${c.slug} exige senha propria e ela nao veio (senhas-clientes.json / Secret SENHAS_CLIENTES). Pagina NAO atualizada.`);
      faltando.push(c.slug);
      continue;
    }
    const pacote = criptografar(JSON.stringify(cofre), propria ? senhasProprias[c.slug] : senha);
    const html = base.replace('</body>', telaSenha(pacote) + '\n</body>');

    const pasta = path.join(SAIDA, c.slug);
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'index.html'), html, 'utf8');

    const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0);
    const ate = dados.periodo_disponivel?.ate || '?';
    console.log(`  ${c.slug}/  ${c.nome} (${kb} KB, dados ate ${ate}, senha ${propria ? 'propria' : 'padrao'})`);
    publicados.push(c);
  }

  // Nenhum cliente gerado = site vazio. Melhor parar e deixar no ar o que
  // ja estava publicado do que substituir por uma pagina sem nada. Acontece
  // quando a Meta recusa a chamada e os dados nao chegaram a ser gravados.
  if (!publicados.length) {
    console.error('\nNenhum relatorio pode ser gerado — dados ausentes para: ' +
      faltando.join(', '));
    console.error('O site publicado NAO foi alterado.\n');
    process.exit(1);
  }

  fs.writeFileSync(path.join(SAIDA, 'index.html'), paginaIndice(), 'utf8');

  console.log(`\n${publicados.length} relatorio(s) gerado(s) em docs/`);
  console.log('Cada pagina leva apenas os dados do proprio cliente.');
  console.log('Dados criptografados com AES-256-GCM. Sem a senha, nada legivel.');
}

main();

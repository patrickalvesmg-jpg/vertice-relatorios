# Relatórios Vértice

Publicação do dashboard de tráfego da Vértice Assessoria. Gera um site
estático protegido por senha, hospedado no GitHub Pages, onde cada cliente
acompanha os resultados das campanhas.

## Como publicar

```bash
# 1. atualiza os dados dos clientes (na pasta vertice-meta-api)
cd ../vertice-meta-api
./atualizar-dashboard.bat

# 2. gera o site protegido
cd ../vertice-relatorios
node scripts/publicar.js

# 3. sobe
git add docs/
git commit -m "atualiza relatorios"
git push
```

O GitHub Pages publica a pasta `docs/`. Alguns minutos depois o site está
no ar com os números novos.

## Senha de acesso

Fica em `senha.txt`, na raiz — **fora do Git**. Sem esse arquivo o
`publicar.js` não roda.

Se precisar trocar: edite `senha.txt`, rode `publicar.js` de novo e dê
push. A senha antiga para de funcionar na hora, porque os dados são
recriptografados.

É a mesma senha para todos os clientes. Isso significa que um cliente com
a senha consegue abrir o relatório de outro trocando o seletor no topo do
painel — considere isso antes de adicionar clientes concorrentes entre si.

## Como a proteção funciona

O GitHub Pages serve arquivos estáticos, e qualquer arquivo é acessível por
URL direta. Uma tela de senha em JavaScript esconderia a tela, mas
`dados/cliente.json` continuaria podendo ser baixado.

Por isso os dados não vão em arquivo separado: eles são **criptografados
com AES-256-GCM** e embutidos dentro do `index.html`. A senha deriva a
chave (PBKDF2-SHA256, 210 mil iterações) já no navegador.

Sem a senha correta não existe nada legível — nem no código-fonte, nem por
URL. Verificado: nome do cliente, ID da conta de anúncio, valores e nomes
de campanha não aparecem em texto claro no arquivo publicado.

A página também vai com `noindex, nofollow`, então buscadores não a listam.

### O que isso não protege

- Quem tem a senha pode salvar a página e repassar os dados.
- Não é autenticação de verdade: não há usuário, sessão no servidor nem
  registro de quem acessou.

Para o uso pretendido — o cliente abrir o link e ver os próprios números,
sem que o relatório circule aberto na internet — é adequado. Se um dia
precisar de acesso por usuário, aí o caminho é um backend de verdade.

## Estrutura

```
vertice-relatorios/
├── docs/                 site publicado (gerado — não editar à mão)
│   ├── index.html        dashboard + dados criptografados
│   └── .nojekyll
├── scripts/
│   └── publicar.js       empacotador
├── senha.txt             senha de acesso (fora do Git)
└── README.md
```

O `dashboard.html` original **não** é copiado para cá. A fonte da verdade
continua em `Projetos/vertice/dashboards/trafego/dashboard.html`, e o
`publicar.js` lê de lá na hora de gerar. Assim não existem duas versões do
painel para manter em sincronia.

## Adicionar um cliente

1. Cadastre em `CLIENTES` no topo de
   `../vertice-meta-api/src/gerar-dados-dashboard.js`
2. Acrescente o cliente em
   `../vertice/dashboards/trafego/dados/clientes.json`
3. Adicione a linha correspondente em `atualizar-dashboard.bat`
4. Rode o `.bat` e depois `publicar.js`

Só clientes com `ativo: true` entram no site publicado.

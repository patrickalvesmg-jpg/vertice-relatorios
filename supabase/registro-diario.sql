-- ============================================================
-- REGISTRO DIARIO DO COMERCIAL (relatorio de trafego da Vertice)
-- Projeto Supabase central (hyypvthzalzexhuwojjn), schema proprio
-- "relatorio" — nada em public e tocado.
--
-- Criado em 12/11/2026, a pedido do Patrick: o cliente (primeiro: Vital
-- Clean) anota no proprio relatorio, uma vez por dia, quantas mensagens
-- chegaram, reunioes agendadas e feitas, propostas enviadas, contratos
-- fechados e o valor fechado. O relatorio cruza isso com o investimento
-- em anuncio (custo por cliente, retorno, projecao).
--
-- Seguranca:
--  - As tabelas nao tem GRANT nem policy: ninguem le ou grava direto.
--  - Tudo passa por duas funcoes (ler_dias, salvar_dia) que exigem a
--    mesma chave que abre o relatorio daquele cliente. O banco guarda so
--    sha256(slug || ':' || chave), nunca a chave.
--  - Cada gravacao fica no historico (antes e depois).
--
-- ORDEM (importante): rode este arquivo ANTES de colocar "relatorio" em
-- Settings > Data API > Exposed schemas. Schema exposto que nao existe
-- pode derrubar a API do painel da agencia.
--
-- Pode rodar de novo sem estragar nada (if not exists / or replace).
-- ============================================================

create schema if not exists relatorio;

create table if not exists relatorio.acessos (
  slug        text primary key,
  chave_hash  text not null,
  criado_em   timestamptz not null default now()
);

create table if not exists relatorio.dias (
  slug                text not null references relatorio.acessos(slug) on delete cascade,
  data                date not null,
  -- null = nao anotado: o relatorio usa o numero do Gerenciador nesse dia
  mensagens           integer check (mensagens >= 0),
  reunioes_agendadas  integer not null default 0 check (reunioes_agendadas >= 0),
  reunioes_feitas     integer not null default 0 check (reunioes_feitas >= 0),
  propostas           integer not null default 0 check (propostas >= 0),
  contratos           integer not null default 0 check (contratos >= 0),
  valor               numeric(12,2) not null default 0 check (valor >= 0),
  atualizado_em       timestamptz not null default now(),
  primary key (slug, data)
);

create table if not exists relatorio.historico (
  id          bigint generated always as identity primary key,
  slug        text not null,
  data        date not null,
  antes       jsonb,
  depois      jsonb not null,
  gravado_em  timestamptz not null default now()
);

alter table relatorio.acessos   enable row level security;
alter table relatorio.dias      enable row level security;
alter table relatorio.historico enable row level security;
-- (sem policy de proposito: so as funcoes abaixo, SECURITY DEFINER, entram)

-- ------------------------------------------------------------
-- Confere a chave do relatorio.
-- ------------------------------------------------------------
create or replace function relatorio._confere(p_slug text, p_chave text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from relatorio.acessos a
    where a.slug = p_slug
      and a.chave_hash = encode(sha256(convert_to(p_slug || ':' || coalesce(p_chave, ''), 'UTF8')), 'hex')
  );
$$;

-- ------------------------------------------------------------
-- Le todos os dias anotados de um cliente.
-- ------------------------------------------------------------
create or replace function relatorio.ler_dias(p_slug text, p_chave text)
returns table (
  data date, mensagens integer, reunioes_agendadas integer, reunioes_feitas integer,
  propostas integer, contratos integer, valor numeric, atualizado_em timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not relatorio._confere(p_slug, p_chave) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return query
    select d.data, d.mensagens, d.reunioes_agendadas, d.reunioes_feitas,
           d.propostas, d.contratos, d.valor, d.atualizado_em
      from relatorio.dias d
     where d.slug = p_slug
     order by d.data;
end;
$$;

-- ------------------------------------------------------------
-- Grava (ou corrige) um dia. Sempre o dia inteiro: o formulario manda
-- todos os numeros daquele dia de uma vez.
-- ------------------------------------------------------------
create or replace function relatorio.salvar_dia(
  p_slug text, p_chave text, p_data date,
  p_mensagens integer, p_reunioes_agendadas integer, p_reunioes_feitas integer,
  p_propostas integer, p_contratos integer, p_valor numeric
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_hoje   date := (now() at time zone 'America/Fortaleza')::date;
  v_antes  jsonb;
  v_depois jsonb;
begin
  if not relatorio._confere(p_slug, p_chave) then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if p_data is null or p_data > v_hoje + 1 or p_data < v_hoje - 400 then
    raise exception 'data fora do periodo permitido' using errcode = '22023';
  end if;
  if coalesce(p_mensagens, 0) < 0 or coalesce(p_reunioes_agendadas, 0) < 0
     or coalesce(p_reunioes_feitas, 0) < 0 or coalesce(p_propostas, 0) < 0
     or coalesce(p_contratos, 0) < 0 or coalesce(p_valor, 0) < 0 then
    raise exception 'os numeros nao podem ser negativos' using errcode = '22023';
  end if;
  -- trava contra numero digitado errado (um zero a mais etc.)
  if coalesce(p_mensagens, 0) > 100000 or coalesce(p_reunioes_agendadas, 0) > 10000
     or coalesce(p_reunioes_feitas, 0) > 10000 or coalesce(p_propostas, 0) > 10000
     or coalesce(p_contratos, 0) > 10000 or coalesce(p_valor, 0) > 100000000 then
    raise exception 'numero alto demais, confira o que foi digitado' using errcode = '22023';
  end if;

  select to_jsonb(d.*) - 'slug' into v_antes
    from relatorio.dias d where d.slug = p_slug and d.data = p_data;

  insert into relatorio.dias as d
    (slug, data, mensagens, reunioes_agendadas, reunioes_feitas, propostas, contratos, valor, atualizado_em)
  values
    (p_slug, p_data, p_mensagens, coalesce(p_reunioes_agendadas, 0), coalesce(p_reunioes_feitas, 0),
     coalesce(p_propostas, 0), coalesce(p_contratos, 0), round(coalesce(p_valor, 0), 2), now())
  on conflict (slug, data) do update set
    mensagens          = excluded.mensagens,
    reunioes_agendadas = excluded.reunioes_agendadas,
    reunioes_feitas    = excluded.reunioes_feitas,
    propostas          = excluded.propostas,
    contratos          = excluded.contratos,
    valor              = excluded.valor,
    atualizado_em      = now()
  returning to_jsonb(d.*) - 'slug' into v_depois;

  insert into relatorio.historico (slug, data, antes, depois)
  values (p_slug, p_data, v_antes, v_depois);

  return v_depois;
end;
$$;

-- ------------------------------------------------------------
-- Permissoes: so as duas funcoes publicas ficam alcancaveis.
-- (Funcao nasce com EXECUTE para PUBLIC no Postgres — por isso o revoke.)
-- ------------------------------------------------------------
revoke all on all tables in schema relatorio from public, anon, authenticated;
revoke execute on function relatorio._confere(text, text) from public, anon, authenticated;
revoke execute on function relatorio.ler_dias(text, text) from public;
revoke execute on function relatorio.salvar_dia(text, text, date, integer, integer, integer, integer, integer, numeric) from public;

grant usage on schema relatorio to anon, authenticated;
grant execute on function relatorio.ler_dias(text, text) to anon, authenticated;
grant execute on function relatorio.salvar_dia(text, text, date, integer, integer, integer, integer, integer, numeric) to anon, authenticated;

-- a API passa a enxergar as funcoes novas sem esperar
notify pgrst, 'reload schema';

-- ============================================================================
-- HOLD PRÊMIOS — Gestão de Rifas
-- Schema completo PostgreSQL / Supabase (Tabelas, Índices, Storage, RLS, RPCs)
-- Execute este arquivo no SQL Editor do Supabase na ordem apresentada.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABELAS PRINCIPAIS
-- ----------------------------------------------------------------------------

create table if not exists public.campaigns (
  id text primary key,
  code text not null,
  title text not null,
  week_label text not null,
  whatsapp_group_name text not null,
  image text not null,
  prizes jsonb not null default '[]'::jsonb,
  ticket_price numeric(12,2) not null check (ticket_price > 0),
  total_quotas int not null default 100 check (total_quotas = 100),
  draw_method text not null default 'sorteio_ao_vivo' check (draw_method in ('sorteio_ao_vivo', 'loteria_federal')),
  scheduled_draw_date timestamptz not null,
  status text not null default 'ativa' check (status in ('ativa', 'encerrada')),
  pix_key text not null default '',
  pix_beneficiary text not null default '',
  reservation_minutes int not null default 30 check (reservation_minutes > 0),
  confirmation_mode text not null default 'manual' check (confirmation_mode in ('banco', 'manual')),
  created_at timestamptz not null default now(),
  completed_notified_at timestamptz
);

create index if not exists idx_campaigns_status on public.campaigns (status);

create table if not exists public.orders (
  id text primary key,
  code text unique not null,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  buyer_name text not null,
  holder_name text,
  buyer_phone text not null,
  buyer_notes text,
  quotas int[] not null,
  unit_price numeric(12,2) not null check (unit_price > 0),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  payment_method text not null default 'pix' check (payment_method in ('pix', 'dinheiro', 'cartao')),
  status text not null default 'pendente' check (status in ('pago', 'pendente', 'em_analise', 'cancelado', 'expirado')),
  needs_admin boolean not null default false,
  conflict_reason text,
  surplus_amount numeric(12,2) not null default 0,
  expires_at timestamptz,
  expiry_warned_at timestamptz,
  source_message_id text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_orders_campaign_status on public.orders (campaign_id, status);
create index if not exists idx_orders_phone on public.orders (buyer_phone);
create index if not exists idx_orders_expires_at on public.orders (expires_at) where status = 'pendente';

create table if not exists public.quotas (
  campaign_id text not null references public.campaigns(id) on delete cascade,
  number int not null check (number between 1 and 100),
  status text not null default 'disponivel' check (status in ('disponivel', 'reservada', 'paga')),
  order_id text references public.orders(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (campaign_id, number)
);

create index if not exists idx_quotas_order on public.quotas (order_id);

create table if not exists public.receipts (
  id text primary key,
  order_id text references public.orders(id) on delete set null,
  campaign_id text references public.campaigns(id) on delete set null,
  buyer_phone text not null,
  source_message_id text,
  e2e text,
  image_hash text,
  amount numeric(12,2),
  payer_name text,
  recipient_name text,
  paid_at timestamptz,
  status text not null default 'em_analise' check (status in ('orfao', 'em_analise', 'revisao', 'confirmado', 'rejeitado', 'reenvio')),
  reasons jsonb not null default '[]'::jsonb,
  confidence numeric(5,4),
  image_path text,
  file_name text,
  verified_by text not null default 'ai_bot' check (verified_by in ('ai_bot', 'manual')),
  summary text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

-- Índices únicos parciais para evitar reuso de comprovante (E2E e hash da imagem)
create unique index if not exists idx_receipts_e2e_unique
  on public.receipts (e2e)
  where e2e is not null and e2e <> '' and status in ('orfao', 'em_analise', 'revisao', 'confirmado');

create unique index if not exists idx_receipts_hash_unique
  on public.receipts (image_hash)
  where image_hash is not null and image_hash <> '' and status in ('orfao', 'em_analise', 'revisao', 'confirmado');

create index if not exists idx_receipts_order on public.receipts (order_id);
create index if not exists idx_receipts_phone_status on public.receipts (buyer_phone, status);

create table if not exists public.pix_received (
  e2e text primary key,
  amount numeric(12,2) not null check (amount > 0),
  txid text,
  payer text,
  paid_at timestamptz not null default now(),
  used_order_id text references public.orders(id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.messages_log (
  source_message_id text primary key,
  phone text not null,
  endpoint text not null,
  response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.bot_settings (
  id int primary key default 1 check (id = 1),
  group_name text not null default 'Hold Prêmios — Grupo VIP Oficial',
  group_jid text not null default '',
  outbound_webhook_url text not null default '',
  admin_phones text[] not null default '{}',
  auto_confirm_with_ai boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.bot_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.prize_stock (
  id text primary key,
  name text not null,
  category text not null,
  image text not null,
  invested_value numeric(12,2) not null default 0 check (invested_value >= 0),
  quantity int not null default 1 check (quantity >= 0),
  status text not null default 'disponivel' check (status in ('disponivel', 'reservado_rifa', 'esgotado')),
  supplier text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.winners (
  id text primary key,
  campaign_id text not null references public.campaigns(id) on delete cascade,
  campaign_code text not null,
  campaign_title text not null,
  prize_position int not null,
  prize_title text not null,
  prize_image text not null,
  quota_number int not null check (quota_number between 1 and 100),
  buyer_name text not null,
  buyer_phone text not null,
  draw_method text not null,
  federal_number text,
  audit_hash text not null,
  drawn_at timestamptz not null default now(),
  delivery_status text not null default 'aguardando' check (delivery_status in ('aguardando', 'retirado_bar', 'enviado'))
);

create table if not exists public.bot_logs (
  id text primary key,
  timestamp timestamptz not null default now(),
  source text not null check (source in ('whatsapp_webhook', 'ai_agent')),
  sender_name text not null,
  sender_phone text not null,
  raw_message text not null,
  extracted_name text,
  extracted_numbers int[] not null default '{}',
  detected_amount numeric(12,2),
  tx_id text,
  status text not null check (status in ('confirmado', 'rejeitado', 'conflito')),
  summary text not null
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. TRIGGER: GERAR 100 QUOTAS AUTOMATICAMENTE AO CRIAR CAMPANHA
-- ----------------------------------------------------------------------------

create or replace function public.seed_campaign_quotas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.quotas (campaign_id, number, status)
  select new.id, g.n, 'disponivel'
  from generate_series(1, 100) as g(n)
  on conflict (campaign_id, number) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_seed_campaign_quotas on public.campaigns;
create trigger trg_seed_campaign_quotas
after insert on public.campaigns
for each row execute function public.seed_campaign_quotas();

-- ----------------------------------------------------------------------------
-- 3. STORAGE BUCKET PRIVADO PARA COMPROVANTES
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY (RLS) E BLOQUEIO DE ANON / AUTHENTICATED
-- Nenhuma tabela ou função fica acessível a anon/authenticated; todo acesso ao
-- banco ocorre exclusivamente no servidor via SUPABASE_SECRET_KEY (service_role).
-- ----------------------------------------------------------------------------

alter table public.campaigns enable row level security;
alter table public.orders enable row level security;
alter table public.quotas enable row level security;
alter table public.receipts enable row level security;
alter table public.pix_received enable row level security;
alter table public.messages_log enable row level security;
alter table public.bot_settings enable row level security;
alter table public.prize_stock enable row level security;
alter table public.winners enable row level security;
alter table public.bot_logs enable row level security;
alter table public.audit_log enable row level security;

-- ----------------------------------------------------------------------------
-- 5. FUNÇÕES TRANSACIONAIS (RPC)
-- ----------------------------------------------------------------------------

-- Helper de normalização de telefone (apenas dígitos)
create or replace function public.normalize_phone(p_raw text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_raw, ''), '[^0-9]', '', 'g');
$$;

-- Helper para gerar código curto único do pedido (ex: R3F9A)
create or replace function public.generate_order_code()
returns text
language plpgsql
as $$
declare
  v_code text;
begin
  loop
    v_code := 'R' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4));
    exit when not exists (select 1 from public.orders where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- RPC 4: credit_order(order_id, amount, origin)
create or replace function public.credit_order(
  p_order_id text,
  p_amount numeric,
  p_origin text default 'banco'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_new_paid numeric(12,2);
  v_quota_num int;
  v_quota_status text;
  v_taken int[] := '{}';
  v_shortfall numeric(12,2) := 0;
  v_surplus numeric(12,2) := 0;
begin
  if p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'result', 'rejeitado', 'error', 'Valor inválido para crédito.');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'result', 'nao_encontrado', 'error', 'Pedido não encontrado.');
  end if;

  if v_order.status = 'cancelado' then
    return jsonb_build_object('ok', false, 'result', 'cancelado', 'error', 'Pedido já cancelado.');
  end if;

  -- Se o pedido estava expirado, só reativa se TODOS os números ainda estiverem livres
  if v_order.status = 'expirado' then
    for v_quota_num in select unnest(v_order.quotas) order by 1 asc loop
      select status into v_quota_status
      from public.quotas
      where campaign_id = v_order.campaign_id and number = v_quota_num
      for update;

      if v_quota_status is distinct from 'disponivel' then
        v_taken := array_append(v_taken, v_quota_num);
      end if;
    end loop;

    if array_length(v_taken, 1) is not null then
      update public.orders
      set needs_admin = true,
          conflict_reason = 'conflito_reembolso',
          paid_amount = paid_amount + p_amount
      where id = v_order.id;

      insert into public.audit_log (actor, action, details)
      values (
        p_origin,
        'LATE_PAYMENT_CONFLICT',
        jsonb_build_object('order_id', v_order.id, 'amount', p_amount, 'taken', v_taken)
      );

      return jsonb_build_object(
        'ok', false,
        'result', 'conflito',
        'conflict', 'conflito_reembolso',
        'taken', to_jsonb(v_taken),
        'order_id', v_order.id
      );
    end if;

    -- Reativa as cotas antes de creditar
    update public.quotas
    set status = 'reservada', order_id = v_order.id, updated_at = now()
    where campaign_id = v_order.campaign_id and number = any(v_order.quotas);
  end if;

  v_new_paid := round((coalesce(v_order.paid_amount, 0) + p_amount)::numeric, 2);

  if v_new_paid >= v_order.total_amount then
    v_surplus := greatest(0, round((v_new_paid - v_order.total_amount)::numeric, 2));

    update public.orders
    set paid_amount = v_new_paid,
        status = 'pago',
        paid_at = coalesce(paid_at, now()),
        surplus_amount = v_surplus,
        needs_admin = (v_surplus > 0),
        conflict_reason = case when v_surplus > 0 then 'excedente' else null end
    where id = v_order.id;

    update public.quotas
    set status = 'paga',
        order_id = v_order.id,
        updated_at = now()
    where campaign_id = v_order.campaign_id
      and number = any(v_order.quotas);

    insert into public.audit_log (actor, action, details)
    values (
      p_origin,
      'ORDER_CREDITED_PAID',
      jsonb_build_object('order_id', v_order.id, 'credited', p_amount, 'paid_amount', v_new_paid, 'surplus', v_surplus)
    );

    return jsonb_build_object(
      'ok', true,
      'result', 'confirmado',
      'order_id', v_order.id,
      'paid_amount', v_new_paid,
      'total_amount', v_order.total_amount,
      'surplus', v_surplus
    );
  else
    v_shortfall := round((v_order.total_amount - v_new_paid)::numeric, 2);

    update public.orders
    set paid_amount = v_new_paid,
        status = 'pendente',
        expires_at = greatest(coalesce(expires_at, now()), now()) + interval '30 minutes'
    where id = v_order.id;

    update public.quotas
    set status = 'reservada',
        order_id = v_order.id,
        updated_at = now()
    where campaign_id = v_order.campaign_id
      and number = any(v_order.quotas)
      and status = 'disponivel';

    insert into public.audit_log (actor, action, details)
    values (
      p_origin,
      'ORDER_CREDITED_PARTIAL',
      jsonb_build_object('order_id', v_order.id, 'credited', p_amount, 'paid_amount', v_new_paid, 'shortfall', v_shortfall)
    );

    return jsonb_build_object(
      'ok', true,
      'result', 'parcial',
      'order_id', v_order.id,
      'paid_amount', v_new_paid,
      'total_amount', v_order.total_amount,
      'shortfall', v_shortfall
    );
  end if;
end;
$$;

-- RPC 1: create_order
create or replace function public.create_order(
  p_campaign_id text,
  p_phone text,
  p_buyer_name text,
  p_holder_name text default null,
  p_quotas int[] default null,
  p_quantity int default null,
  p_source_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cached jsonb;
  v_camp public.campaigns%rowtype;
  v_phone text;
  v_pending_count int;
  v_sorted_quotas int[];
  v_taken int[] := '{}';
  v_suggestions int[] := '{}';
  v_q_num int;
  v_q_status text;
  v_order_id text;
  v_order_code text;
  v_total numeric(12,2);
  v_expires_at timestamptz;
  v_res jsonb;
begin
  -- Idempotência por source_message_id
  if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
    select response into v_cached
    from public.messages_log
    where source_message_id = p_source_message_id;

    if found then
      return v_cached;
    end if;
  end if;

  v_phone := public.normalize_phone(p_phone);
  if length(v_phone) < 8 then
    return jsonb_build_object('ok', false, 'status', 422, 'error', 'invalid_phone', 'message', 'Telefone inválido.');
  end if;

  select * into v_camp
  from public.campaigns
  where id = p_campaign_id and status = 'ativa';

  if not found then
    return jsonb_build_object('ok', false, 'status', 404, 'error', 'campaign_not_found', 'message', 'Nenhuma rifa ativa encontrada.');
  end if;

  -- Limite de 3 pedidos em aberto por telefone
  select count(*) into v_pending_count
  from public.orders
  where campaign_id = v_camp.id
    and public.normalize_phone(buyer_phone) = v_phone
    and status in ('pendente', 'em_analise');

  if v_pending_count >= 3 then
    return jsonb_build_object('ok', false, 'status', 429, 'error', 'too_many_pending_orders', 'message', 'Limite de 3 pedidos em aberto atingido para este telefone.');
  end if;

  -- Determina números solicitados ou sorteia por quantidade com FOR UPDATE SKIP LOCKED
  if p_quotas is not null and array_length(p_quotas, 1) is not null then
    select array_agg(distinct x order by x asc)
    into v_sorted_quotas
    from unnest(p_quotas) as x;

    if array_length(v_sorted_quotas, 1) > 20 then
      return jsonb_build_object('ok', false, 'status', 422, 'error', 'max_quotas_exceeded', 'message', 'Máximo de 20 números por pedido.');
    end if;

    if exists (select 1 from unnest(v_sorted_quotas) as x where x is null or x < 1 or x > 100) then
      return jsonb_build_object('ok', false, 'status', 422, 'error', 'invalid_quota_number', 'message', 'Números devem estar entre 1 e 100.');
    end if;

    -- Trava todas as linhas solicitadas em ordem crescente (evita deadlock)
    for v_q_num in select unnest(v_sorted_quotas) order by 1 asc loop
      select status into v_q_status
      from public.quotas
      where campaign_id = v_camp.id and number = v_q_num
      for update;

      if not found or v_q_status <> 'disponivel' then
        v_taken := array_append(v_taken, v_q_num);
      end if;
    end loop;

    if array_length(v_taken, 1) is not null then
      select coalesce(array_agg(number order by number), '{}')
      into v_suggestions
      from (
        select number
        from public.quotas
        where campaign_id = v_camp.id and status = 'disponivel'
        order by random()
        limit 5
      ) s;

      v_res := jsonb_build_object(
        'ok', false,
        'status', 409,
        'error', 'quotas_taken',
        'taken', to_jsonb(v_taken),
        'suggestions', to_jsonb(v_suggestions)
      );

      if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
        insert into public.messages_log (source_message_id, phone, endpoint, response)
        values (p_source_message_id, v_phone, 'create_order', v_res)
        on conflict (source_message_id) do nothing;
      end if;

      return v_res;
    end if;
  else
    if p_quantity is null or p_quantity < 1 or p_quantity > 20 then
      return jsonb_build_object('ok', false, 'status', 422, 'error', 'invalid_quantity', 'message', 'Informe de 1 a 20 números.');
    end if;

    select array_agg(number order by number asc)
    into v_sorted_quotas
    from (
      select number
      from public.quotas
      where campaign_id = v_camp.id and status = 'disponivel'
      order by random()
      limit p_quantity
      for update skip locked
    ) picked;

    if v_sorted_quotas is null or array_length(v_sorted_quotas, 1) < p_quantity then
      return jsonb_build_object('ok', false, 'status', 409, 'error', 'insufficient_quotas', 'message', 'Não há números suficientes disponíveis.');
    end if;
  end if;

  v_order_id := 'ord-' || replace(gen_random_uuid()::text, '-', '');
  v_order_code := public.generate_order_code();
  v_total := round((array_length(v_sorted_quotas, 1) * v_camp.ticket_price)::numeric, 2);
  v_expires_at := now() + make_interval(mins => greatest(1, coalesce(v_camp.reservation_minutes, 30)));

  insert into public.orders (
    id, code, campaign_id, buyer_name, holder_name, buyer_phone,
    quotas, unit_price, total_amount, paid_amount, payment_method,
    status, expires_at, source_message_id
  ) values (
    v_order_id, v_order_code, v_camp.id, trim(coalesce(p_buyer_name, 'Participante')),
    nullif(trim(coalesce(p_holder_name, '')), ''), p_phone,
    v_sorted_quotas, v_camp.ticket_price, v_total, 0, 'pix',
    'pendente', v_expires_at, p_source_message_id
  );

  update public.quotas
  set status = 'reservada', order_id = v_order_id, updated_at = now()
  where campaign_id = v_camp.id and number = any(v_sorted_quotas);

  -- Vincula comprovantes órfãos do mesmo telefone recebidos nas últimas 24h
  update public.receipts
  set order_id = v_order_id,
      campaign_id = v_camp.id,
      status = 'em_analise'
  where public.normalize_phone(buyer_phone) = v_phone
    and status = 'orfao'
    and created_at >= now() - interval '24 hours';

  if found then
    update public.orders
    set status = 'em_analise', needs_admin = true
    where id = v_order_id;
  end if;

  v_res := jsonb_build_object(
    'ok', true,
    'status', 201,
    'order', jsonb_build_object(
      'id', v_order_id,
      'code', v_order_code,
      'campaignId', v_camp.id,
      'buyerName', trim(coalesce(p_buyer_name, 'Participante')),
      'quotas', to_jsonb(v_sorted_quotas),
      'totalAmount', v_total,
      'expiresAt', v_expires_at
    )
  );

  if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
    insert into public.messages_log (source_message_id, phone, endpoint, response)
    values (p_source_message_id, v_phone, 'create_order', v_res)
    on conflict (source_message_id) do nothing;
  end if;

  return v_res;
end;
$$;

-- RPC 2: register_receipt
create or replace function public.register_receipt(
  p_phone text,
  p_source_message_id text,
  p_e2e text,
  p_image_hash text,
  p_amount numeric,
  p_payer_name text,
  p_recipient_name text,
  p_paid_at timestamptz,
  p_pre_status text,
  p_reasons jsonb,
  p_confidence numeric,
  p_image_path text,
  p_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cached jsonb;
  v_phone text;
  v_dup public.receipts%rowtype;
  v_open_count int;
  v_target_order public.orders%rowtype;
  v_late_order public.orders%rowtype;
  v_camp public.campaigns%rowtype;
  v_pix public.pix_received%rowtype;
  v_receipt_id text;
  v_receipt_status text;
  v_credit_res jsonb;
  v_res jsonb;
begin
  -- Idempotência por source_message_id
  if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
    select response into v_cached
    from public.messages_log
    where source_message_id = p_source_message_id;

    if found then
      return v_cached;
    end if;
  end if;

  v_phone := public.normalize_phone(p_phone);

  -- Bloqueia E2E ou image_hash duplicados em comprovantes ativos
  if p_e2e is not null and length(trim(p_e2e)) > 0 then
    select * into v_dup
    from public.receipts
    where e2e = trim(p_e2e)
      and status in ('orfao', 'em_analise', 'revisao', 'confirmado')
    limit 1;

    if found then
      v_res := jsonb_build_object('ok', false, 'result', 'duplicado', 'reason', 'e2e_duplicado', 'existingReceiptId', v_dup.id);
      if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
        insert into public.messages_log (source_message_id, phone, endpoint, response)
        values (p_source_message_id, v_phone, 'register_receipt', v_res)
        on conflict (source_message_id) do nothing;
      end if;
      return v_res;
    end if;
  end if;

  if p_image_hash is not null and length(trim(p_image_hash)) > 0 then
    select * into v_dup
    from public.receipts
    where image_hash = trim(p_image_hash)
      and status in ('orfao', 'em_analise', 'revisao', 'confirmado')
    limit 1;

    if found then
      v_res := jsonb_build_object('ok', false, 'result', 'duplicado', 'reason', 'image_hash_duplicado', 'existingReceiptId', v_dup.id);
      if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
        insert into public.messages_log (source_message_id, phone, endpoint, response)
        values (p_source_message_id, v_phone, 'register_receipt', v_res)
        on conflict (source_message_id) do nothing;
      end if;
      return v_res;
    end if;
  end if;

  v_receipt_id := 'rcp-' || replace(gen_random_uuid()::text, '-', '');

  -- Se já veio rejeitado pela pré-triagem
  if p_pre_status = 'rejeitar' then
    insert into public.receipts (
      id, buyer_phone, source_message_id, e2e, image_hash, amount, payer_name,
      recipient_name, paid_at, status, reasons, confidence, image_path, file_name, summary
    ) values (
      v_receipt_id, p_phone, p_source_message_id, nullif(trim(coalesce(p_e2e, '')), ''),
      nullif(trim(coalesce(p_image_hash, '')), ''), p_amount, p_payer_name,
      p_recipient_name, p_paid_at, 'rejeitado', coalesce(p_reasons, '[]'::jsonb),
      p_confidence, p_image_path, p_file_name, 'Rejeitado na triagem automática.'
    );

    v_res := jsonb_build_object('ok', true, 'result', 'rejeitado', 'receiptId', v_receipt_id);
    if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
      insert into public.messages_log (source_message_id, phone, endpoint, response)
      values (p_source_message_id, v_phone, 'register_receipt', v_res)
      on conflict (source_message_id) do nothing;
    end if;
    return v_res;
  end if;

  -- Busca pedidos em aberto exclusivamente pelo telefone normalizado
  select count(*) into v_open_count
  from public.orders o
  join public.campaigns c on c.id = o.campaign_id
  where c.status = 'ativa'
    and public.normalize_phone(o.buyer_phone) = v_phone
    and o.status in ('pendente', 'em_analise');

  if v_open_count = 1 then
    select o.* into v_target_order
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
    where c.status = 'ativa'
      and public.normalize_phone(o.buyer_phone) = v_phone
      and o.status in ('pendente', 'em_analise')
    limit 1;
  elsif v_open_count > 1 then
    -- Tenta casar exatamente pelo valor restante
    select o.* into v_target_order
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
    where c.status = 'ativa'
      and public.normalize_phone(o.buyer_phone) = v_phone
      and o.status in ('pendente', 'em_analise')
      and abs((o.total_amount - o.paid_amount) - coalesce(p_amount, -1)) < 0.01
    limit 2;

    -- Se não achou único match pelo valor, retorna ambiguo
    if not found or (
      select count(*)
      from public.orders o
      join public.campaigns c on c.id = o.campaign_id
      where c.status = 'ativa'
        and public.normalize_phone(o.buyer_phone) = v_phone
        and o.status in ('pendente', 'em_analise')
        and abs((o.total_amount - o.paid_amount) - coalesce(p_amount, -1)) < 0.01
    ) <> 1 then
      insert into public.receipts (
        id, buyer_phone, source_message_id, e2e, image_hash, amount, payer_name,
        recipient_name, paid_at, status, reasons, confidence, image_path, file_name, summary
      ) values (
        v_receipt_id, p_phone, p_source_message_id, nullif(trim(coalesce(p_e2e, '')), ''),
        nullif(trim(coalesce(p_image_hash, '')), ''), p_amount, p_payer_name,
        p_recipient_name, p_paid_at, 'revisao', coalesce(p_reasons, '[]'::jsonb),
        p_confidence, p_image_path, p_file_name, 'Vários pedidos em aberto para o mesmo telefone.'
      );

      v_res := jsonb_build_object('ok', true, 'result', 'ambiguo', 'receiptId', v_receipt_id);
      if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
        insert into public.messages_log (source_message_id, phone, endpoint, response)
        values (p_source_message_id, v_phone, 'register_receipt', v_res)
        on conflict (source_message_id) do nothing;
      end if;
      return v_res;
    end if;
  else
    -- Nenhum pedido aberto: verifica pedido expirado há menos de 24h (pagamento tardio)
    select o.* into v_late_order
    from public.orders o
    join public.campaigns c on c.id = o.campaign_id
    where c.status = 'ativa'
      and public.normalize_phone(o.buyer_phone) = v_phone
      and o.status = 'expirado'
      and coalesce(o.expires_at, o.created_at) >= now() - interval '24 hours'
    order by o.created_at desc
    limit 1;

    if not found then
      insert into public.receipts (
        id, buyer_phone, source_message_id, e2e, image_hash, amount, payer_name,
        recipient_name, paid_at, status, reasons, confidence, image_path, file_name, summary
      ) values (
        v_receipt_id, p_phone, p_source_message_id, nullif(trim(coalesce(p_e2e, '')), ''),
        nullif(trim(coalesce(p_image_hash, '')), ''), p_amount, p_payer_name,
        p_recipient_name, p_paid_at, 'orfao', coalesce(p_reasons, '[]'::jsonb),
        p_confidence, p_image_path, p_file_name, 'Comprovante recebido sem pedido em aberto para este telefone.'
      );

      v_res := jsonb_build_object('ok', true, 'result', 'orfao', 'receiptId', v_receipt_id);
      if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
        insert into public.messages_log (source_message_id, phone, endpoint, response)
        values (p_source_message_id, v_phone, 'register_receipt', v_res)
        on conflict (source_message_id) do nothing;
      end if;
      return v_res;
    end if;

    v_target_order := v_late_order;
  end if;

  select * into v_camp from public.campaigns where id = v_target_order.campaign_id;

  -- Regra de ouro: modo 'banco' só confirma se E2E bater com pix_received; valor creditado é o do banco!
  if v_camp.confirmation_mode = 'banco' and p_e2e is not null and length(trim(p_e2e)) > 0 then
    select * into v_pix
    from public.pix_received
    where e2e = trim(p_e2e)
      and used_order_id is null
    for update;

    if found then
      v_credit_res := public.credit_order(v_target_order.id, v_pix.amount, 'banco');

      if (v_credit_res->>'result') in ('confirmado', 'parcial') then
        update public.pix_received set used_order_id = v_target_order.id where e2e = v_pix.e2e;

        insert into public.receipts (
          id, order_id, campaign_id, buyer_phone, source_message_id, e2e, image_hash,
          amount, payer_name, recipient_name, paid_at, status, reasons, confidence,
          image_path, file_name, summary, decided_by, decided_at
        ) values (
          v_receipt_id, v_target_order.id, v_camp.id, p_phone, p_source_message_id,
          trim(p_e2e), nullif(trim(coalesce(p_image_hash, '')), ''), v_pix.amount,
          p_payer_name, p_recipient_name, v_pix.paid_at, 'confirmado',
          coalesce(p_reasons, '[]'::jsonb), p_confidence, p_image_path, p_file_name,
          'Confirmado automaticamente via conciliação bancária (E2E).', 'banco', now()
        );

        v_res := jsonb_build_object(
          'ok', true,
          'result', v_credit_res->>'result',
          'receiptId', v_receipt_id,
          'order', jsonb_build_object(
            'id', v_target_order.id,
            'code', v_target_order.code,
            'buyerName', v_target_order.buyer_name,
            'quotas', to_jsonb(v_target_order.quotas),
            'totalAmount', v_target_order.total_amount
          ),
          'shortfall', v_credit_res->'shortfall',
          'surplus', v_credit_res->'surplus'
        );

        if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
          insert into public.messages_log (source_message_id, phone, endpoint, response)
          values (p_source_message_id, v_phone, 'register_receipt', v_res)
          on conflict (source_message_id) do nothing;
        end if;
        return v_res;
      elsif (v_credit_res->>'result') = 'conflito' then
        insert into public.receipts (
          id, order_id, campaign_id, buyer_phone, source_message_id, e2e, image_hash,
          amount, payer_name, recipient_name, paid_at, status, reasons, confidence,
          image_path, file_name, summary
        ) values (
          v_receipt_id, v_target_order.id, v_camp.id, p_phone, p_source_message_id,
          trim(p_e2e), nullif(trim(coalesce(p_image_hash, '')), ''), v_pix.amount,
          p_payer_name, p_recipient_name, v_pix.paid_at, 'revisao',
          coalesce(p_reasons, '[]'::jsonb), p_confidence, p_image_path, p_file_name,
          'Pagamento tardio em pedido expirado com números já vendidos.'
        );
        update public.pix_received set used_order_id = v_target_order.id where e2e = v_pix.e2e;

        v_res := jsonb_build_object('ok', false, 'result', 'conflito', 'receiptId', v_receipt_id, 'order', jsonb_build_object('id', v_target_order.id, 'code', v_target_order.code));
        if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
          insert into public.messages_log (source_message_id, phone, endpoint, response)
          values (p_source_message_id, v_phone, 'register_receipt', v_res)
          on conflict (source_message_id) do nothing;
        end if;
        return v_res;
      end if;
    end if;
  end if;

  -- Modo manual ou sem conciliação bancária: imagem sozinha NUNCA confirma pagamento!
  v_receipt_status := case
    when p_pre_status = 'revisar' then 'revisao'
    when p_pre_status = 'reenvio' then 'reenvio'
    else 'em_analise'
  end;

  insert into public.receipts (
    id, order_id, campaign_id, buyer_phone, source_message_id, e2e, image_hash,
    amount, payer_name, recipient_name, paid_at, status, reasons, confidence,
    image_path, file_name, summary
  ) values (
    v_receipt_id, v_target_order.id, v_camp.id, p_phone, p_source_message_id,
    nullif(trim(coalesce(p_e2e, '')), ''), nullif(trim(coalesce(p_image_hash, '')), ''),
    p_amount, p_payer_name, p_recipient_name, p_paid_at, v_receipt_status,
    coalesce(p_reasons, '[]'::jsonb), p_confidence, p_image_path, p_file_name,
    'Aguardando conferência no painel administrativo.'
  );

  if v_target_order.status = 'pendente' then
    update public.orders
    set status = 'em_analise', needs_admin = true
    where id = v_target_order.id;
  else
    update public.orders
    set needs_admin = true
    where id = v_target_order.id;
  end if;

  v_res := jsonb_build_object(
    'ok', true,
    'result', 'em_analise',
    'receiptId', v_receipt_id,
    'order', jsonb_build_object(
      'id', v_target_order.id,
      'code', v_target_order.code,
      'buyerName', v_target_order.buyer_name,
      'quotas', to_jsonb(v_target_order.quotas),
      'totalAmount', v_target_order.total_amount
    )
  );

  if p_source_message_id is not null and length(trim(p_source_message_id)) > 0 then
    insert into public.messages_log (source_message_id, phone, endpoint, response)
    values (p_source_message_id, v_phone, 'register_receipt', v_res)
    on conflict (source_message_id) do nothing;
  end if;

  return v_res;
end;
$$;

-- RPC 3: register_pix
create or replace function public.register_pix(
  p_e2e text,
  p_amount numeric,
  p_txid text default null,
  p_payer text default null,
  p_paid_at timestamptz default now(),
  p_raw jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e2e text := trim(coalesce(p_e2e, ''));
  v_existing public.pix_received%rowtype;
  v_receipt public.receipts%rowtype;
  v_camp public.campaigns%rowtype;
  v_credit_res jsonb;
begin
  if v_e2e = '' or p_amount is null or p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'invalid_pix_payload');
  end if;

  select * into v_existing from public.pix_received where e2e = v_e2e;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'e2e', v_e2e, 'usedOrderId', v_existing.used_order_id);
  end if;

  insert into public.pix_received (e2e, amount, txid, payer, paid_at, raw)
  values (v_e2e, p_amount, p_txid, p_payer, coalesce(p_paid_at, now()), coalesce(p_raw, '{}'::jsonb));

  select * into v_receipt
  from public.receipts
  where e2e = v_e2e
    and status in ('em_analise', 'revisao', 'reenvio')
    and order_id is not null
  order by created_at desc
  limit 1
  for update;

  if found then
    select * into v_camp from public.campaigns where id = v_receipt.campaign_id;
    if v_camp.confirmation_mode = 'banco' then
      v_credit_res := public.credit_order(v_receipt.order_id, p_amount, 'banco');
      if (v_credit_res->>'result') in ('confirmado', 'parcial') then
        update public.pix_received set used_order_id = v_receipt.order_id where e2e = v_e2e;
        update public.receipts
        set status = 'confirmado',
            amount = p_amount,
            decided_by = 'banco',
            decided_at = now(),
            summary = 'Confirmado automaticamente após webhook bancário (E2E).'
        where id = v_receipt.id;
      end if;
      return jsonb_build_object('ok', true, 'duplicate', false, 'e2e', v_e2e, 'matchedReceiptId', v_receipt.id, 'creditResult', v_credit_res);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'e2e', v_e2e);
end;
$$;

-- RPC 5: expire_orders
create or replace function public.expire_orders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_needs_admin jsonb := '[]'::jsonb;
  v_ord record;
begin
  -- Expira pedidos pendentes vencidos sem pagamento parcial e sem comprovante em análise
  for v_ord in
    select o.id, o.code, o.campaign_id, o.buyer_name, o.buyer_phone, o.quotas
    from public.orders o
    where o.status = 'pendente'
      and o.expires_at is not null
      and o.expires_at <= now()
      and coalesce(o.paid_amount, 0) = 0
      and not exists (
        select 1 from public.receipts r
        where r.order_id = o.id
          and r.status in ('em_analise', 'revisao', 'reenvio')
      )
    for update of o skip locked
  loop
    update public.orders set status = 'expirado' where id = v_ord.id;
    update public.quotas
    set status = 'disponivel', order_id = null, updated_at = now()
    where campaign_id = v_ord.campaign_id
      and order_id = v_ord.id
      and status = 'reservada';

    v_expired := v_expired || jsonb_build_object(
      'id', v_ord.id,
      'code', v_ord.code,
      'buyerName', v_ord.buyer_name,
      'phone', v_ord.buyer_phone,
      'quotas', to_jsonb(v_ord.quotas)
    );
  end loop;

  -- Aviso único para pedidos vencendo em <= 5 minutos
  for v_ord in
    select o.id, o.code, o.buyer_name, o.buyer_phone, o.quotas, o.expires_at
    from public.orders o
    where o.status = 'pendente'
      and o.expires_at is not null
      and o.expires_at > now()
      and o.expires_at <= now() + interval '5 minutes'
      and o.expiry_warned_at is null
    for update of o skip locked
  loop
    update public.orders set expiry_warned_at = now() where id = v_ord.id;
    v_warnings := v_warnings || jsonb_build_object(
      'id', v_ord.id,
      'code', v_ord.code,
      'buyerName', v_ord.buyer_name,
      'phone', v_ord.buyer_phone,
      'quotas', to_jsonb(v_ord.quotas),
      'expiresAt', v_ord.expires_at
    );
  end loop;

  -- Itens pendentes de ação administrativa (comprovantes ou conflitos)
  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into v_needs_admin
  from (
    select jsonb_build_object(
      'type', 'receipt',
      'id', r.id,
      'orderId', r.order_id,
      'phone', r.buyer_phone,
      'status', r.status,
      'amount', r.amount,
      'createdAt', r.created_at
    ) as item
    from public.receipts r
    where r.status in ('em_analise', 'revisao', 'orfao', 'reenvio')
    union all
    select jsonb_build_object(
      'type', 'conflict',
      'id', o.id,
      'orderId', o.id,
      'phone', o.buyer_phone,
      'status', o.conflict_reason,
      'amount', o.paid_amount,
      'createdAt', o.created_at
    ) as item
    from public.orders o
    where o.conflict_reason = 'conflito_reembolso'
      and o.needs_admin = true
  ) sub;

  return jsonb_build_object(
    'expired', v_expired,
    'warnings', v_warnings,
    'needsAdmin', v_needs_admin
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. REVOGAÇÃO TOTAL DE PRIVILÉGIOS PARA ANON E AUTHENTICATED
-- Bloqueia acesso direto via PostgREST / RPC para clientes anon e authenticated.
-- Apenas service_role (SUPABASE_SECRET_KEY no servidor) acessa tabelas e RPCs.
-- ----------------------------------------------------------------------------

revoke all on table
  public.campaigns,
  public.orders,
  public.quotas,
  public.receipts,
  public.pix_received,
  public.messages_log,
  public.bot_settings,
  public.prize_stock,
  public.winners,
  public.bot_logs,
  public.audit_log
from public, anon, authenticated;

grant all on table
  public.campaigns,
  public.orders,
  public.quotas,
  public.receipts,
  public.pix_received,
  public.messages_log,
  public.bot_settings,
  public.prize_stock,
  public.winners,
  public.bot_logs,
  public.audit_log
to service_role;

revoke all on function public.normalize_phone(text) from public, anon, authenticated;
revoke all on function public.generate_order_code() from public, anon, authenticated;
revoke all on function public.seed_campaign_quotas() from public, anon, authenticated;
revoke all on function public.credit_order(text, numeric, text) from public, anon, authenticated;
revoke all on function public.create_order(text, text, text, text, int[], int, text) from public, anon, authenticated;
revoke all on function public.register_receipt(text, text, text, text, numeric, text, text, timestamptz, text, jsonb, numeric, text, text) from public, anon, authenticated;
revoke all on function public.register_pix(text, numeric, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.expire_orders() from public, anon, authenticated;

grant execute on function public.normalize_phone(text) to service_role;
grant execute on function public.generate_order_code() to service_role;
grant execute on function public.credit_order(text, numeric, text) to service_role;
grant execute on function public.create_order(text, text, text, text, int[], int, text) to service_role;
grant execute on function public.register_receipt(text, text, text, text, numeric, text, text, timestamptz, text, jsonb, numeric, text, text) to service_role;
grant execute on function public.register_pix(text, numeric, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.expire_orders() to service_role;


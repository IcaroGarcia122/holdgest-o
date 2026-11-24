# HOLD PRÊMIOS — Gestão de Rifas (Supabase + Bot WhatsApp / n8n)

Sistema administrativo e API transacional para rifas semanais (Lista 1–100, 10 prêmios vinculados ao estoque) com persistência autoritativa no **Supabase (PostgreSQL + Auth + Storage)** e deploy serverless na **Vercel**.

---

## 1. Arquitetura & Segurança

- **Fonte única da verdade:** todas as regras críticas (reserva atômica `FOR UPDATE`, prevenção de duplicidade por `e2e` e `image_hash`, conciliação bancária, expiração e auditoria) vivem no PostgreSQL e nas rotas serverless (`/api/*`).
- **Banco bloqueado para `anon` e `authenticated`:** o `schema.sql` ativa RLS e revoga todos os privilégios de `anon` e `authenticated` em tabelas e funções RPC. Todo acesso ao banco ocorre exclusivamente no servidor via `SUPABASE_SECRET_KEY`; o front usa o Supabase Auth somente para o login do painel e consome apenas `/api/*`.
- **Chaves isoladas no servidor:** `SUPABASE_SECRET_KEY` e `BOT_API_TOKEN` nunca vão para o navegador (`VITE_*` não é utilizado).
- **Modos de confirmação (`banco` | `manual` | `ia`):**
  - **`banco` (mais seguro):** uma imagem sozinha **nunca** confirma pagamento; o E2E precisa bater com um registro em `pix_received` (webhook do PSP) e o valor creditado é sempre o recebido pelo banco.
  - **`manual`:** todo comprovante recebido fica `em_analise` até aprovação do administrador no painel ou via WhatsApp Admin.
  - **`ia` (regras rígidas):** a função `register_receipt` confirma automaticamente (`auto_confirmed = true`) apenas quando todas as travas passam no banco (`preStatus = 'ok'`, confiança `>= ai_min_confidence`, valor do pedido `<= ai_max_amount`, dentro do limite diário `ai_max_per_phone_day`, sem duplicidade de `e2e`/`image_hash` e sem divergência de recebedor/valor/data). Qualquer falha cai para `em_analise` ou `revisao`. **Atenção:** a IA pode ser enganada por comprovante falso bem feito — confira sempre o resumo diário (`/api/bot/summary/daily`) com o extrato do banco e use **Reverter** caso haja divergência.
- **Imagens privadas:** prints de comprovante são salvos no bucket privado `receipts` do Supabase Storage e exibidos no painel via URL assinada temporária.

---

## 2. Configuração do Supabase (Passo a Passo)

1. Crie um projeto no [Supabase](https://supabase.com).
2. Abra **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql` na ordem em que está escrito:
   - Cria as 11 tabelas (`campaigns`, `orders`, `quotas`, `receipts`, `pix_received`, `messages_log`, `bot_settings`, `prize_stock`, `winners`, `bot_logs`, `audit_log`);
   - Cria o trigger `trg_seed_campaign_quotas` que gera automaticamente os números `1..100` como `disponivel` ao criar cada campanha;
   - Cria o bucket privado `receipts` no Storage;
   - Habilita **RLS** e revoga privilégios de `anon` e `authenticated` em todas as tabelas e funções RPC (acesso exclusivo via `service_role` / `SUPABASE_SECRET_KEY`);
   - Cria as 5 funções transacionais (`create_order`, `register_receipt`, `register_pix`, `credit_order`, `expire_orders`).
3. Em **Authentication → Users**, clique em **Add user** e cadastre o e-mail e senha do(s) administrador(es) que terão acesso ao painel.
4. Em **Project Settings → API Keys**, copie:
   - `Project URL` (`SUPABASE_URL`)
   - `Secret key` (`SUPABASE_SECRET_KEY`)

---

## 3. Variáveis de Ambiente (Local & Vercel)

Configure no `.env` (local) e em **Project Settings → Environment Variables** na **Vercel**:

| Variável | Descrição | Onde obter |
|---|---|---|
| `SUPABASE_URL` | URL do projeto Supabase | Supabase → Settings → API |
| `SUPABASE_SECRET_KEY` | Chave secreta do servidor (nunca expor no navegador) | Supabase → Settings → API Keys |
| `BOT_API_TOKEN` | Token secreto compartilhado com n8n e Cron | Gere com `openssl rand -hex 32` |
| `APP_URL` | URL pública do painel na Vercel | Ex.: `https://hold-premios.vercel.app` |

### Expiração Automática (`/api/cron/expire`)

Na Vercel (ou usando um trigger agendado no n8n a cada 5 minutos), dispare `POST https://SEU-DOMINIO/api/cron/expire` com o header `Authorization: Bearer ${BOT_API_TOKEN}`. Pedidos expirados sem comprovante em análise e sem pagamento parcial são liberados automaticamente.

---

## 4. Desenvolvimento & Testes Locais

```bash
npm install
npm run test     # Executa os testes unitários das regras transacionais
npm run lint     # Verificação de tipos TypeScript
npm run build    # Build de produção (Vite)
npm run dev      # Inicia Express + Vite middlewares na porta 3000
```

---

## 5. Documentação da API do Bot (`curl`)

Todas as rotas do bot exigem o header `Authorization: Bearer $BOT_API_TOKEN`.

### 5.1 Consultar campanha ativa e regras Pix (`GET /api/bot/campaign`)

Retorna `confirmationMode` (`banco` | `manual` | `ia`). Quando `confirmationMode === "ia"`, inclui também `aiMaxAmount`, `aiMinConfidence` e `aiMaxPerPhoneDay`.

```bash
curl -sS -X GET "$APP_URL/api/bot/campaign" \
  -H "Authorization: Bearer $BOT_API_TOKEN"
```

### 5.2 Ler a Lista 1–100 (LGPD — primeiro nome) (`GET /api/bot/quotas`)

```bash
curl -sS -X GET "$APP_URL/api/bot/quotas" \
  -H "Authorization: Bearer $BOT_API_TOKEN"
```

### 5.3 Consultar pedidos abertos por telefone (`GET /api/bot/orders?phone=`)

```bash
curl -sS -X GET "$APP_URL/api/bot/orders?phone=5511999999999" \
  -H "Authorization: Bearer $BOT_API_TOKEN"
```

### 5.4 Criar reserva de números ou sorteio automático (`POST /api/bot/orders`)

Retorna `201` com `{ "order": ..., "payment": ... }`.

```bash
curl -sS -X POST "$APP_URL/api/bot/orders" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "buyerName": "Lucas Andrade",
    "holderName": "Lucas Andrade",
    "quotas": [7, 14],
    "sourceMessageId": "wamid.HBgMNTUxMTk5OTk5OTk5ORUCABI="
  }'
```

*(Opcional: envie `"quantity": 3` em vez de `"quotas"` para sortear 3 números livres com `FOR UPDATE SKIP LOCKED`.)*

### 5.5 Cancelar reserva em aberto pelo participante (`POST /api/bot/orders/:id/cancel`)

```bash
curl -sS -X POST "$APP_URL/api/bot/orders/ord-123/cancel" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999"
  }'
```

### 5.6 Enviar comprovante analisado pelo agente n8n (`POST /api/bot/receipts`)

Retorna também `receiptCode` (código curto único do comprovante, ex.: `C3F9A`) e `autoConfirmed` (`true` quando confirmado automaticamente em modo `ia`).

```bash
curl -sS -X POST "$APP_URL/api/bot/receipts" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "5511999999999",
    "sourceMessageId": "wamid.RECEIPT_001",
    "e2e": "E00000000202611201234ABC",
    "imageHash": "sha256-opcional-se-sem-base64",
    "amount": 240.00,
    "payerName": "LUCAS ANDRADE",
    "recipientName": "HOLD PREMIOS LTDA",
    "paidAt": "2026-11-20T15:30:00Z",
    "preStatus": "ok",
    "reasons": [],
    "confidence": 0.96,
    "imageBase64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB..."
  }'
```

### 5.7 Registrar Pix recebido do banco/PSP (`POST /api/bot/pix`)

```bash
curl -sS -X POST "$APP_URL/api/bot/pix" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "e2e": "E00000000202611201234ABC",
    "amount": 240.00,
    "txid": "TXID123456",
    "payer": "LUCAS ANDRADE",
    "paidAt": "2026-11-20T15:30:05Z"
  }'
```

### 5.8 Executar rotina de expiração (`POST /api/cron/expire`)

```bash
curl -sS -X POST "$APP_URL/api/cron/expire" \
  -H "Authorization: Bearer $BOT_API_TOKEN"
```

### 5.9 Resumo diário de confirmações automáticas da IA (`POST /api/bot/summary/daily`)

Chama `ai_daily_summary(p_mark)` e retorna `{ count, total, items }` com os comprovantes confirmados pela IA ainda não listados, marcando-os como enviados (`summary_sent_at`). Use `?peek=1` para consultar sem marcar como listado.

```bash
# Marca como listado após consultar
curl -sS -X POST "$APP_URL/api/bot/summary/daily" \
  -H "Authorization: Bearer $BOT_API_TOKEN"

# Apenas consulta sem marcar como listado
curl -sS -X POST "$APP_URL/api/bot/summary/daily?peek=1" \
  -H "Authorization: Bearer $BOT_API_TOKEN"
```

---

## 6. Conferência e Gestão via WhatsApp (Admin Bot — n8n)

Todas as rotas abaixo exigem `Authorization: Bearer $BOT_API_TOKEN` e validam se o telefone `actor` (normalizado) está listado em `bot_settings.admin_phones` (caso contrário retornam `403 { "error": "not_admin" }`). O parâmetro `:ref` aceita código curto (`C3F9A` / `R3F9A`, sem diferenciar maiúsculas) ou `id`.

### 6.1 Listar pendências administrativas (`GET /api/bot/admin/pending?actor=`)

```bash
curl -sS -X GET "$APP_URL/api/bot/admin/pending?actor=5543999999999" \
  -H "Authorization: Bearer $BOT_API_TOKEN"
```

### 6.2 Aprovar comprovante (`POST /api/bot/admin/receipts/:ref/approve`)

```bash
curl -sS -X POST "$APP_URL/api/bot/admin/receipts/C3F9A/approve" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "5543999999999",
    "amount": 20.00
  }'
```

### 6.3 Rejeitar comprovante (`POST /api/bot/admin/receipts/:ref/reject`)

```bash
curl -sS -X POST "$APP_URL/api/bot/admin/receipts/C3F9A/reject" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "5543999999999",
    "reason": "Comprovante ilegível ou valor divergente."
  }'
```

### 6.4 Vincular comprovante órfão/ambíguo a um pedido (`POST /api/bot/admin/receipts/:ref/link`)

```bash
curl -sS -X POST "$APP_URL/api/bot/admin/receipts/C3F9A/link" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "5543999999999",
    "orderCode": "R3F9A"
  }'
```

### 6.5 Marcar pedido como pago manualmente (`POST /api/bot/admin/orders/:ref/pay`)

```bash
curl -sS -X POST "$APP_URL/api/bot/admin/orders/R3F9A/pay" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "5543999999999",
    "amount": 20.00
  }'
```

### 6.6 Cancelar pedido e liberar números (`POST /api/bot/admin/orders/:ref/cancel`)

```bash
curl -sS -X POST "$APP_URL/api/bot/admin/orders/R3F9A/cancel" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "5543999999999"
  }'
```

### 6.7 Reverter confirmação feita por engano (`POST /api/bot/admin/orders/:ref/revert`)

```bash
curl -sS -X POST "$APP_URL/api/bot/admin/orders/R3F9A/revert" \
  -H "Authorization: Bearer $BOT_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "5543999999999"
  }'
```


# HOLD PRÊMIOS — Gestão de Rifas (Supabase + Bot WhatsApp / n8n)

Sistema administrativo e API transacional para rifas semanais (Lista 1–100, 10 prêmios vinculados ao estoque) com persistência autoritativa no **Supabase (PostgreSQL + Auth + Storage)** e deploy serverless na **Vercel**.

---

## 1. Arquitetura & Segurança

- **Fonte única da verdade:** todas as regras críticas (reserva atômica `FOR UPDATE`, prevenção de duplicidade por `e2e` e `image_hash`, conciliação bancária, expiração e auditoria) vivem no PostgreSQL e nas rotas serverless (`/api/*`).
- **Banco bloqueado para `anon` e `authenticated`:** o `schema.sql` ativa RLS e revoga todos os privilégios de `anon` e `authenticated` em tabelas e funções RPC. Todo acesso ao banco ocorre exclusivamente no servidor via `SUPABASE_SECRET_KEY`; o front usa o Supabase Auth somente para o login do painel e consome apenas `/api/*`.
- **Chaves isoladas no servidor:** `SUPABASE_SECRET_KEY` e `BOT_API_TOKEN` nunca vão para o navegador (`VITE_*` não é utilizado).
- **Regra de ouro:** em `confirmation_mode = 'banco'`, uma imagem sozinha **nunca** confirma pagamento; o E2E precisa bater com um registro em `pix_received` e o valor creditado é sempre o recebido pelo banco. Em modo `'manual'`, o comprovante fica `em_analise` até aprovação no painel.
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

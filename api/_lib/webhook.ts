import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase.js";
import { isSafeWebhookUrl } from "./security.js";

export type OutboundEventType =
  | "ORDER_CREATED"
  | "ORDER_PAID"
  | "ORDER_CANCELLED"
  | "ORDER_EXPIRED"
  | "RIFA_COMPLETA";

export async function dispatchOutboundEvent(
  event: OutboundEventType,
  payload: Record<string, unknown>
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = getSupabaseAdmin();
    const { data: settings } = await supabase
      .from("bot_settings")
      .select("outbound_webhook_url, group_jid, group_name")
      .eq("id", 1)
      .maybeSingle();

    const targetUrl = settings?.outbound_webhook_url?.trim();
    if (!targetUrl || !isSafeWebhookUrl(targetUrl)) return;

    const botToken = process.env.BOT_API_TOKEN || "";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(botToken ? { Authorization: `Bearer ${botToken}` } : {}),
        },
        body: JSON.stringify({
          event,
          groupJid: settings?.group_jid || "",
          groupName: settings?.group_name || "",
          ...payload,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // Outbound webhook failures must not break primary raffle operations
  }
}

export async function checkAndNotifyRaffleComplete(campaignId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = getSupabaseAdmin();

  const { count } = await supabase
    .from("quotas")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "paga");

  if ((count ?? 0) < 100) return false;

  const nowIso = new Date().toISOString();
  const { data: updatedCamp } = await supabase
    .from("campaigns")
    .update({ completed_notified_at: nowIso })
    .eq("id", campaignId)
    .is("completed_notified_at", null)
    .select("id, title, week_label, whatsapp_group_name")
    .maybeSingle();

  if (updatedCamp) {
    await dispatchOutboundEvent("RIFA_COMPLETA", {
      campaignId: updatedCamp.id,
      campaignTitle: updatedCamp.title,
      weekLabel: updatedCamp.week_label,
      groupName: updatedCamp.whatsapp_group_name,
      totalConfirmed: 100,
    });
    return true;
  }
  return false;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

let cachedAdmin: SupabaseClient | null = null;

function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL || "").trim();
}

function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = getSupabaseUrl();
  const key = getSupabaseSecretKey();
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórias no servidor."
    );
  }
  cachedAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
}

/**
 * Ephemeral server-side client used exclusively for Supabase Auth login
 * (`signInWithPassword`) so the cached admin client never mutates its
 * secret-key authorization header.
 */
export function createEphemeralAuthClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const authKey =
    (process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      getSupabaseSecretKey()).trim();
  if (!url || !authKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórias no servidor."
    );
  }
  return createClient(url, authKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getSignedReceiptUrl(
  imagePath: string | null | undefined
): Promise<string | null> {
  if (!imagePath) return null;
  if (imagePath.startsWith("https://")) return imagePath;
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from("receipts")
      .createSignedUrl(imagePath, 3600);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function uploadReceiptImageToStorage(
  rawBase64: string,
  phoneSlug: string
): Promise<{ path: string; imageHash: string; fileName: string }> {
  let mime = "image/png";
  let payload = rawBase64.trim();

  const dataUriMatch = payload.match(
    /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i
  );
  if (dataUriMatch) {
    mime =
      dataUriMatch[1].toLowerCase() === "image/jpg"
        ? "image/jpeg"
        : dataUriMatch[1].toLowerCase();
    payload = dataUriMatch[2];
  }

  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0 || buffer.length > 6 * 1024 * 1024) {
    throw new Error("Imagem do comprovante inválida ou maior que 6MB.");
  }

  const imageHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
  const safePhone = phoneSlug.replace(/[^0-9]/g, "") || "anon";
  const fileName = `${Date.now()}-${imageHash.slice(0, 10)}.${ext}`;
  const storagePath = `comprovantes/${safePhone}/${fileName}`;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from("receipts")
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (error) {
    throw new Error(`Falha ao gravar comprovante no Storage: ${error.message}`);
  }

  return { path: storagePath, imageHash, fileName };
}

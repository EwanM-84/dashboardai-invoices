import { NextResponse } from "next/server";
import { ApiAuthError, requireApiUser } from "@/lib/supabase/server";

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireApiUser(request);
    const expectedHash = process.env.OWNER_ACCESS_CODE_HASH;
    if (!expectedHash) throw new Error("Owner access is not configured");

    const { code } = (await request.json()) as { code?: string };
    const suppliedHash = await sha256(code?.trim() ?? "");
    if (suppliedHash !== expectedHash.toLowerCase()) {
      return NextResponse.json({ error: "Invalid access code" }, { status: 403 });
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        plan: "owner",
        subscription_status: "owner",
        owner_bypass: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Access check failed" },
      { status: error instanceof ApiAuthError ? 401 : 500 },
    );
  }
}

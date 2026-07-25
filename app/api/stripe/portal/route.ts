import { NextResponse } from "next/server";
import { appOrigin, createStripe } from "@/lib/stripe";
import { ApiAuthError, requireApiUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireApiUser(request);
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (error) throw error;
    if (!profile.stripe_customer_id) {
      return NextResponse.json(
        { error: "No billing account found" },
        { status: 400 },
      );
    }

    const stripe = createStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: appOrigin(request),
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Portal failed" },
      { status: error instanceof ApiAuthError ? 401 : 500 },
    );
  }
}

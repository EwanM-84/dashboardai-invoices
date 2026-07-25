import { NextResponse } from "next/server";
import { appOrigin, createStripe } from "@/lib/stripe";
import { ApiAuthError, requireApiUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { user, supabase } = await requireApiUser(request);
    const { plan } = (await request.json()) as { plan?: "starter" | "pro" };
    if (plan !== "starter" && plan !== "pro") {
      return NextResponse.json({ error: "Choose a valid plan" }, { status: 400 });
    }

    const price =
      plan === "starter"
        ? process.env.STRIPE_STARTER_PRICE_ID
        : process.env.STRIPE_PRO_PRICE_ID;
    if (!price) throw new Error(`Stripe ${plan} price is not configured`);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_customer_id, company_name")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;

    const stripe = createStripe();
    let customerId = profile.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile.company_name || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      const { error } = await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
      if (error) throw error;
    }

    const origin = appOrigin(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id, plan } },
      billing_address_collection: "auto",
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed" },
      { status: error instanceof ApiAuthError ? 401 : 500 },
    );
  }
}

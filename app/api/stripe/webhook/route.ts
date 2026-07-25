import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createStripe } from "@/lib/stripe";
import { createSupabaseAdmin } from "@/lib/supabase/server";

function planForPrice(priceId?: string | null) {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return "starter";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  return "none";
}

async function updateSubscription(
  subscription: Stripe.Subscription,
  deleted = false,
) {
  const supabase = createSupabaseAdmin();
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id;
  const status = deleted ? "canceled" : subscription.status;
  const plan = deleted ? "none" : planForPrice(priceId);

  const { error } = await supabase
    .from("profiles")
    .update({
      plan,
      subscription_status: status,
      stripe_subscription_id: deleted ? null : subscription.id,
      owner_bypass: false,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw error;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 400 },
    );
  }

  try {
    const stripe = createStripe();
    const payload = await request.text();
    const event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id ?? session.metadata?.user_id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (userId && customerId) {
          const supabase = createSupabaseAdmin();
          const { error } = await supabase
            .from("profiles")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              plan: session.metadata?.plan ?? "none",
              subscription_status: "active",
              owner_bypass: false,
              updated_at: new Date().toISOString(),
            })
            .eq("id", userId);
          if (error) throw error;
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await updateSubscription(event.data.object);
        break;
      case "customer.subscription.deleted":
        await updateSubscription(event.data.object, true);
        break;
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        if (customerId) {
          const supabase = createSupabaseAdmin();
          await supabase
            .from("profiles")
            .update({
              subscription_status: "past_due",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook" },
      { status: 400 },
    );
  }
}

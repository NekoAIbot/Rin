// Paystack webhook: validates HMAC and processes subscription lifecycle events.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createHmac } from "node:crypto";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  const expected = createHmac("sha512", PAYSTACK_SECRET).update(raw).digest("hex");

  if (signature !== expected) {
    console.warn("paystack-webhook: invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(raw); } catch { return new Response("Bad JSON", { status: 400 }); }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const type = event.event as string;
    const data = event.data ?? {};
    const userId = data?.metadata?.user_id as string | undefined;

    if (type === "charge.success" && userId) {
      const tier = data?.metadata?.tier === "enterprise" ? "enterprise" : "pro";
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() + 30);

      await supabase.from("subscriptions").upsert({
        user_id: userId,
        tier,
        status: "active",
        paystack_customer_code: data?.customer?.customer_code,
        currency: data?.currency || "NGN",
        amount_kobo: data?.amount,
        current_period_end: periodEnd.toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      await supabase.from("payment_transactions").update({
        status: "success",
        paystack_payload: data,
      }).eq("reference", data?.reference);
    } else if (type === "subscription.disable" || type === "subscription.not_renew") {
      const customerCode = data?.customer?.customer_code;
      if (customerCode) {
        await supabase.from("subscriptions").update({
          status: "cancelled",
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        }).eq("paystack_customer_code", customerCode);
      }
    } else if (type === "invoice.payment_failed") {
      const customerCode = data?.customer?.customer_code;
      if (customerCode) {
        await supabase.from("subscriptions").update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("paystack_customer_code", customerCode);
      }
    }
  } catch (err) {
    console.error("paystack-webhook processing error:", err);
  }

  return new Response("ok", { status: 200 });
});

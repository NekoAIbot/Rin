// Verify a Paystack transaction after the customer is redirected back.
// Upserts the user's subscription tier on success.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { reference } = await req.json().catch(() => ({ reference: null }));
    if (!reference) {
      return new Response(JSON.stringify({ error: "Missing reference" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const verifyJson = await verifyRes.json();

    if (!verifyJson.status || verifyJson.data?.status !== "success") {
      return new Response(JSON.stringify({
        ok: false,
        status: verifyJson.data?.status || "failed",
        message: verifyJson.message,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tier = verifyJson.data?.metadata?.tier === "enterprise" ? "enterprise" : "pro";
    const amount = verifyJson.data?.amount as number;
    const customerCode = verifyJson.data?.customer?.customer_code as string | undefined;

    // Update transaction log
    await supabase
      .from("payment_transactions")
      .update({ status: "success", paystack_payload: verifyJson.data })
      .eq("reference", reference);

    // Upsert subscription
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    await supabase.from("subscriptions").upsert({
      user_id: user.id,
      tier,
      status: "active",
      paystack_customer_code: customerCode,
      currency: "NGN",
      amount_kobo: amount,
      current_period_end: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ ok: true, tier }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paystack-verify error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

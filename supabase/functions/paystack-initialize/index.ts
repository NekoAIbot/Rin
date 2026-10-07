// Initialize a Paystack checkout for a tier upgrade.
// Returns an authorization_url the client redirects to.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const PAYSTACK_SECRET = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Pricing in kobo (NGN * 100). Other currencies handled by sending amount in lowest unit.
// Tuned to reasonable global benchmarks for an AI companion product.
const PLAN_AMOUNTS_NGN: Record<string, number> = {
  pro: 9_500_00,         // ₦9,500/mo  (~$6.50)
  enterprise: 49_000_00, // ₦49,000/mo (~$33)
};

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

    const body = await req.json().catch(() => ({}));
    const tier = body.tier === "enterprise" ? "enterprise" : "pro";
    const callbackUrl = typeof body.callback_url === "string" ? body.callback_url : null;

    const amount = PLAN_AMOUNTS_NGN[tier];
    if (!amount) {
      return new Response(JSON.stringify({ error: "Invalid tier" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = `aurora_${user.id.slice(0, 8)}_${Date.now()}`;

    const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: {
          user_id: user.id,
          tier,
        },
      }),
    });

    const initJson = await initRes.json();
    if (!initJson.status) {
      console.error("Paystack init failed:", initJson);
      return new Response(JSON.stringify({ error: initJson.message || "Paystack error" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log pending transaction
    await supabase.from("payment_transactions").insert({
      user_id: user.id,
      reference,
      amount_kobo: amount,
      currency: "NGN",
      status: "pending",
      tier,
    });

    return new Response(JSON.stringify({
      authorization_url: initJson.data.authorization_url,
      access_code: initJson.data.access_code,
      reference,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("paystack-initialize error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

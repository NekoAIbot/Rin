import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Sparkles, Crown, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type Tier = "free" | "pro" | "enterprise";

const PLANS: Array<{
  tier: Tier;
  name: string;
  price: string;
  cadence: string;
  description: string;
  icon: typeof Sparkles;
  features: string[];
  cta: string;
  highlight?: boolean;
}> = [
  {
    tier: "free",
    name: "Free",
    price: "₦0",
    cadence: "forever",
    description: "Get to know Aurora",
    icon: Sparkles,
    features: [
      "Daily conversations",
      "Basic memory",
      "Standard voice",
      "Web search",
    ],
    cta: "Current plan",
  },
  {
    tier: "pro",
    name: "Pro",
    price: "₦4,500",
    cadence: "per month",
    description: "Aurora as a real companion",
    icon: Crown,
    features: [
      "Unlimited conversations",
      "Deep long-term memory",
      "Premium ElevenLabs voice",
      "Proactive check-ins & rituals",
      "Priority response speed",
      "Reports & insights export",
    ],
    cta: "Upgrade to Pro",
    highlight: true,
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: "₦25,000",
    cadence: "per month",
    description: "For teams and power users",
    icon: Zap,
    features: [
      "Everything in Pro",
      "Real-time voice mode",
      "API access & higher rate limits",
      "Custom personas",
      "Priority support",
    ],
    cta: "Go Enterprise",
  },
];

export default function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<Tier | null>(null);

  const handleUpgrade = async (tier: Tier) => {
    if (tier === "free") return;
    if (!user) {
      navigate("/auth");
      return;
    }

    setLoadingTier(tier);
    try {
      const { data, error } = await supabase.functions.invoke("paystack-initialize", {
        body: {
          tier,
          callback_url: `${window.location.origin}/billing?verify=true`,
        },
      });
      if (error) throw error;
      if (data?.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Could not start checkout");
      setLoadingTier(null);
    }
  };

  return (
    <div className="min-h-screen bg-background py-16 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Choose your Aurora</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Aurora remembers you, reaches out first, and stays useful as a real companion.
            Pick the plan that matches how deep you want the relationship to go.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            return (
              <Card
                key={plan.tier}
                className={
                  plan.highlight
                    ? "border-primary shadow-lg shadow-primary/10 relative"
                    : "relative"
                }
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most popular
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle>{plan.name}</CardTitle>
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    <span className="text-muted-foreground ml-2">{plan.cadence}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    disabled={plan.tier === "free" || loadingTier !== null}
                    onClick={() => handleUpgrade(plan.tier)}
                  >
                    {loadingTier === plan.tier ? "Redirecting…" : plan.cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Payments processed securely by Paystack. Cancel anytime.
        </p>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Lock, ShieldCheck, KeyRound, UserCheck, Database, AlertTriangle } from "lucide-react";
import { Helmet } from "react-helmet-async";

const controls = [
  { icon: Lock, title: "Encryption in transit", body: "All traffic between your browser, our edge functions and the database is TLS-encrypted." },
  { icon: Database, title: "Per-user data isolation", body: "Postgres row-level security scopes every table to the authenticated user id. The Data API enforces this on every request." },
  { icon: UserCheck, title: "Role-based admin access", body: "Admin-only operations check roles via a security-definer function on a dedicated user_roles table — no role flags on user records." },
  { icon: KeyRound, title: "Authentication", body: "Email + password, Google OAuth, and magic links. Password reset goes through a verified email loop." },
  { icon: ShieldCheck, title: "Webhook verification", body: "Inbound payment webhooks are validated against the provider's HMAC signature before any database write." },
  { icon: AlertTriangle, title: "Responsible disclosure", body: "Security issues go to security@aurora.app. We acknowledge inside 48 hours and credit reporters who request it." },
];

export default function Security() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Security — Aurora</title>
        <meta name="description" content="How Aurora protects your conversations and memories: encryption, row-level security, role-based admin access and responsible disclosure." />
        <link rel="canonical" href="/security" />
      </Helmet>

      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last updated: June 2026</p>
        <h1 className="font-serif text-4xl tracking-tight mt-2">Security</h1>
        <p className="text-muted-foreground max-w-2xl mt-3">
          This page is maintained by the Aurora team to summarize the controls we currently have in place.
          It is not a third-party certification.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 mt-10">
          {controls.map((c) => (
            <Card key={c.title} className="p-6 bg-card/60 border-border/60">
              <c.icon className="h-5 w-5 text-primary mb-3" />
              <h3 className="font-medium">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.body}</p>
            </Card>
          ))}
        </div>

        <section className="mt-12 prose prose-neutral dark:prose-invert">
          <h2>Shared responsibility</h2>
          <p>
            Aurora operates on Lovable Cloud, which provides hardened hosting, managed Postgres and audited
            access controls. We build on top of those primitives with row-level security policies, role-scoped
            admin functions, and signed webhooks. You are responsible for protecting your own account — use a
            strong password and enable two-factor on your email provider.
          </p>
          <h2>Incident response</h2>
          <p>
            If we discover a security incident affecting your data we will notify affected users by email within
            72 hours of confirmation, alongside a written summary of impact and remediation.
          </p>
          <h2>Contact</h2>
          <p>Security reports: <a href="mailto:security@aurora.app">security@aurora.app</a></p>
        </section>
      </main>
    </div>
  );
}

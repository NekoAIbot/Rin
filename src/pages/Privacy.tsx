import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Helmet } from "react-helmet-async";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Privacy — Aurora</title>
        <meta name="description" content="How Aurora collects, stores and protects your conversations, memories and account data." />
        <link rel="canonical" href="/privacy" />
      </Helmet>

      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center">
          <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 prose prose-neutral dark:prose-invert">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Last updated: June 2026</p>
        <h1 className="font-serif text-4xl tracking-tight mt-2">Privacy</h1>
        <p className="text-muted-foreground">
          This page is maintained by the Aurora team to answer common privacy questions. It describes our current practices
          and is not a substitute for a legal contract or a third-party certification.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li><strong>Account data</strong> — email, display name, and authentication tokens from Lovable Cloud auth.</li>
          <li><strong>Conversation data</strong> — messages you send to Aurora and its responses.</li>
          <li><strong>Memories</strong> — structured facts the system extracts from your conversations to personalize future replies.</li>
          <li><strong>Usage telemetry</strong> — anonymous error and performance signals to keep the product working.</li>
        </ul>

        <h2>How your data is stored</h2>
        <p>
          All conversation data, memories and account records live in a managed Postgres database with
          row-level security enabled. Every row is scoped to your user id; no other user — and no anonymous
          visitor — can read your data through the API.
        </p>

        <h2>Who can access your data</h2>
        <ul>
          <li><strong>You</strong>, via the Aurora app.</li>
          <li><strong>Aurora engineers</strong>, only when required to operate or debug the service, and only via audited service credentials.</li>
          <li><strong>Sub-processors</strong>: Lovable Cloud (hosting + database), Lovable AI Gateway (model inference), Paystack (payments), Resend (transactional email), and the speech-to-text provider behind our transcribe function.</li>
        </ul>

        <h2>What we don't do</h2>
        <ul>
          <li>We don't sell your data.</li>
          <li>We don't train foundation models on your conversations.</li>
          <li>We don't share your memories with other users or personas.</li>
        </ul>

        <h2>Your controls</h2>
        <ul>
          <li><strong>Delete memories</strong> from the Memory tab at any time.</li>
          <li><strong>Delete your account</strong> by emailing support; all conversations, memories and profile rows are removed.</li>
          <li><strong>Export</strong> your conversation history on request.</li>
        </ul>

        <h2>Contact</h2>
        <p>Privacy questions: <a href="mailto:privacy@aurora.app">privacy@aurora.app</a></p>

        <p className="text-sm text-muted-foreground">
          This page describes current practices and may change as the product evolves. Material changes will be announced
          in-app before they take effect.
        </p>
      </main>
    </div>
  );
}

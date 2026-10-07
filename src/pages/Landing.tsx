import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Brain, Sparkles, Shield, Mic, BookOpen, Activity, Workflow,
} from "lucide-react";
import { Helmet } from "react-helmet-async";
import auroraMark from "@/assets/aurora-mark.png";
import { AuroraOrb } from "@/components/home/AuroraOrb";
import { Panel } from "@/components/aurora/Surface";

const pillars = [
  { icon: Brain, title: "Memory that compounds", body: "Goals, people, patterns, projects — held across every conversation and visible to you at all times." },
  { icon: Mic, title: "Voice that keeps up", body: "Server-side transcription tuned for real accents, real rooms, and every browser." },
  { icon: Workflow, title: "Automations you can see", body: "Build routines step by step. Aurora shows the plan before it ever acts." },
  { icon: Activity, title: "Proactive, not noisy", body: "Aurora notices drift, growth and recurring themes — and surfaces them at the right moment." },
  { icon: BookOpen, title: "Rituals, not streaks", body: "Morning intentions, evening reflection. A practice, not a points system." },
  { icon: Shield, title: "Yours, end to end", body: "Per-user isolation, row-level security, and one-click deletion of anything it holds." },
];

const surfaces = [
  ["Home", "A living workspace that reads the time of day."],
  ["Workspace", "One adaptive environment for writing, visuals and documents."],
  ["Memory", "Ask your own history a question in plain language."],
  ["Automations", "Visual routines with confirmation previews."],
  ["Settings", "Quiet, grouped, out of your way."],
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to="/app" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Aurora — The AI companion that remembers who you're becoming</title>
        <meta name="description" content="Aurora is a voice-first AI operating system with real memory, visual automations and daily rituals. Built for people who think out loud." />
        <link rel="canonical" href="/" />
        <meta property="og:title" content="Aurora — The AI companion that remembers you" />
        <meta property="og:description" content="Voice-first AI companion with real memory, visual automations and proactive insights." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-border/40 backdrop-blur-xl bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={auroraMark} alt="" width={28} height={28} className="h-7 w-7" />
            <span className="font-display text-xl tracking-tight">Aurora</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14px] text-muted-foreground md:flex">
            <Link to="/demo" className="transition-colors hover:text-foreground">Demo</Link>
            <Link to="/pricing" className="transition-colors hover:text-foreground">Pricing</Link>
            <Link to="/security" className="transition-colors hover:text-foreground">Security</Link>
            <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="rounded-full"><Link to="/auth">Sign in</Link></Button>
            <Button asChild size="sm" className="rounded-full"><Link to="/auth">Get started</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(70% 55% at 50% -10%, hsl(var(--sage) / 0.28), transparent 70%), radial-gradient(50% 40% at 90% 20%, hsl(var(--gold) / 0.14), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-4xl px-5 pb-24 pt-20 text-center sm:pt-28">
          <div className="animate-rise-in flex justify-center">
            <AuroraOrb size={92} />
          </div>
          <p className="animate-rise-in mt-8 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            A personal AI operating system
          </p>
          <h1 className="animate-rise-in mt-4 font-display text-[40px] leading-[1.04] tracking-tight sm:text-[64px]">
            The AI that <em className="font-medium italic">remembers</em><br className="hidden sm:block" /> who you're becoming.
          </h1>
          <p className="animate-rise-in mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
            Five calm surfaces. Real memory. Voice that keeps up. Automations you approve
            before they run — built around your growth, not the next prompt.
          </p>
          <div className="animate-rise-in mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="rounded-full px-7 text-base shadow-glow">
              <Link to="/auth">Start free <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full px-7 text-base">
              <Link to="/demo">See a live conversation</Link>
            </Button>
          </div>
          <p className="mt-4 text-[13px] text-muted-foreground">
            No card required · Free tier · NGN &amp; USD pricing
          </p>
        </div>
      </section>

      {/* Five surfaces */}
      <section className="mx-auto max-w-5xl px-5 pb-8">
        <Panel material="glass" className="animate-rise-in p-2 sm:p-3">
          <div className="grid gap-2 sm:grid-cols-5">
            {surfaces.map(([name, blurb]) => (
              <div key={name} className="rounded-[1.25rem] px-4 py-4 transition-colors hover:bg-foreground/[0.04]">
                <p className="font-display text-[17px] leading-none">{name}</p>
                <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{blurb}</p>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <div className="mb-12 max-w-2xl">
          <h2 className="font-display text-[32px] tracking-tight sm:text-[40px]">Not another chat box.</h2>
          <p className="mt-3 text-[16px] text-muted-foreground">
            Most AI forgets you the moment the tab closes. Aurora is built on a tiered memory system,
            an emotional model, and routines that compound.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((f, i) => (
            <Panel
              key={f.title}
              className="animate-rise-in hover:-translate-y-0.5 hover:shadow-lift"
              style={{ animationDelay: `${i * 45}ms` }}
            >
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                <f.icon className="h-4.5 w-4.5" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-[19px] leading-none">{f.title}</h3>
              <p className="mt-2.5 text-[14px] leading-relaxed text-muted-foreground">{f.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* Positioning */}
      <section className="relative border-y border-border/40">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(60% 100% at 50% 0%, hsl(var(--forest) / 0.10), transparent 70%)" }}
        />
        <div className="mx-auto max-w-4xl px-5 py-20 text-center">
          <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Built for</p>
          <h2 className="mt-4 font-display text-[32px] tracking-tight sm:text-[42px]">
            People who think out loud.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[16px] text-muted-foreground">
            Local-first pricing in Naira via Paystack. Voice that handles your accent.
            A companion that meets the rhythm of how you actually work.
          </p>
          <div className="mt-9 flex justify-center gap-3">
            <Button asChild className="rounded-full px-6"><Link to="/pricing">See pricing</Link></Button>
            <Button asChild variant="outline" className="rounded-full px-6"><Link to="/demo">Watch a demo</Link></Button>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto max-w-3xl px-5 py-24 text-center">
        <Sparkles className="mx-auto h-5 w-5 text-accent" aria-hidden />
        <h2 className="mt-5 font-display text-[30px] leading-tight tracking-tight sm:text-[38px]">
          Start with one conversation.<br />Aurora takes it from there.
        </h2>
        <Button asChild size="lg" className="mt-8 rounded-full px-8 shadow-glow">
          <Link to="/auth">Create your Aurora <ArrowRight className="ml-2 h-4 w-4" /></Link>
        </Button>
      </section>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-[13.5px] text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <img src={auroraMark} alt="" width={20} height={20} className="h-5 w-5" />
            <span>© {new Date().getFullYear()} Aurora</span>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link to="/demo" className="hover:text-foreground">Demo</Link>
            <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/security" className="hover:text-foreground">Security</Link>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

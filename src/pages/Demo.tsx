import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { Helmet } from "react-helmet-async";
import auroraMark from "@/assets/aurora-mark.png";

type Turn = { role: "user" | "aurora"; text: string; delay?: number };

const script: Turn[] = [
  { role: "user", text: "I'm overwhelmed. Three deadlines, my team's morale is low, and I haven't slept properly in a week.", delay: 600 },
  { role: "aurora", text: "That's a lot to hold at once. Last Tuesday you mentioned the same pattern — three deadlines and shallow sleep. What do you think is the one thread underneath all of it?", delay: 1800 },
  { role: "user", text: "Honestly? I keep saying yes when I should be saying not yet.", delay: 1400 },
  { role: "aurora", text: "That tracks. Your last six entries have a recurring phrase: 'I should be able to handle this.' Want to look at where that belief came from, or do you want to focus on protecting your week first?", delay: 2200 },
  { role: "user", text: "Protect the week. I'll come back to the belief on Sunday.", delay: 1200 },
  { role: "aurora", text: "Good. I'll hold the belief thread for Sunday's reflection. For this week — what's the one deadline that, if it moved by 48 hours, would unlock the most oxygen?", delay: 2000 },
];

export default function Demo() {
  const [visible, setVisible] = useState<number>(0);
  const [running, setRunning] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    if (visible >= script.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), script[visible].delay ?? 1500);
    return () => clearTimeout(t);
  }, [visible, running]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [visible]);

  const restart = () => { setVisible(0); setRunning(true); };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet>
        <title>Aurora live demo — see the companion in action</title>
        <meta name="description" content="Watch a 60-second scripted conversation that shows how Aurora's memory and reflective tone actually work. No signup." />
        <link rel="canonical" href="/demo" />
        <meta property="og:title" content="Aurora live demo" />
        <meta property="og:description" content="A scripted 60-second window into how Aurora remembers, reflects and responds." />
      </Helmet>

      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm"><Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
          <div className="flex items-center gap-2">
            <img src={auroraMark} alt="" width={24} height={24} className="h-6 w-6" />
            <span className="font-serif text-lg">Live demo</span>
          </div>
          <Button variant="ghost" size="sm" onClick={restart}><RotateCcw className="h-4 w-4 mr-1" />Replay</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">A scripted conversation · no signup</p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">A 60-second window into Aurora.</h1>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            This is read-only — a sample of how memory, tone and reflection compose in a real exchange.
          </p>
        </div>

        <Card className="bg-card/60 border-border/60 p-6 h-[480px] overflow-y-auto" ref={scrollRef as React.RefObject<HTMLDivElement>}>
          <div className="space-y-5">
            {script.slice(0, visible).map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}>
                {t.role === "aurora" && (
                  <img src={auroraMark} alt="" width={28} height={28} className="h-7 w-7 mr-3 mt-1 shrink-0" />
                )}
                <div className={`max-w-[80%] ${t.role === "user" ? "bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-3" : "text-foreground leading-relaxed"}`}>
                  <p className="text-sm">{t.text}</p>
                </div>
              </div>
            ))}
            {visible < script.length && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse [animation-delay:150ms]" />
                <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse [animation-delay:300mss]" />
              </div>
            )}
          </div>
        </Card>

        <div className="mt-10 text-center">
          <h2 className="font-serif text-2xl tracking-tight">Want one of your own?</h2>
          <p className="mt-2 text-muted-foreground">Free tier, no card required.</p>
          <Button asChild size="lg" className="mt-5"><Link to="/auth">Start your Aurora</Link></Button>
        </div>
      </main>
    </div>
  );
}

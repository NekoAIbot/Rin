import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Mic, Sparkles } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import auroraMark from "@/assets/aurora-mark.png";

interface OnboardingProps {
  onComplete: (data: { name: string; focus: string; mode: string }) => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [focus, setFocus] = useState("");
  const [, setMode] = useState("");
  const { updateProfile } = useProfile();

  const next = () => setStep((s) => s + 1);
  const finish = async (chosenMode: string) => {
    const finalName = name.trim() || "Friend";
    // Persist name to profile so the popup never shows again — across devices.
    try { await updateProfile({ display_name: finalName }); } catch { /* non-blocking */ }
    onComplete({ name: finalName, focus: focus || "companionship", mode: chosenMode });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center p-6 safe-pt safe-pb">
      <div className="w-full max-w-md bg-card border border-border rounded-3xl shadow-2xl p-8 space-y-6">
        <div className="flex justify-center">
          <img src={auroraMark} alt="Aurora" width={72} height={72} className="h-18 w-18 object-contain drop-shadow-md" />
        </div>

        {step === 0 && (
          <>
            <div className="text-center space-y-2">
              <h1 className="font-display text-3xl">Hi, I'm Aurora.</h1>
              <p className="text-muted-foreground text-sm">
                Your real-time companion. What should I call you?
              </p>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="text-center text-lg h-12 rounded-xl"
              autoFocus
            />
            <Button onClick={next} className="w-full h-12 rounded-xl text-base">Continue</Button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="text-center space-y-2">
              <h2 className="font-display text-2xl">Nice to meet you, {name || "friend"}.</h2>
              <p className="text-muted-foreground text-sm">What should I help you with most?</p>
            </div>
            <div className="grid gap-2">
              {[
                { id: "companionship", label: "Companionship & conversation", icon: Sparkles },
                { id: "productivity", label: "Productivity & focus", icon: MessageCircle },
                { id: "learning", label: "Learning & curiosity", icon: Mic },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.id}
                    onClick={() => { setFocus(opt.id); next(); }}
                    className={`flex items-center gap-3 p-4 rounded-xl border text-left transition ${
                      focus === opt.id ? "border-primary bg-primary/10" : "border-border hover:bg-secondary"
                    }`}
                  >
                    <Icon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="text-center space-y-2">
              <h2 className="font-display text-2xl">How do you want to talk?</h2>
              <p className="text-muted-foreground text-sm">You can switch anytime.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => finish("text")}
                className="flex flex-col items-center gap-2 p-6 rounded-xl border border-border hover:border-primary hover:bg-primary/5"
              >
                <MessageCircle className="h-8 w-8 text-primary" />
                <span className="text-sm font-medium">Type</span>
              </button>
              <button
                onClick={() => finish("voice")}
                className="flex flex-col items-center gap-2 p-6 rounded-xl border border-border hover:border-primary hover:bg-primary/5"
              >
                <Mic className="h-8 w-8 text-accent" />
                <span className="text-sm font-medium">Talk</span>
              </button>
            </div>
          </>
        )}

        <div className="flex justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

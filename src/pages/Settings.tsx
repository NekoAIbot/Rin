import { useState, useEffect } from "react";
import {
  User, AudioLines, Brain, Palette, ShieldCheck, Lock, Link2, Blocks, Save, Trash2, Sun, Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { LocalAISettings } from "@/components/LocalAISettings";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { Panel, SurfaceHeader, AmbientBackdrop } from "@/components/aurora/Surface";
import { TelegramConnect } from "@/components/settings/TelegramConnect";

import { cn } from "@/lib/utils";

function Group({
  icon: Icon,
  title,
  blurb,
  children,
  delay = 0,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <Panel className="animate-rise-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg leading-none">{title}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{blurb}</p>
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </Panel>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl px-1 py-1.5">
      <div className="min-w-0">
        <Label className="text-[14px]">{label}</Label>
        {hint && <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const Settings = () => {
  const { user } = useAuth();
  const { profile, updateProfile } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceRate, setVoiceRate] = useState(0.92);
  const [voicePitch, setVoicePitch] = useState(1.05);
  const [modelPreference, setModelPreference] = useState("auto");
  const [offlineMode, setOfflineMode] = useState(false);
  const [saveMemory, setSaveMemory] = useState(true);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    try {
      const saved = localStorage.getItem("settings");
      if (saved) {
        const s = JSON.parse(saved);
        if (s.voiceEnabled !== undefined) setVoiceEnabled(s.voiceEnabled);
        if (s.voiceRate) setVoiceRate(s.voiceRate);
        if (s.voicePitch) setVoicePitch(s.voicePitch);
        if (s.modelPreference) setModelPreference(s.modelPreference);
        if (s.offlineMode !== undefined) setOfflineMode(s.offlineMode);
        if (s.saveMemory !== undefined) setSaveMemory(s.saveMemory);
        if (s.webSearchEnabled !== undefined) setWebSearchEnabled(s.webSearchEnabled);
        if (s.reducedMotion !== undefined) setReducedMotion(s.reducedMotion);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }, []);

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile?.display_name]);

  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reducedMotion);
  }, [reducedMotion]);

  const setTheme = (dark: boolean) => {
    setIsDark(dark);
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  };

  const handleSave = async () => {
    localStorage.setItem(
      "settings",
      JSON.stringify({
        voiceEnabled, voiceRate, voicePitch, modelPreference,
        offlineMode, saveMemory, webSearchEnabled, reducedMotion,
      }),
    );

    if (displayName.trim() && displayName !== profile?.display_name) {
      await updateProfile({ display_name: displayName.trim() });
    }

    if (user) {
      await supabase.from("user_settings").upsert(
        {
          user_id: user.id,
          voice_enabled: voiceEnabled,
          web_search_enabled: webSearchEnabled,
          preferred_model: modelPreference === "auto" ? "google/gemini-3-flash-preview" : modelPreference,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }

    window.dispatchEvent(new Event("storage"));
    toast.success("Settings saved");
  };

  return (
    <div className="relative mx-auto w-full max-w-3xl space-y-5 px-4 pb-32 pt-6 md:px-6">
      <AmbientBackdrop tone="forest" />

      <SurfaceHeader
        eyebrow="Preferences"
        title="Settings"
        subtitle="How Aurora sounds, remembers, looks, and what it's allowed to touch."
      />

      <Group icon={User} title="Profile" blurb="How Aurora addresses you." delay={0}>
        <div className="space-y-1.5">
          <Label className="text-[14px]">Display name</Label>
          <Input
            className="rounded-full"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should I call you?"
          />
        </div>
        <p className="text-[12px] text-muted-foreground">Signed in as {user?.email ?? "guest"}</p>
      </Group>

      <Group icon={AudioLines} title="Voice" blurb="The rhythm and warmth of Aurora's speech." delay={40}>
        <Row label="Speak responses aloud" hint="Aurora reads answers back to you">
          <Switch checked={voiceEnabled} onCheckedChange={setVoiceEnabled} />
        </Row>
        <div className={cn("space-y-4 transition-opacity", !voiceEnabled && "pointer-events-none opacity-50")}>
          <div className="space-y-2">
            <div className="flex justify-between text-[13px]">
              <Label>Pace</Label>
              <span className="text-muted-foreground">{voiceRate.toFixed(2)}×</span>
            </div>
            <Slider value={[voiceRate]} min={0.6} max={1.3} step={0.01} onValueChange={([v]) => setVoiceRate(v)} />
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-[13px]">
              <Label>Warmth</Label>
              <span className="text-muted-foreground">{voicePitch.toFixed(2)}</span>
            </div>
            <Slider value={[voicePitch]} min={0.8} max={1.4} step={0.01} onValueChange={([v]) => setVoicePitch(v)} />
          </div>
        </div>
      </Group>

      <Group icon={Brain} title="Memory" blurb="What Aurora keeps between conversations." delay={80}>
        <Row label="Remember our conversations" hint="Powers personalisation and recall">
          <Switch checked={saveMemory} onCheckedChange={setSaveMemory} />
        </Row>
        <Button
          variant="outline"
          className="w-full rounded-full text-destructive hover:bg-destructive/10"
          onClick={() => {
            localStorage.removeItem("aurora_memories");
            toast.success("Local memory cleared");
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Clear local memory
        </Button>
      </Group>

      <Group icon={Palette} title="Appearance" blurb="Light, dark, and how much motion you want." delay={120}>
        <Row label="Theme" hint="Cream by day, forest by night">
          <div className="inline-flex rounded-full surface-sunk p-1">
            {[
              { dark: false, icon: Sun, label: "Light" },
              { dark: true, icon: Moon, label: "Dark" },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setTheme(opt.dark)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-all duration-300",
                  isDark === opt.dark ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <opt.icon className="h-3.5 w-3.5" /> {opt.label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Reduce motion" hint="Calms animations across the app">
          <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
        </Row>
      </Group>

      <Group icon={ShieldCheck} title="Permissions" blurb="What Aurora may reach for on your device." delay={160}>
        <Row label="Web access" hint="Look things up when a question needs fresh facts">
          <Switch checked={webSearchEnabled} onCheckedChange={setWebSearchEnabled} />
        </Row>
        <Row label="Microphone" hint="Granted by your browser when you first record">
          <span className="text-[13px] text-muted-foreground">Browser managed</span>
        </Row>
        <Row label="Camera" hint="Only used when you open the Visual workspace">
          <span className="text-[13px] text-muted-foreground">Browser managed</span>
        </Row>
      </Group>

      <Group icon={Lock} title="Privacy" blurb="Where your data goes and what stays local." delay={200}>
        <Row label="Offline mode" hint="Use only locally available models">
          <Switch checked={offlineMode} onCheckedChange={setOfflineMode} />
        </Row>
        <div className="space-y-1.5">
          <Label className="text-[14px]">Model preference</Label>
          <Select value={modelPreference} onValueChange={setModelPreference}>
            <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (best available)</SelectItem>
              <SelectItem value="google/gemini-3-flash-preview">Gemini 3 Flash</SelectItem>
              <SelectItem value="google/gemini-2.5-pro">Gemini 2.5 Pro</SelectItem>
              <SelectItem value="openai/gpt-5-mini">GPT-5 Mini</SelectItem>
              <SelectItem value="local">Local models only</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-[12px] text-muted-foreground">
          Your data is isolated per account with row-level security. Deleting a memory deletes it for good.
        </p>
      </Group>

      <Group icon={Link2} title="Connected accounts" blurb="Sign-in methods linked to this account." delay={240}>
        <Row label="Email" hint={user?.email ?? "Not connected"}>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[12px] text-primary">Active</span>
        </Row>
        <TelegramConnect />

        <Row label="Google" hint="Used for one-tap sign-in">
          <span className="text-[13px] text-muted-foreground">
            {user?.app_metadata?.provider === "google" ? "Connected" : "Available at sign-in"}
          </span>
        </Row>
      </Group>

      <Group icon={Blocks} title="Plugins" blurb="Local models and extensions Aurora can run." delay={280}>
        <LocalAISettings />
      </Group>

      <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center safe-pb">
        <Button
          onClick={handleSave}
          className="pointer-events-auto rounded-full px-6 shadow-lift transition-transform active:scale-95"
        >
          <Save className="mr-1.5 h-4 w-4" /> Save changes
        </Button>
      </div>
    </div>
  );
};

export default Settings;

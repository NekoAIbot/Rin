import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { Onboarding } from "@/components/welcome/Onboarding";
import { ModeContent } from "@/components/mode-content/ModeContent";
import { useProfile } from "@/hooks/useProfile";

const PRIMARY = ["home", "workspace", "memory", "automations", "settings"];

const Index = () => {
  const [activeMode, setActiveMode] = useState("home");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { profile, isLoading: profileLoading } = useProfile();

  // Onboarding shows only when: profile loaded AND no display_name AND no localStorage visited flag.
  useEffect(() => {
    if (profileLoading) return;
    const visited = localStorage.getItem("aurora_has_visited");
    const hasName = !!(profile?.display_name && profile.display_name.trim());
    if (!visited && !hasName) setShowOnboarding(true);
    else if (hasName && !visited) localStorage.setItem("aurora_has_visited", "true");
  }, [profile, profileLoading]);

  const handleModeChange = useCallback((mode: string) => {
    const next = PRIMARY.includes(mode) ? mode : "home";
    setActiveMode(next);
    localStorage.setItem("aurora_last_mode", next);
  }, []);

  useEffect(() => {
    const lastMode = localStorage.getItem("aurora_last_mode");
    if (lastMode && PRIMARY.includes(lastMode)) setActiveMode(lastMode);

    const handleSetMode = (e: Event) =>
      handleModeChange((e as CustomEvent).detail.mode);

    window.addEventListener("setMode", handleSetMode as EventListener);
    return () => window.removeEventListener("setMode", handleSetMode as EventListener);
  }, [handleModeChange]);

  const completeOnboarding = (data: { name: string; focus: string; mode: string }) => {
    localStorage.setItem("aurora_has_visited", "true");
    localStorage.setItem("aurora_user_name", data.name);
    localStorage.setItem("aurora_focus", data.focus);
    setShowOnboarding(false);
    handleModeChange("home");
  };

  return (
    <div className="h-screen flex overflow-hidden">
      {showOnboarding && <Onboarding onComplete={completeOnboarding} />}
      <Sidebar onModeChange={handleModeChange} activeMode={activeMode} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <MobileNav onModeChange={handleModeChange} activeMode={activeMode} />
        <main className="flex-1 overflow-auto">
          <ModeContent activeMode={activeMode} onModeChange={handleModeChange} />
        </main>
      </div>
    </div>
  );
};

export default Index;

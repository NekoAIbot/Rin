import { useState } from "react";
import { Workflow, Activity, LayoutGrid } from "lucide-react";
import { RitualDashboard } from "@/components/RitualDashboard";
import { BehavioralPatterns } from "@/components/BehavioralPatterns";
import { AutomationBuilder } from "@/components/automations/AutomationBuilder";
import { SKILLS } from "@/lib/intent/skills";
import { Panel, SurfaceHeader, Segmented, AmbientBackdrop } from "@/components/aurora/Surface";

const VIEWS = [
  { value: "builder", label: "Automations", icon: Workflow },
  { value: "routines", label: "Routines", icon: Activity },
  { value: "skills", label: "Skills", icon: LayoutGrid },
];

/**
 * Automations — the things Aurora does without being asked, built visually.
 */
export default function Automations() {
  const [view, setView] = useState("builder");

  return (
    <div className="relative mx-auto w-full max-w-4xl space-y-7 px-4 pb-16 pt-6 md:px-6">
      <AmbientBackdrop tone="gold" />

      <SurfaceHeader
        eyebrow="Runs on your behalf"
        title="Automations"
        subtitle="Design a routine step by step. Aurora always shows you the plan before it acts."
      />

      <Segmented items={VIEWS} value={view} onChange={setView} />

      {view === "builder" && <AutomationBuilder />}

      {view === "routines" && (
        <div className="animate-rise-in space-y-6">
          <RitualDashboard />
          <BehavioralPatterns />
        </div>
      )}

      {view === "skills" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {SKILLS.map((skill, i) => (
            <Panel
              key={skill.id}
              className="animate-rise-in hover:shadow-lift"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[15px] font-medium">{skill.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {skill.category}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] text-muted-foreground">{skill.description}</p>
              {skill.requiresDevice && (
                <p className="mt-2 text-[11px] text-primary">Requires device permission</p>
              )}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

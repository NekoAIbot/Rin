
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { 
  Brain, 
  Briefcase, 
  GraduationCap, 
  Heart, 
  Lightbulb, 
  User 
} from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { toast } from "sonner";

interface PersonaOption {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  color: string;
}

interface PersonaSelectorProps {
  onSelectPersona: (persona: string) => void;
}

export function PersonaSelector({ onSelectPersona }: PersonaSelectorProps) {
  const [activePersona, setActivePersona] = useState<string>("assistant");
  
  // Load saved persona on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const { activePersona } = JSON.parse(savedSettings);
        if (activePersona) {
          setActivePersona(activePersona);
        }
      }
    } catch (error) {
      console.error("Failed to load persona setting:", error);
    }
  }, []);
  
  const personas: PersonaOption[] = [
    {
      id: "assistant",
      name: "Assistant",
      icon: User,
      description: "General-purpose assistant who can help with a variety of tasks",
      color: "bg-primary text-primary-foreground"
    },
    {
      id: "teacher",
      name: "Teacher",
      icon: GraduationCap,
      description: "Educational expert who explains concepts clearly and provides learning resources",
      color: "bg-blue-500 text-white"
    },
    {
      id: "creative",
      name: "Creative",
      icon: Lightbulb,
      description: "Creative partner for brainstorming, art, music, writing, and other creative endeavors",
      color: "bg-purple-500 text-white"
    },
    {
      id: "professional",
      name: "Professional",
      icon: Briefcase,
      description: "Business-focused assistant for work-related tasks and professional communication",
      color: "bg-slate-700 text-white"
    },
    {
      id: "friend",
      name: "Friend",
      icon: Heart,
      description: "Casual, friendly conversation partner with a more relaxed tone",
      color: "bg-pink-500 text-white"
    },
    {
      id: "scientist",
      name: "Scientist",
      icon: Brain,
      description: "Analytical assistant who provides detailed, evidence-based information",
      color: "bg-green-600 text-white"
    }
  ];

  const handlePersonaSelect = (persona: string) => {
    setActivePersona(persona);
    onSelectPersona(persona);
    
    // Save to settings
    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        settings.activePersona = persona;
        localStorage.setItem("settings", JSON.stringify(settings));
      } else {
        localStorage.setItem("settings", JSON.stringify({ activePersona: persona }));
      }
    } catch (error) {
      console.error("Failed to save persona setting:", error);
    }
    
    toast.success(`Switched to ${personas.find(p => p.id === persona)?.name} mode`);
  };

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {personas.map((persona) => {
        const Icon = persona.icon;
        return (
          <HoverCard key={persona.id}>
            <HoverCardTrigger asChild>
              <Button
                variant={activePersona === persona.id ? "default" : "outline"}
                className={`${activePersona === persona.id ? persona.color : ''} rounded-full transition-all`}
                onClick={() => handlePersonaSelect(persona.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {persona.name}
              </Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <div className="flex justify-between space-x-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold">{persona.name} Mode</h4>
                  <p className="text-sm">
                    {persona.description}
                  </p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}

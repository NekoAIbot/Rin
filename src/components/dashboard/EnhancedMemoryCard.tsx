
import { Database, BookMarked } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

interface MemoryStats {
  conversations: number;
  facts: number;
  preferences: number;
  learning: number;
}

export function EnhancedMemoryCard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<MemoryStats>({
    conversations: 43,
    facts: 12,
    preferences: 8,
    learning: 5
  });
  
  useEffect(() => {
    // Load actual stats from localStorage if available
    try {
      const memories = localStorage.getItem("aurora_memories");
      if (memories) {
        const parsedMemories = JSON.parse(memories);
        
        // Count by categories
        const facts = parsedMemories.filter((m: any) => m.type === 'fact').length;
        const preferences = parsedMemories.filter((m: any) => m.type === 'preference').length;
        const conversations = 43; // Placeholder for conversation history count
        const learning = parsedMemories.filter((m: any) => m.type === 'learning').length;
        
        setStats({
          conversations,
          facts,
          preferences,
          learning
        });
      }
    } catch (error) {
      console.error("Error loading memory stats:", error);
    }
  }, []);

  const handleExploreMemory = () => {
    navigate("/app");
    // Use setTimeout to ensure navigation completes before triggering mode change
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('quickAction', { 
        detail: { action: "memory" } 
      }));
    }, 100);
  };

  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-aurora-blue/10">
            <Database className="h-5 w-5 text-aurora-blue" />
          </div>
          <h3 className="font-medium">Enhanced Memory</h3>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs flex items-center gap-1"
          onClick={handleExploreMemory}
        >
          <BookMarked className="h-3 w-3" />
          <span>Explore</span>
        </Button>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Conversation Memory</span>
            <span className="text-sm font-medium">{stats.conversations} entries</span>
          </div>
          <Progress value={Math.min(stats.conversations, 100)} className="h-2" />
        </div>
        
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Personal Facts</span>
            <span className="text-sm font-medium">{stats.facts} entries</span>
          </div>
          <Progress value={Math.min(stats.facts * 2, 100)} className="h-2" />
        </div>
        
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">User Preferences</span>
            <span className="text-sm font-medium">{stats.preferences} entries</span>
          </div>
          <Progress value={Math.min(stats.preferences * 4, 100)} className="h-2" />
        </div>
        
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Learning Sessions</span>
            <span className="text-sm font-medium">{stats.learning} entries</span>
          </div>
          <Progress value={Math.min(stats.learning * 4, 100)} className="h-2" />
        </div>
      </div>
    </Card>
  );
}

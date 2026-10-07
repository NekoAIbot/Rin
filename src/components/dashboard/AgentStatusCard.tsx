
import { Bot, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

export function AgentStatusCard() {
  const navigate = useNavigate();
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  
  useEffect(() => {
    // Load active agents from localStorage
    try {
      const savedAgents = localStorage.getItem("aurora_active_agents");
      if (savedAgents) {
        setActiveAgents(JSON.parse(savedAgents));
      }
    } catch (error) {
      console.error("Failed to load active agents:", error);
    }
  }, []);
  
  const handleExploreAgents = () => {
    navigate("/app");
    // Use setTimeout to ensure navigation completes before triggering mode change
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('quickAction', { 
        detail: { action: "agents" } 
      }));
    }, 100);
  };
  
  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-aurora-purple/10">
            <Bot className="h-5 w-5 text-aurora-purple" />
          </div>
          <h3 className="font-medium">Agent Framework</h3>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs flex items-center gap-1"
          onClick={handleExploreAgents}
        >
          <span>Manage</span>
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Active Agents</span>
            <span className="text-sm font-medium">{activeAgents.length} of 4</span>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {activeAgents.length > 0 ? (
              activeAgents.map((agent) => (
                <Badge key={agent} variant="outline" className="bg-background/50">
                  {agent.charAt(0).toUpperCase() + agent.slice(1)}
                </Badge>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">No active agents</span>
            )}
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-medium mb-2">Recent Activities</h4>
          {activeAgents.length > 0 ? (
            <ul className="space-y-1">
              <li className="text-xs text-muted-foreground">Research agent collected data on your recent topics</li>
              <li className="text-xs text-muted-foreground">Schedule agent synced with your calendar</li>
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Activate agents to see activities</p>
          )}
        </div>
      </div>
    </Card>
  );
}

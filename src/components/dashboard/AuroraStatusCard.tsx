
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AuroraAvatar } from "@/components/AuroraAvatar";

export function AuroraStatusCard() {
  const [progress, setProgress] = useState(0);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setProgress(66);
    }, 500);
    return () => clearTimeout(timer);
  }, []);
  
  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex items-center gap-4">
        <AuroraAvatar isActive={true} />
        <div>
          <h3 className="font-bold text-xl">Aurora</h3>
          <p className="text-sm text-muted-foreground">AI Assistant</p>
        </div>
      </div>
      <div className="mt-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm">System Status</span>
          <span className="text-xs px-2 py-1 rounded-full bg-aurora-green/20 text-aurora-green">Online</span>
        </div>
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground mt-2">
          <span>System Resources</span>
          <span>{progress}% Optimized</span>
        </div>
      </div>
    </Card>
  );
}

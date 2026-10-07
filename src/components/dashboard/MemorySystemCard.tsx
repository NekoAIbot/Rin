
import { Database } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export function MemorySystemCard() {
  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-aurora-blue/10">
          <Database className="h-5 w-5 text-aurora-blue" />
        </div>
        <h3 className="font-medium">Memory System</h3>
      </div>
      
      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Conversation History</span>
            <span className="text-sm font-medium">43 entries</span>
          </div>
          <Progress value={43} className="h-2" />
        </div>
        
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Personal Facts</span>
            <span className="text-sm font-medium">12 entries</span>
          </div>
          <Progress value={24} className="h-2" />
        </div>
        
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-sm">Learning Sessions</span>
            <span className="text-sm font-medium">5 entries</span>
          </div>
          <Progress value={10} className="h-2" />
        </div>
      </div>
    </Card>
  );
}

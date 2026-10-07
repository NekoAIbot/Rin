
import { Brain } from "lucide-react";
import { Card } from "@/components/ui/card";

export function AiModelsCard() {
  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-aurora-orange/10">
          <Brain className="h-5 w-5 text-aurora-orange" />
        </div>
        <h3 className="font-medium">AI Models</h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-aurora-blue"></span>
            <span className="text-sm">GPT-4o</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10">Active</span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-aurora-purple"></span>
            <span className="text-sm">Whisper</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10">Active</span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-aurora-pink"></span>
            <span className="text-sm">Local LLM</span>
          </div>
          <span className="text-xs px-2 py-1 rounded-full bg-muted/50">Standby</span>
        </div>
      </div>
    </Card>
  );
}

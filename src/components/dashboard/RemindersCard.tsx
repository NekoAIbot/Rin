
import { Clock, Heart, Globe, Brain } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface RemindersCardProps {
  onViewAllReminders: () => void;
}

export function RemindersCard({ onViewAllReminders }: RemindersCardProps) {
  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-aurora-cyan/10">
          <Clock className="h-5 w-5 text-aurora-cyan" />
        </div>
        <h3 className="font-medium">Upcoming Reminders</h3>
      </div>
      
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-aurora-pink" />
            <span className="text-sm">Health check-in</span>
          </div>
          <span className="text-xs">Tomorrow, 9:00 AM</span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-aurora-blue" />
            <span className="text-sm">News briefing</span>
          </div>
          <span className="text-xs">Daily, 8:00 AM</span>
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-aurora-purple" />
            <span className="text-sm">Learning session</span>
          </div>
          <span className="text-xs">Friday, 7:00 PM</span>
        </div>
      </div>
      
      <Button 
        variant="outline" 
        className="w-full mt-4 bg-background/30"
        onClick={onViewAllReminders}
      >
        View All Reminders
      </Button>
    </Card>
  );
}

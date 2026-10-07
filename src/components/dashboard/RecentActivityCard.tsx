
import { MessageCircle, BookMarked } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";

interface ActivityItem {
  type: string;
  time: string;
  description: string;
}

export function RecentActivityCard() {
  const [activities, setActivities] = useState<ActivityItem[]>([
    {
      type: "conversation",
      time: "10:23 AM",
      description: "Weather information requested"
    },
    {
      type: "memory",
      time: "Yesterday",
      description: "Memory about user preferences saved"
    },
    {
      type: "conversation",
      time: "Yesterday",
      description: "Calendar appointment added"
    },
    {
      type: "memory",
      time: "2 days ago",
      description: "New fact about user education added"
    }
  ]);

  useEffect(() => {
    // Load memories to extract recent activities
    try {
      const memories = localStorage.getItem("aurora_memories");
      if (memories) {
        const parsedMemories = JSON.parse(memories);
        // Get 3 most recent memories
        const recentMemories = parsedMemories
          .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, 3)
          .map((memory: any) => ({
            type: "memory",
            time: formatRelativeTime(new Date(memory.timestamp)),
            description: `New ${memory.type} added: ${memory.content.substring(0, 30)}${memory.content.length > 30 ? "..." : ""}`
          }));
        
        // Merge with default activities and sort by recency
        const combinedActivities = [...recentMemories, ...activities]
          .slice(0, 5); // Limit to 5 items total
        
        setActivities(combinedActivities);
      }
    } catch (error) {
      console.error("Failed to load memory activities:", error);
    }
  }, []);
  
  // Format time relative to now (e.g., "2 mins ago", "Yesterday", etc.)
  const formatRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMins / 60);
    const diffDays = Math.round(diffHours / 24);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays} days ago`;
    
    // Format as actual date for older items
    return new Intl.DateTimeFormat('en-US', { 
      month: 'short', 
      day: 'numeric' 
    }).format(date);
  };

  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-full bg-aurora-purple/10">
          <MessageCircle className="h-5 w-5 text-aurora-purple" />
        </div>
        <h3 className="font-medium">Recent Activity</h3>
      </div>
      
      <div className="space-y-3">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className="text-xs text-muted-foreground pt-0.5">{activity.time}</span>
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                {activity.type === "memory" ? (
                  <BookMarked className="h-3.5 w-3.5 text-aurora-blue" />
                ) : (
                  <MessageCircle className="h-3.5 w-3.5 text-aurora-purple" />
                )}
                <span className="text-xs font-medium capitalize">{activity.type}</span>
              </div>
              <span className="text-sm">{activity.description}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

import { useState } from "react";
import { Settings2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDashboardWidgets, DashboardWidgets } from "@/hooks/useDashboardWidgets";
import { toast } from "sonner";

const WIDGET_LABELS: Record<keyof DashboardWidgets, { label: string; description: string }> = {
  auroraStatus: { label: "Aurora Status", description: "AI assistant status and activity" },
  aiModels: { label: "AI Models", description: "Available AI models overview" },
  recentActivity: { label: "Recent Activity", description: "Latest interactions and events" },
  quickActions: { label: "Quick Actions", description: "Shortcut buttons for common tasks" },
  enhancedMemory: { label: "Enhanced Memory", description: "Memory system status" },
  reminders: { label: "Reminders", description: "Upcoming reminders and tasks" },
  agentStatus: { label: "Agent Status", description: "AI agent framework status" },
  multimodal: { label: "Multimodal", description: "Multimodal capabilities overview" },
};

export function DashboardSettings() {
  const { widgets, toggleWidget, enableAll, disableAll } = useDashboardWidgets();
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    toast.success("Dashboard settings saved successfully");
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Customize
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Dashboard Widgets</SheetTitle>
          <SheetDescription>
            Choose which widgets to display on your dashboard.
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={enableAll}>
              Enable All
            </Button>
            <Button variant="outline" size="sm" onClick={disableAll}>
              Disable All
            </Button>
          </div>
          
          <Separator />
          
          <div className="space-y-4">
            {(Object.keys(WIDGET_LABELS) as Array<keyof DashboardWidgets>).map((key) => (
              <div key={key} className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor={key} className="text-sm font-medium">
                    {WIDGET_LABELS[key].label}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {WIDGET_LABELS[key].description}
                  </p>
                </div>
                <Switch
                  id={key}
                  checked={widgets[key]}
                  onCheckedChange={() => toggleWidget(key)}
                />
              </div>
            ))}
          </div>
          
          <Separator />
          
          <Button onClick={handleSave} className="w-full gap-2">
            <Check className="h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

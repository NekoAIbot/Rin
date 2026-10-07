import { useState, useEffect } from "react";

export interface DashboardWidgets {
  auroraStatus: boolean;
  aiModels: boolean;
  recentActivity: boolean;
  quickActions: boolean;
  enhancedMemory: boolean;
  reminders: boolean;
  agentStatus: boolean;
  multimodal: boolean;
}

const DEFAULT_WIDGETS: DashboardWidgets = {
  auroraStatus: true,
  aiModels: true,
  recentActivity: true,
  quickActions: true,
  enhancedMemory: true,
  reminders: true,
  agentStatus: true,
  multimodal: true,
};

const STORAGE_KEY = "dashboard-widgets";

export function useDashboardWidgets() {
  const [widgets, setWidgets] = useState<DashboardWidgets>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_WIDGETS, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error("Failed to load dashboard widgets:", error);
    }
    return DEFAULT_WIDGETS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    } catch (error) {
      console.error("Failed to save dashboard widgets:", error);
    }
  }, [widgets]);

  const toggleWidget = (widget: keyof DashboardWidgets) => {
    setWidgets((prev) => ({
      ...prev,
      [widget]: !prev[widget],
    }));
  };

  const resetWidgets = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  const enableAll = () => {
    setWidgets(DEFAULT_WIDGETS);
  };

  const disableAll = () => {
    setWidgets({
      auroraStatus: false,
      aiModels: false,
      recentActivity: false,
      quickActions: false,
      enhancedMemory: false,
      reminders: false,
      agentStatus: false,
      multimodal: false,
    });
  };

  return {
    widgets,
    toggleWidget,
    resetWidgets,
    enableAll,
    disableAll,
  };
}

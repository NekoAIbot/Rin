
import { EnhancedMemoryCard } from "./EnhancedMemoryCard";
import { RemindersCard } from "./RemindersCard";
import { AgentStatusCard } from "./AgentStatusCard";
import { MultimodalCapabilitiesCard } from "./MultimodalCapabilitiesCard";

interface SystemStatusProps {
  onViewAllReminders: () => void;
}

export function SystemStatus({ onViewAllReminders }: SystemStatusProps) {
  return (
    <>
      <h2 className="text-xl font-bold mb-4">System Status</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <EnhancedMemoryCard />
        <RemindersCard onViewAllReminders={onViewAllReminders} />
        <AgentStatusCard />
        <MultimodalCapabilitiesCard />
      </div>
    </>
  );
}

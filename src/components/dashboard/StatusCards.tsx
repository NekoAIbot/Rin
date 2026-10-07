
import { AuroraStatusCard } from "./AuroraStatusCard";
import { AiModelsCard } from "./AiModelsCard";
import { RecentActivityCard } from "./RecentActivityCard";

export function StatusCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      <AuroraStatusCard />
      <AiModelsCard />
      <RecentActivityCard />
    </div>
  );
}

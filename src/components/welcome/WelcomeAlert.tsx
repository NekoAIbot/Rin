
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface WelcomeAlertProps {
  onDismiss: () => void;
  onQuickAction: (action: string) => void;
}

export function WelcomeAlert({ onDismiss, onQuickAction }: WelcomeAlertProps) {
  return (
    <div className="p-4">
      <Alert className="border-accent/30 relative">
        <Button 
          variant="ghost" 
          size="sm" 
          className="absolute top-2 right-2 h-6 w-6 p-0 rounded-full"
          onClick={onDismiss}
        >
          &times;
        </Button>
        <AlertTitle className="text-accent">
          Welcome to Aurora AI Assistant 3.0
        </AlertTitle>
        <AlertDescription className="text-sm">
          This is an enhanced version of Aurora with improved memory system, multimodal capabilities, and multilingual persona support.
          Explore different personas, try voice commands, generate reports, and check out the advanced features.
        </AlertDescription>
        
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => onQuickAction("today")}>
            What's today?
          </Button>
          <Button size="sm" variant="outline" onClick={() => onQuickAction("weather")}>
            Check weather
          </Button>
          <Button size="sm" variant="outline" onClick={() => onQuickAction("multimodal")}>
            Try multimodal
          </Button>
          <Button size="sm" variant="outline" onClick={() => onQuickAction("personas")}>
            Try personas
          </Button>
        </div>
      </Alert>
    </div>
  );
}

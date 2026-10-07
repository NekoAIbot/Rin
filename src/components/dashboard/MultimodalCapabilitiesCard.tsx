
import { Image, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

export function MultimodalCapabilitiesCard() {
  const navigate = useNavigate();
  
  const handleExploreMultimodal = () => {
    navigate("/app");
    // Use setTimeout to ensure navigation completes before triggering mode change
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('quickAction', { 
        detail: { action: "multimodal" } 
      }));
    }, 100);
  };
  
  return (
    <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-aurora-cyan/10">
            <Image className="h-5 w-5 text-aurora-cyan" />
          </div>
          <h3 className="font-medium">Multimodal Capabilities</h3>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="text-xs flex items-center gap-1"
          onClick={handleExploreMultimodal}
        >
          <span>Explore</span>
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
      
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-medium mb-2">Available Capabilities</h4>
          <div className="flex flex-wrap gap-2 mb-3">
            <Badge variant="outline" className="bg-background/50">
              Image Analysis
            </Badge>
            <Badge variant="outline" className="bg-background/50">
              Image Generation
            </Badge>
            <Badge variant="outline" className="bg-background/50">
              Text Recognition
            </Badge>
          </div>
        </div>
        
        <div>
          <h4 className="text-sm font-medium mb-2">Usage Tips</h4>
          <ul className="space-y-1">
            <li className="text-xs text-muted-foreground">Upload images to analyze content</li>
            <li className="text-xs text-muted-foreground">Generate images from text descriptions</li>
            <li className="text-xs text-muted-foreground">Extract text from image documents</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

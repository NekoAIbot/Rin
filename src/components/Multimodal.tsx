
import { useState, useRef, ChangeEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Image as ImageIcon, Upload, Download, RefreshCcw, Search, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export function Multimodal() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imageDescription, setImageDescription] = useState("");
  const [imageAnalysis, setImageAnalysis] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<string | null>(null);
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  
  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>, target: "analyze" | "ocr") => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size should be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        if (target === "analyze") {
          setSelectedImage(data);
          setImageAnalysis(null);
        } else {
          setOcrImage(data);
          setOcrResult(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const callMultimodal = async (action: string, image_data?: string, prompt?: string) => {
    const { data, error } = await supabase.functions.invoke("multimodal", {
      body: { action, image_data, prompt },
    });
    if (error) throw new Error(error.message);
    return data;
  };
  
  const handleAnalyzeImage = async () => {
    if (!selectedImage) { toast.error("Please upload an image first"); return; }
    setIsProcessing(true);
    try {
      const data = await callMultimodal("analyze", selectedImage);
      setImageAnalysis(data.result);
      toast.success("Image analysis complete");
    } catch (err) {
      toast.error("Analysis failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleGenerateImage = async () => {
    if (!imageDescription.trim()) { toast.error("Please enter a description"); return; }
    setIsProcessing(true);
    try {
      const data = await callMultimodal("generate", undefined, imageDescription);
      if (data.image_url) {
        setGeneratedImage(data.image_url);
        toast.success("Image generated!");
      } else {
        toast.error("No image was generated. Try a different prompt.");
      }
    } catch (err) {
      toast.error("Generation failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOCR = async () => {
    if (!ocrImage) { toast.error("Please upload an image first"); return; }
    setIsProcessing(true);
    try {
      const data = await callMultimodal("ocr", ocrImage);
      setOcrResult(data.result);
      toast.success("Text extraction complete");
    } catch (err) {
      toast.error("OCR failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    link.download = `aurora-generated-${Date.now()}.png`;
    link.click();
  };
  
  const handleClearImage = () => {
    setSelectedImage(null);
    setImageAnalysis(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearOcr = () => {
    setOcrImage(null);
    setOcrResult(null);
    if (ocrInputRef.current) ocrInputRef.current.value = "";
  };

  const ProcessingSpinner = ({ text }: { text: string }) => (
    <div className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
  
  return (
    <div className="p-6 container mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Multimodal Interface</h1>
        <p className="text-muted-foreground">Process and generate visual information with AI</p>
      </header>
      
      <Tabs defaultValue="analyze">
        <TabsList className="mb-4">
          <TabsTrigger value="analyze">Analyze Images</TabsTrigger>
          <TabsTrigger value="generate">Generate Images</TabsTrigger>
          <TabsTrigger value="ocr">Text Recognition</TabsTrigger>
        </TabsList>
        
        {/* Analyze Tab */}
        <TabsContent value="analyze" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Image Analysis</h3>
                {selectedImage && (
                  <Button variant="ghost" size="sm" onClick={handleClearImage}>
                    <RefreshCcw className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>
              
              {selectedImage ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <div className="relative aspect-video rounded-md overflow-hidden border border-input mb-4">
                      <img src={selectedImage} alt="Uploaded" className="object-contain w-full h-full" />
                    </div>
                    <Button onClick={handleAnalyzeImage} disabled={isProcessing} className="mb-2">
                      {isProcessing ? <ProcessingSpinner text="Analyzing..." /> : (
                        <><Search className="h-4 w-4 mr-2" /> Analyze Image</>
                      )}
                    </Button>
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-sm font-medium mb-2">Analysis Results</h4>
                    {imageAnalysis ? (
                      <div className="bg-secondary/30 p-3 rounded-md h-full overflow-y-auto max-h-80">
                        <p className="text-sm whitespace-pre-wrap">{imageAnalysis}</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full bg-secondary/20 rounded-md p-6">
                        <p className="text-muted-foreground text-center">
                          {isProcessing ? "Analyzing image..." : "Click 'Analyze Image' to process"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  className="border-2 border-dashed border-secondary/50 rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/10 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="p-3 rounded-full bg-secondary/20 mb-3">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium mb-1">Upload an image</p>
                  <p className="text-sm text-muted-foreground text-center mb-3">Drag and drop or click to browse</p>
                  <Button variant="outline" size="sm">Select Image</Button>
                  <input type="file" ref={fileInputRef} onChange={(e) => handleImageUpload(e, "analyze")} accept="image/*" className="hidden" />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
        
        {/* Generate Tab */}
        <TabsContent value="generate" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-col space-y-4">
              <h3 className="text-lg font-medium">Image Generation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col">
                  <label htmlFor="description" className="text-sm font-medium mb-2">Image Description</label>
                  <Textarea
                    id="description"
                    placeholder="Describe the image you want to generate..."
                    value={imageDescription}
                    onChange={(e) => setImageDescription(e.target.value)}
                    className="min-h-32 mb-4"
                  />
                  <Button onClick={handleGenerateImage} disabled={isProcessing || !imageDescription.trim()}>
                    {isProcessing ? <ProcessingSpinner text="Generating..." /> : (
                      <><ImageIcon className="h-4 w-4 mr-2" /> Generate Image</>
                    )}
                  </Button>
                </div>
                <div className="flex flex-col">
                  <h4 className="text-sm font-medium mb-2">Generated Image</h4>
                  {generatedImage ? (
                    <>
                      <div className="relative aspect-video rounded-md overflow-hidden border border-input mb-4">
                        <img src={generatedImage} alt="Generated" className="object-contain w-full h-full" />
                      </div>
                      <Button variant="outline" size="sm" className="w-fit" onClick={handleDownload}>
                        <Download className="h-4 w-4 mr-2" /> Save Image
                      </Button>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full aspect-video bg-secondary/20 rounded-md">
                      <p className="text-muted-foreground text-center">
                        {isProcessing ? "Generating image..." : "Enter a description and click generate"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
        
        {/* OCR Tab */}
        <TabsContent value="ocr" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-col space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Text Recognition (OCR)</h3>
                {ocrImage && (
                  <Button variant="ghost" size="sm" onClick={handleClearOcr}>
                    <RefreshCcw className="h-4 w-4 mr-1" /> Clear
                  </Button>
                )}
              </div>

              {ocrImage ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex flex-col">
                    <div className="relative aspect-video rounded-md overflow-hidden border border-input mb-4">
                      <img src={ocrImage} alt="OCR source" className="object-contain w-full h-full" />
                    </div>
                    <Button onClick={handleOCR} disabled={isProcessing} className="mb-2">
                      {isProcessing ? <ProcessingSpinner text="Extracting text..." /> : (
                        <><FileText className="h-4 w-4 mr-2" /> Extract Text</>
                      )}
                    </Button>
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-sm font-medium mb-2">Extracted Text</h4>
                    {ocrResult ? (
                      <div className="bg-secondary/30 p-3 rounded-md h-full overflow-y-auto max-h-80">
                        <pre className="text-sm whitespace-pre-wrap font-mono">{ocrResult}</pre>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full bg-secondary/20 rounded-md p-6">
                        <p className="text-muted-foreground text-center">
                          {isProcessing ? "Extracting text..." : "Click 'Extract Text' to process"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div 
                  className="border-2 border-dashed border-secondary/50 rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:bg-secondary/10 transition-colors"
                  onClick={() => ocrInputRef.current?.click()}
                >
                  <div className="p-3 rounded-full bg-secondary/20 mb-3">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium mb-1">Upload an image with text</p>
                  <p className="text-sm text-muted-foreground text-center mb-3">Aurora will extract text content from your image</p>
                  <Button variant="outline" size="sm">Select Image</Button>
                  <input type="file" ref={ocrInputRef} onChange={(e) => handleImageUpload(e, "ocr")} accept="image/*" className="hidden" />
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

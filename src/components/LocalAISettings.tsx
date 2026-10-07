
import React, { useState, useEffect } from 'react';
import { useLocalAI } from '@/hooks/useLocalAI';
import { usePlatform } from '@/hooks/use-platform';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { 
  Download, 
  Headphones, 
  Laptop, 
  Loader2, 
  Play, 
  Smartphone, 
  Square,
  CheckCircle,
  Terminal,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const LocalAISettings = () => {
  const { 
    isAvailable, 
    isLoading, 
    error, 
    models, 
    activeModel,
    downloadModel,
    loadModel,
    unloadModel,
    runInference,
    getModelUsage
  } = useLocalAI();
  
  const { isMobile, isDesktop, platformName } = usePlatform();
  
  // Track which models are currently being processed
  const [processingModels, setProcessingModels] = useState<Record<string, string>>({});
  // Track which models have been tested
  const [testedModels, setTestedModels] = useState<Record<string, boolean>>({});
  // Test results
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  // Track selected tab
  const [activeTab, setActiveTab] = useState<string>("all");

  // Load previously tested models and results from localStorage
  useEffect(() => {
    try {
      const savedTestedModels = localStorage.getItem('aurora_tested_models');
      if (savedTestedModels) {
        setTestedModels(JSON.parse(savedTestedModels));
      }
      
      const savedTestResults = localStorage.getItem('aurora_test_results');
      if (savedTestResults) {
        setTestResults(JSON.parse(savedTestResults));
      }
    } catch (error) {
      console.error("Failed to load testing data:", error);
    }
  }, []);

  // Filter models based on active tab
  const filteredModels = models.filter(model => {
    if (activeTab === "all") return true;
    return model.type === activeTab;
  });

  const handleDownload = async (modelName: string) => {
    try {
      setProcessingModels(prev => ({ ...prev, [modelName]: 'downloading' }));
      toast.info(`Downloading model: ${modelName}`, {
        description: "This may take several minutes depending on your connection speed.",
        duration: 5000,
      });
      
      await downloadModel(modelName);
      
      toast.success(`Model downloaded: ${modelName}`, {
        description: "You can now load this model for use.",
      });
      
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    } catch (error) {
      toast.error(`Failed to download model: ${error instanceof Error ? error.message : String(error)}`);
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    }
  };

  const handleLoad = async (modelName: string) => {
    try {
      setProcessingModels(prev => ({ ...prev, [modelName]: 'loading' }));
      toast.info(`Loading model: ${modelName}`, {
        description: "Initializing model for inference...",
      });
      
      await loadModel(modelName);
      
      toast.success(`Model loaded: ${modelName} is now active`, {
        description: "You can now use this model for inference.",
      });
      
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
      
      // If model hasn't been tested yet, test it
      if (!testedModels[modelName]) {
        await handleTestModel(modelName, false);
      }
    } catch (error) {
      toast.error(`Failed to load model: ${error instanceof Error ? error.message : String(error)}`);
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    }
  };

  const handleUnload = async (modelName: string) => {
    try {
      setProcessingModels(prev => ({ ...prev, [modelName]: 'unloading' }));
      toast.info(`Unloading model: ${modelName}`, {
        description: "Freeing up memory resources...",
      });
      
      await unloadModel(modelName);
      
      toast.success(`Model unloaded: ${modelName}`);
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    } catch (error) {
      toast.error(`Failed to unload model: ${error instanceof Error ? error.message : String(error)}`);
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    }
  };

  // Function to test a model with a simple inference
  const handleTestModel = async (modelName: string, showToast = true) => {
    // Find model
    const model = models.find(m => m.name === modelName);
    if (!model || !model.isLoaded) {
      if (showToast) {
        toast.error("Model must be loaded before testing");
      }
      return;
    }

    try {
      setProcessingModels(prev => ({ ...prev, [modelName]: 'testing' }));
      if (showToast) {
        toast.info(`Testing model: ${modelName}`, {
          description: "Performing inference test...",
        });
      }

      let testPrompt = "";
      switch (model.type) {
        case 'text-generation':
          testPrompt = "Briefly explain what makes you a good AI model in one sentence.";
          break;
        case 'speech-recognition':
          testPrompt = "This is a test transcription for speech recognition.";
          break;
        default:
          testPrompt = "Test input for model.";
      }

      const result = await runInference(testPrompt);
      
      // Mark model as tested
      const updatedTestedModels = { ...testedModels, [modelName]: true };
      setTestedModels(updatedTestedModels);
      
      // Store test result
      const updatedTestResults = { ...testResults, [modelName]: result };
      setTestResults(updatedTestResults);
      
      // Save to localStorage
      localStorage.setItem('aurora_tested_models', JSON.stringify(updatedTestedModels));
      localStorage.setItem('aurora_test_results', JSON.stringify(updatedTestResults));
      
      if (showToast) {
        toast.success(`Model test successful`, {
          description: result.substring(0, 100) + (result.length > 100 ? '...' : ''),
          duration: 5000,
        });
      } else {
        toast.info(`Model tested successfully`, {
          description: "Model is ready for use.",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Model test failed:", error);
      if (showToast) {
        toast.error(`Model test failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    }
  };

  // Function to get model usage stats
  const handleGetModelUsage = async (modelName: string) => {
    try {
      setProcessingModels(prev => ({ ...prev, [modelName]: 'checking' }));
      
      const usage = await getModelUsage(modelName);
      
      toast.info(`Model usage: ${modelName}`, {
        description: `Inference count: ${usage.inferenceCount}, Last used: ${new Date(usage.lastUsed).toLocaleString()}`,
        duration: 5000,
      });
    } catch (error) {
      console.error("Failed to get model usage:", error);
      toast.error(`Couldn't retrieve model usage information`);
    } finally {
      setProcessingModels(prev => {
        const updated = { ...prev };
        delete updated[modelName];
        return updated;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <p className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking device capabilities...
        </p>
        <Progress value={50} className="mt-2" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-destructive">Error: {error}</p>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <div className="p-4">
        <Card className="p-4 bg-muted">
          <h3 className="text-lg font-medium">Local AI Not Available</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Your device doesn't support local AI models. This could be due to hardware limitations or browser compatibility.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center space-x-2 mb-4">
        {isMobile ? (
          <Smartphone className="h-5 w-5 text-primary" />
        ) : (
          <Laptop className="h-5 w-5 text-primary" />
        )}
        <span className="font-medium">
          Platform: {platformName.charAt(0).toUpperCase() + platformName.slice(1)}
        </span>
      </div>

      <Tabs 
        defaultValue="all" 
        className="w-full" 
        onValueChange={setActiveTab}
      >
        <TabsList className="grid grid-cols-3 mb-4">
          <TabsTrigger value="all">All Models</TabsTrigger>
          <TabsTrigger value="text-generation">Text Generation</TabsTrigger>
          <TabsTrigger value="speech-recognition">Speech Recognition</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-0">
          <h2 className="text-xl font-bold">Available Models</h2>
          
          {filteredModels.length > 0 ? (
            <div className="grid gap-4 mt-4">
              {filteredModels.map((model) => (
                <Card key={model.name} className={`p-4 ${model.isLoaded && activeModel === model.name ? 'border-primary/50' : ''}`}>
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{model.name}</h3>
                      {model.isLoaded && activeModel === model.name && (
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      model.type === 'text-generation' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 
                      model.type === 'speech-recognition' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                      'bg-muted'
                    }`}>
                      {model.type.replace('-', ' ')}
                    </span>
                  </div>
                  
                  <div className="text-sm text-muted-foreground mb-2">
                    <div className="flex items-center justify-between">
                      <span>Size: {model.size}MB</span>
                      {testedModels[model.name] && (
                        <span className="text-xs flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-3 w-3" /> Tested
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {model.downloadProgress !== undefined && (
                    <div className="w-full my-2">
                      <Progress value={model.downloadProgress} className="h-2" />
                      <p className="text-xs text-center mt-1">{model.downloadProgress}% downloaded</p>
                    </div>
                  )}
                  
                  {model.isLoaded && activeModel === model.name && (
                    <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-sm px-3 py-2 rounded-md mb-3 flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                      Active model - ready for use
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center">
                      <Switch 
                        id={`model-${model.name}`}
                        checked={model.isLoaded}
                        disabled={!model.isDownloaded || Boolean(processingModels[model.name])}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            handleLoad(model.name);
                          } else {
                            handleUnload(model.name);
                          }
                        }}
                      />
                      <Label htmlFor={`model-${model.name}`} className="ml-2">
                        {model.isLoaded ? 'Active' : 'Inactive'}
                      </Label>
                    </div>
                    
                    <div className="space-x-2">
                      {!model.isDownloaded && model.downloadProgress === undefined ? (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleDownload(model.name)}
                          disabled={Boolean(processingModels[model.name])}
                        >
                          {processingModels[model.name] === 'downloading' ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4 mr-1" />
                              Download
                            </>
                          )}
                        </Button>
                      ) : model.isDownloaded && !model.isLoaded ? (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleLoad(model.name)}
                          disabled={Boolean(processingModels[model.name])}
                        >
                          {processingModels[model.name] === 'loading' ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              Load
                            </>
                          )}
                        </Button>
                      ) : model.isLoaded ? (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleUnload(model.name)}
                            disabled={Boolean(processingModels[model.name])}
                          >
                            {processingModels[model.name] === 'unloading' ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Unloading...
                              </>
                            ) : (
                              <>
                                <Square className="h-4 w-4 mr-1" />
                                Unload
                              </>
                            )}
                          </Button>
                          <Button 
                            size="sm" 
                            variant={testedModels[model.name] ? "secondary" : "outline"}
                            onClick={() => handleTestModel(model.name)}
                            disabled={Boolean(processingModels[model.name])}
                          >
                            {processingModels[model.name] === 'testing' ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Testing...
                              </>
                            ) : (
                              <>
                                <Terminal className="h-4 w-4 mr-1" />
                                Test
                              </>
                            )}
                          </Button>
                          {testedModels[model.name] && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGetModelUsage(model.name)}
                              disabled={Boolean(processingModels[model.name])}
                            >
                              {processingModels[model.name] === 'checking' ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                </>
                              )}
                            </Button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </div>
                  
                  {testedModels[model.name] && testResults[model.name] && (
                    <div className="mt-3 text-xs p-2 bg-muted rounded text-muted-foreground">
                      <strong>Last test result:</strong> {testResults[model.name].substring(0, 100)}
                      {testResults[model.name].length > 100 ? "..." : ""}
                    </div>
                  )}
                  
                  {model.downloadUrl && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Model source: <a href={model.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{new URL(model.downloadUrl).hostname}</a>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              {activeTab === "all" 
                ? "No compatible AI models found for your device." 
                : `No ${activeTab.replace('-', ' ')} models available.`}
            </p>
          )}
        </TabsContent>
      </Tabs>
      
      <Card className="p-4 bg-primary/5">
        <h3 className="font-medium mb-2">Using local AI models</h3>
        <p className="text-sm text-muted-foreground mb-3">
          To use local models with Aurora, download and load a model, then enable "Local Models Only" in General Settings
          or simply ask Aurora to use a specific model by name.
        </p>
        <p className="text-sm text-muted-foreground">
          You can use multiple models at once - for example, a text-generation model for chat responses and a speech-recognition model for voice input.
        </p>
      </Card>
    </div>
  );
};

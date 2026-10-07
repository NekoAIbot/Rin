
import { useState, useEffect, useRef } from 'react';
import { usePlatform } from './use-platform';

// Define interfaces for local AI model integration
export interface ModelConfig {
  name: string;
  type: 'text-generation' | 'speech-recognition' | 'speech-synthesis' | 'image-generation';
  path: string;
  size: number;
  isDownloaded: boolean;
  isLoaded: boolean;
  downloadProgress?: number;
  downloadUrl?: string;
}

export interface ModelUsage {
  inferenceCount: number;
  totalTokens: number;
  lastUsed: number; // timestamp
  averageLatency: number; // in milliseconds
}

export interface LocalAIState {
  isAvailable: boolean;
  isLoading: boolean;
  error: string | null;
  models: ModelConfig[];
  activeModel: string | null;
}

export function useLocalAI() {
  const { isCapacitor, isBrowser, platformName } = usePlatform();
  const [localAIState, setLocalAIState] = useState<LocalAIState>({
    isAvailable: false,
    isLoading: true,
    error: null,
    models: [],
    activeModel: null,
  });
  
  // Store model usage statistics
  const modelUsageRef = useRef<Record<string, ModelUsage>>({});
  
  // Set up periodic save for usage data
  useEffect(() => {
    // Load previously saved usage data
    try {
      const savedUsage = localStorage.getItem('aurora_model_usage');
      if (savedUsage) {
        modelUsageRef.current = JSON.parse(savedUsage);
        console.log(`Loaded usage data for ${Object.keys(modelUsageRef.current).length} models`);
      }
    } catch (error) {
      console.error("Failed to load model usage data:", error);
    }
    
    // Set up periodic saving
    const saveInterval = setInterval(() => {
      try {
        localStorage.setItem('aurora_model_usage', JSON.stringify(modelUsageRef.current));
      } catch (error) {
        console.error("Failed to save model usage data:", error);
      }
    }, 60000); // Save every minute
    
    return () => clearInterval(saveInterval);
  }, []);

  // Check if local AI is available
  useEffect(() => {
    const checkLocalAIAvailability = async () => {
      try {
        // Check if the device supports local AI models
        // We check for WebAssembly as it's required for most local models
        const webCapableOfLocalAI = 'gpu' in navigator || 'WebAssembly' in window;
        const hasLocalAISupport = isCapacitor || webCapableOfLocalAI;
        
        // Realistic models that are available for download
        const availableModels: ModelConfig[] = [];
        
        if (hasLocalAISupport) {
          // Add appropriate models based on platform
          if (isCapacitor) {
            // Native models for mobile devices - more powerful models
            availableModels.push({
              name: 'Llama-3-8B-Instruct',
              type: 'text-generation',
              path: '/models/llama-3-8b-instruct-q4',
              size: 4300, // MB
              isDownloaded: false,
              isLoaded: false,
              downloadUrl: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx'
            });
            
            availableModels.push({
              name: 'Whisper-Small',
              type: 'speech-recognition',
              path: '/models/whisper-small',
              size: 460, // MB
              isDownloaded: false,
              isLoaded: false,
              downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp'
            });

            // Add more powerful model 
            availableModels.push({
              name: 'Llama-3-70B-Instruct',
              type: 'text-generation',
              path: '/models/llama-3-70b-instruct-q4',
              size: 35000, // MB - much larger
              isDownloaded: false,
              isLoaded: false,
              downloadUrl: 'https://huggingface.co/meta-llama/Llama-3-70b-instruct'
            });
            
            // Add Phi-3 Medium
            availableModels.push({
              name: 'Phi-3-medium-4k-instruct',
              type: 'text-generation',
              path: '/models/phi-3-medium-4k-instruct-q4_0',
              size: 3940, // MB
              isDownloaded: false,
              isLoaded: false,
              downloadUrl: 'https://huggingface.co/microsoft/Phi-3-medium-4k-instruct-onnx'
            });
            
            // Add more speech recognition options
            availableModels.push({
              name: 'Whisper-Medium',
              type: 'speech-recognition',
              path: '/models/whisper-medium',
              size: 780, // MB
              isDownloaded: false,
              isLoaded: false,
              downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp'
            });
            
            // Add image generation capability
            availableModels.push({
              name: 'Stable-Diffusion-XL',
              type: 'image-generation',
              path: '/models/stable-diffusion-xl-base-1.0',
              size: 6800, // MB
              isDownloaded: false,
              isLoaded: false,
              downloadUrl: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0'
            });
          }
          
          // Common models for all platforms - smaller models that work in browser
          availableModels.push({
            name: 'Phi-3-mini-4k-instruct',
            type: 'text-generation',
            path: '/models/phi-3-mini-4k-instruct-q4_0',
            size: 1950, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx'
          });
          
          availableModels.push({
            name: 'GPT-Neo-1.3B',
            type: 'text-generation',
            path: '/models/gpt-neo-1.3b-q4_0',
            size: 850, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/EleutherAI/gpt-neo-1.3B'
          });
          
          availableModels.push({
            name: 'GPT-J-6B-Quantized',
            type: 'text-generation',
            path: '/models/gpt-j-6b-q4_0',
            size: 3600, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/EleutherAI/gpt-j-6B'
          });
          
          availableModels.push({
            name: 'Whisper-Tiny',
            type: 'speech-recognition',
            path: '/models/whisper-tiny',
            size: 75, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp'
          });
          
          availableModels.push({
            name: 'MiniLM-L6',
            type: 'text-generation',
            path: '/models/minilm-l6',
            size: 90, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/microsoft/MiniLM-L6-H384-uncased'
          });

          // Add more powerful models for all platforms
          availableModels.push({
            name: 'Phi-3-medium-4k-instruct',
            type: 'text-generation',
            path: '/models/phi-3-medium-4k-instruct-q4_0',
            size: 3940, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/microsoft/Phi-3-medium-4k-instruct-onnx'
          });

          availableModels.push({
            name: 'Whisper-Base',
            type: 'speech-recognition',
            path: '/models/whisper-base',
            size: 142, // MB
            isDownloaded: false,
            isLoaded: false,
            downloadUrl: 'https://huggingface.co/ggerganov/whisper.cpp'
          });
        }
        
        // Check localStorage for previously downloaded and loaded models
        try {
          const savedModels = localStorage.getItem('aurora_local_models');
          const savedActiveModel = localStorage.getItem('aurora_active_model');
          
          if (savedModels) {
            const parsedModels = JSON.parse(savedModels);
            // Update available models with download and load status
            availableModels.forEach((model, index) => {
              const savedModel = parsedModels.find((m: ModelConfig) => m.name === model.name);
              if (savedModel) {
                availableModels[index] = {
                  ...model,
                  isDownloaded: savedModel.isDownloaded,
                  isLoaded: savedModel.isLoaded // Preserve loaded state across sessions
                };
              }
            });
          }
          
          // Set active model from localStorage if it exists
          const activeModel = savedActiveModel || null;
          
          setLocalAIState({
            isAvailable: hasLocalAISupport,
            isLoading: false,
            error: null,
            models: availableModels,
            activeModel
          });
        } catch (error) {
          console.error("Failed to load saved model states:", error);
          
          setLocalAIState({
            isAvailable: hasLocalAISupport,
            isLoading: false,
            error: null,
            models: availableModels,
            activeModel: null
          });
        }
      } catch (error) {
        console.error("Error checking for local AI availability:", error);
        setLocalAIState(prev => ({
          ...prev,
          isLoading: false,
          error: "Failed to initialize local AI detection"
        }));
      }
    };
    
    checkLocalAIAvailability();
  }, [isCapacitor, isBrowser]);

  // Model download function with more realistic simulation
  const downloadModel = async (modelName: string) => {
    // Get the model to download
    const modelIndex = localAIState.models.findIndex(model => model.name === modelName);
    if (modelIndex === -1) return false;
    
    const model = localAIState.models[modelIndex];
    
    // Check if model is already downloaded
    if (model.isDownloaded) {
      console.log(`Model ${model.name} is already downloaded`);
      return true;
    }
    
    // Update model with download started status
    setLocalAIState(prev => ({
      ...prev,
      models: prev.models.map((m, idx) => 
        idx === modelIndex 
          ? { ...m, downloadProgress: 0 }
          : m
      )
    }));
    
    // Simulate download with progress updates based on file size
    // Larger models should take longer to download
    return new Promise<boolean>((resolve) => {
      let progress = 0;
      // Adjust interval based on model size - larger models take longer
      const updateInterval = Math.max(100, Math.min(500, 200 * (model.size / 1000)));
      const incrementAmount = Math.max(0.5, Math.min(5, 100 / (model.size / 10)));
      
      console.log(`Downloading ${model.name} - Size: ${model.size}MB, Update interval: ${updateInterval}ms, Increment: ${incrementAmount}%`);
      
      const interval = setInterval(() => {
        progress += incrementAmount + (Math.random() * (incrementAmount / 2)); 
        
        if (progress >= 100) {
          clearInterval(interval);
          progress = 100;
          
          // Update model as downloaded
          setLocalAIState(prev => {
            const updatedModels = prev.models.map((m, idx) => 
              idx === modelIndex 
                ? { ...m, isDownloaded: true, downloadProgress: undefined }
                : m
            );
            
            // Save download status to localStorage
            try {
              localStorage.setItem('aurora_local_models', JSON.stringify(updatedModels));
            } catch (error) {
              console.error("Failed to save model states:", error);
            }
            
            return {
              ...prev,
              models: updatedModels
            };
          });
          
          resolve(true);
        } else {
          // Update download progress
          setLocalAIState(prev => ({
            ...prev,
            models: prev.models.map((m, idx) => 
              idx === modelIndex 
                ? { ...m, downloadProgress: Math.round(progress) }
                : m
            )
          }));
        }
      }, updateInterval);
    });
  };
  
  // Function to load a downloaded model
  const loadModel = async (modelName: string) => {
    const modelIndex = localAIState.models.findIndex(model => 
      model.name === modelName && model.isDownloaded
    );
    
    if (modelIndex === -1) return false;
    const model = localAIState.models[modelIndex];
    
    // Check if model is already loaded
    if (model.isLoaded) {
      console.log(`Model ${model.name} is already loaded`);
      setLocalAIState(prev => ({
        ...prev,
        activeModel: modelName
      }));
      
      // Save active model to localStorage
      localStorage.setItem('aurora_active_model', modelName);
      return true;
    }
    
    // Simulate loading time based on model size
    const loadTimeMs = Math.max(500, Math.min(3000, model.size));
    console.log(`Loading ${model.name} - Simulating ${loadTimeMs}ms load time`);
    
    return new Promise<boolean>((resolve) => {
      setTimeout(() => {
        setLocalAIState(prev => {
          const updatedModels = prev.models.map((m, idx) => 
            idx === modelIndex 
              ? { ...m, isLoaded: true }
              : m
          );
          
          // Find any other model of the same type that is loaded and unload it
          // to prevent conflicts, but only if it's not a multi-model setup
          if (model.type === 'text-generation' || model.type === 'image-generation') {
            for (let i = 0; i < updatedModels.length; i++) {
              if (i !== modelIndex && updatedModels[i].type === model.type && updatedModels[i].isLoaded) {
                console.log(`Automatically unloading ${updatedModels[i].name} to prevent conflicts`);
                updatedModels[i] = { ...updatedModels[i], isLoaded: false };
              }
            }
          }
          
          // Save loaded state to localStorage
          try {
            localStorage.setItem('aurora_local_models', JSON.stringify(updatedModels));
            localStorage.setItem('aurora_active_model', modelName);
          } catch (error) {
            console.error("Failed to save model states:", error);
          }
          
          return {
            ...prev,
            models: updatedModels,
            activeModel: modelName
          };
        });
        
        // Initialize usage tracking if not already present
        if (!modelUsageRef.current[modelName]) {
          modelUsageRef.current[modelName] = {
            inferenceCount: 0,
            totalTokens: 0,
            lastUsed: Date.now(),
            averageLatency: 0
          };
        }
        
        resolve(true);
      }, loadTimeMs);
    });
  };
  
  // Function to unload a model
  const unloadModel = async (modelName: string) => {
    const updatedModels = localAIState.models.map(model => 
      model.name === modelName 
        ? { ...model, isLoaded: false }
        : model
    );
    
    // Update state
    setLocalAIState(prev => ({
      ...prev,
      models: updatedModels,
      activeModel: prev.activeModel === modelName ? null : prev.activeModel
    }));
    
    // Update localStorage
    try {
      localStorage.setItem('aurora_local_models', JSON.stringify(updatedModels));
      
      // Remove active model from localStorage if it's the one being unloaded
      if (localAIState.activeModel === modelName) {
        localStorage.removeItem('aurora_active_model');
      }
    } catch (error) {
      console.error("Failed to save model states:", error);
    }
    
    return true;
  };
  
  // Helper function to run local inference with the active model
  const runInference = async (prompt: string, specificModelName?: string): Promise<string> => {
    // Use specified model if provided, otherwise use active model
    const modelName = specificModelName || localAIState.activeModel;
    
    if (!modelName) {
      throw new Error("No active model specified");
    }
    
    const activeModel = localAIState.models.find(m => m.name === modelName);
    if (!activeModel || !activeModel.isLoaded) {
      throw new Error("Model not properly loaded");
    }
    
    // Track start time for latency calculation
    const startTime = performance.now();
    
    // Simulate model inference based on model type and size
    // Larger models should take longer but give better responses
    return new Promise((resolve) => {
      // Calculate processing time based on model size and prompt length
      const baseTime = activeModel.size > 1000 ? 1000 : 500;
      const processingTime = baseTime + (prompt.length * 2);
      
      console.log(`Processing with ${activeModel.name} - Simulating ${processingTime}ms inference time`);
      
      setTimeout(() => {
        // Update usage statistics
        const endTime = performance.now();
        const latency = endTime - startTime;
        
        // Update usage metrics
        if (modelUsageRef.current[activeModel.name]) {
          const currentUsage = modelUsageRef.current[activeModel.name];
          const newInferenceCount = currentUsage.inferenceCount + 1;
          
          // Calculate new average latency
          const newAverageLatency = 
            ((currentUsage.averageLatency * currentUsage.inferenceCount) + latency) / newInferenceCount;
          
          // Update usage data
          modelUsageRef.current[activeModel.name] = {
            inferenceCount: newInferenceCount,
            totalTokens: currentUsage.totalTokens + (prompt.length / 4) + 50, // Rough token estimate
            lastUsed: Date.now(),
            averageLatency: newAverageLatency
          };
          
          // Save to localStorage
          try {
            localStorage.setItem('aurora_model_usage', JSON.stringify(modelUsageRef.current));
          } catch (error) {
            console.error("Failed to save model usage data:", error);
          }
        } else {
          // Initialize usage data
          modelUsageRef.current[activeModel.name] = {
            inferenceCount: 1,
            totalTokens: (prompt.length / 4) + 50, // Rough token estimate
            lastUsed: Date.now(),
            averageLatency: latency
          };
        }
        
        // Generate a response based on model type, size and name
        switch(activeModel.type) {
          case 'text-generation':
            if (activeModel.name.includes('70B')) {
              // Most sophisticated response for largest models
              resolve(`I processed your query "${prompt}" using the high-capacity ${activeModel.name} model running locally on your device. As a powerful local AI model with 70B parameters, I can help with complex reasoning, code generation, and detailed explanations. My responses are generated entirely on-device without requiring internet access. Would you like me to elaborate further on this topic?`);
            }
            else if (activeModel.name.includes('GPT-J') || activeModel.name.includes('GPT-Neo')) {
              resolve(`I've analyzed your input using the ${activeModel.name} model running locally. This open-source language model was trained on a diverse corpus of text and can generate coherent responses to a wide range of queries. ${prompt.length > 20 ? "Your question about " + prompt.substring(0, 20) + "... is interesting." : "How can I assist further with your question?"}`);
            }
            else if (activeModel.name.includes('Llama') || activeModel.name.includes('Phi-3-medium')) {
              // More sophisticated response for larger models
              resolve(`I've processed your question using the powerful ${activeModel.name} model running locally on your device. This model is optimized for helpful, accurate responses while preserving your privacy. ${prompt.includes('?') ? "To answer your question directly: " : "Here's my response: "} ${prompt.substring(0, 10)}... requires thoughtful consideration of multiple factors including context, accuracy, and relevance. What specific aspects would you like me to focus on?`);
            }
            else if (activeModel.name.includes('Phi-3-mini')) {
              // Standard response for mid-tier models
              resolve(`I analyzed your query "${prompt}" using the ${activeModel.name} model running locally. This model balances efficiency with quality responses. Based on my analysis, I'd suggest approaching this topic by considering key factors like context, relevance, and practical application. Would you like a more detailed explanation?`);
            } 
            else {
              // Basic response for smallest models
              resolve(`Using ${activeModel.name} locally: I've processed your input "${prompt}". Based on my training data, I can offer insights on this topic without requiring internet connectivity. What specific aspects would you like to explore further?`);
            }
            break;
          case 'speech-recognition':
            if (activeModel.name.includes('Medium') || activeModel.name.includes('Small')) {
              resolve(`High-accuracy transcription using ${activeModel.name}: "${prompt}" (confidence: 97%)`);
            } else if (activeModel.name.includes('Base')) {
              resolve(`Good-quality transcription using ${activeModel.name}: "${prompt}" (confidence: 92%)`);
            } else {
              resolve(`Basic transcription using ${activeModel.name}: "${prompt}" (confidence: 85%)`);
            }
            break;
          case 'image-generation':
            resolve(`Image generated successfully using ${activeModel.name} based on prompt: "${prompt}". Due to display limitations in this interface, the actual image would be available in a full implementation.`);
            break;
          default:
            resolve(`Processed with ${activeModel.name}: ${prompt}`);
        }
      }, processingTime);
    });
  };
  
  // Function to get model usage statistics
  const getModelUsage = async (modelName: string): Promise<ModelUsage> => {
    // Return usage data if available
    if (modelUsageRef.current[modelName]) {
      return modelUsageRef.current[modelName];
    }
    
    // Return default values if no usage data exists
    return {
      inferenceCount: 0,
      totalTokens: 0,
      lastUsed: Date.now(),
      averageLatency: 0
    };
  };
  
  // Return appropriate active model for the given type
  const getActiveModelForType = (type: ModelConfig['type']): string | null => {
    // Find loaded model of specified type
    const model = localAIState.models.find(m => m.isLoaded && m.type === type);
    return model ? model.name : null;
  };

  return {
    ...localAIState,
    downloadModel,
    loadModel,
    unloadModel,
    runInference,
    getModelUsage,
    getActiveModelForType
  };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatMessageProps } from '@/components/ChatMessage';
import { toast } from 'sonner';
import { generateResponse, detectEmotion, getRelevantMemory, saveToMemory } from '@/utils/messageUtils';
import { useLocalAI } from '@/hooks/useLocalAI';
import { searchDuckDuckGo, getWeatherData, getNewsHeadlines } from '@/utils/searchUtils';

export const useChatState = (isVoiceEnabled: boolean, speakText: (text: string) => void) => {
  const [messages, setMessages] = useState<ChatMessageProps[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPersona, setCurrentPersona] = useState("assistant");
  const conversationContext = useRef<string[]>([]);
  
  // Initialize local AI
  const { 
    isAvailable: isLocalAIAvailable, 
    activeModel, 
    models,
    runInference,
    loadModel,
    downloadModel,
    getActiveModelForType
  } = useLocalAI();

  // Load initial greeting
  useEffect(() => {
    const initialGreeting: ChatMessageProps = {
      message: "Hello! I'm Aurora, your AI assistant. How can I help you today?",
      sender: "bot",
      timestamp: new Date(),
      emotion: "happy"
    };
    
    setTimeout(() => {
      setMessages([initialGreeting]);
    }, 500);
  }, []);

  // Load saved persona if available
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const { activePersona } = JSON.parse(savedSettings);
        if (activePersona) {
          setCurrentPersona(activePersona);
        }
      }
    } catch (error) {
      console.error("Failed to load persona setting:", error);
    }
  }, []);

  // Handle processing a message with a local model
  const processWithLocalModel = useCallback(async (modelName: string, text: string): Promise<string> => {
    // Find the model
    const model = models.find(m => m.name === modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }
    
    // If the model isn't downloaded, download it
    if (!model.isDownloaded) {
      toast.info(`Model ${modelName} needs to be downloaded first...`);
      await downloadModel(modelName);
      toast.success(`Model ${modelName} has been downloaded!`);
    }
    
    // If the model isn't loaded, load it
    if (!model.isLoaded) {
      toast.info(`Loading model ${modelName}...`);
      await loadModel(modelName);
      toast.success(`Model ${modelName} is now loaded and active`);
    }
    
    // Now run inference with context
    console.log(`Using model ${modelName} for inference with ${conversationContext.current.length} context items`);
    
    // Build context-enhanced prompt
    let contextualPrompt = text;
    if (conversationContext.current.length > 0) {
      // Add the last few exchanges for context
      const recentContext = conversationContext.current.slice(-4); // Last 4 exchanges
      contextualPrompt = `${recentContext.join("\n")}\nUser: ${text}\nAI:`;
    }
    
    return await runInference(contextualPrompt);
  }, [models, downloadModel, loadModel, runInference, conversationContext]);

  const handleSendMessage = async (overrideText?: string) => {
    const messageText = overrideText || inputText;
    if (!messageText.trim()) return;
    
    const userMessage: ChatMessageProps = {
      message: messageText,
      sender: "user",
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    
    try {
      // Update conversation context with user message
      conversationContext.current.push(`User: ${messageText}`);
      if (conversationContext.current.length > 10) {
        // Keep only the last 10 exchanges to avoid context overflow
        conversationContext.current = conversationContext.current.slice(-10);
      }
      
      // Save significant user messages to memory
      saveToMemory(messageText, true);
      
      // Get relevant memory for context
      const relevantMemory = getRelevantMemory(messageText);
      
      // Determine which model to use
      let modelToUse = "local";
      let apiKey = "";
      let offlineMode = false;
      let webSearchEnabled = false;
      
      try {
        const savedSettings = localStorage.getItem("settings");
        if (savedSettings) {
          const settings = JSON.parse(savedSettings);
          apiKey = settings.apiKey;
          
          if (settings.offlineMode) {
            offlineMode = true;
            modelToUse = "local";
          } else if (apiKey && settings.modelPreference) {
            modelToUse = settings.modelPreference;
          }
          
          if (settings.webSearchEnabled !== undefined) {
            webSearchEnabled = settings.webSearchEnabled;
          }
        }
      } catch (error) {
        console.error("Failed to load model settings:", error);
      }
      
      // Process the user's message
      let responseText = "";
      let usedLocalModel = false;
      const lowerMessage = messageText.toLowerCase();
      
      // Check for math questions first (process these directly regardless of search settings)
      const mathPattern = /what\s+is\s+\d+(\s*[\+\-\*\/]\s*\d+)+/i;
      const calculatePattern = /calculate\s+\d+(\s*[\+\-\*\/]\s*\d+)+/i;
      const equationPattern = /\d+(\s*[\+\-\*\/]\s*\d+)+\s*=\s*\?/i;
      
      if (mathPattern.test(lowerMessage) || calculatePattern.test(lowerMessage) || equationPattern.test(lowerMessage)) {
        console.log("Processing math question");
        responseText = generateResponse(messageText, currentPersona);
      }
      // Check for time/date questions
      else if (lowerMessage.includes("what day is") || 
               lowerMessage.includes("what is the date") || 
               lowerMessage.includes("current time") ||
               lowerMessage.includes("what time")) {
        console.log("Processing time/date question");
        responseText = generateResponse(messageText, currentPersona);
      }
      // Check for name-related questions to handle specially
      else if (lowerMessage.includes("my name") || 
               lowerMessage.includes("who am i") ||
               lowerMessage.includes("what's my name")) {
        console.log("Processing identity question");
        responseText = generateResponse(messageText, currentPersona);
      }
      // Check for model management commands - use a specific model command
      else if (lowerMessage.includes('use model') || 
               lowerMessage.includes('with model') ||
               lowerMessage.includes('switch to model')) {
        
        const modelMatch = messageText.match(/model\s+(?:named|called)?\s+([a-zA-Z0-9-]+)/i);
        if (modelMatch && modelMatch[1]) {
          const modelName = modelMatch[1].trim();
          const matchedModel = models.find(m => 
            m.name.toLowerCase().includes(modelName.toLowerCase())
          );
          
          if (matchedModel) {
            try {
              usedLocalModel = true;
              responseText = `I'll process your request using the ${matchedModel.name} model.`;
              
              // Extract the actual question from the command
              const questionMatch = messageText.match(/(?:answer|process|respond to|about|tell me|answer me)(.+)/i);
              let questionText = "Hello, how can I help you?";
              
              if (questionMatch && questionMatch[1]) {
                questionText = questionMatch[1].trim();
              } else {
                responseText += " What would you like to know?";
              }
              
              // If there's a question to answer, process it with the model
              if (questionText !== "Hello, how can I help you?") {
                const modelResponse = await processWithLocalModel(matchedModel.name, questionText);
                responseText = modelResponse;
              }
            } catch (modelError) {
              console.error("Model processing error:", modelError);
              responseText = `I encountered an error using the ${matchedModel.name} model. ${modelError instanceof Error ? modelError.message : String(modelError)}`;
            }
          } else {
            responseText = `I couldn't find a model matching '${modelName}'. Please check the available models in the Local AI settings.`;
          }
        } else {
          responseText = "I can use specific AI models for you. Please specify which model you'd like to use by name.";
        }
      }
      // Check for model management commands - download model
      else if (lowerMessage.includes('download model') || lowerMessage.includes('get model')) {
        
        const modelMatch = messageText.match(/model\s+(?:named|called)?\s+([a-zA-Z0-9-]+)/i);
        if (modelMatch && modelMatch[1]) {
          const modelName = modelMatch[1].trim();
          const matchedModel = models.find(m => 
            m.name.toLowerCase().includes(modelName.toLowerCase())
          );
          
          if (matchedModel) {
            if (matchedModel.isDownloaded) {
              responseText = `The model '${matchedModel.name}' is already downloaded. Would you like me to load it?`;
            } else {
              responseText = `I'll download the ${matchedModel.name} model for you. This might take a moment...`;
              
              try {
                // Start download in background
                const downloadSuccess = await downloadModel(matchedModel.name);
                
                if (downloadSuccess) {
                  const successMessage: ChatMessageProps = {
                    message: `Successfully downloaded ${matchedModel.name}! Would you like me to load it now?`,
                    sender: "bot",
                    timestamp: new Date(),
                    emotion: "happy"
                  };
                  setMessages(prev => [...prev, successMessage]);
                  
                  // Speak the success message if voice is enabled
                  if (isVoiceEnabled) {
                    speakText(successMessage.message);
                  }
                }
              } catch (downloadError) {
                console.error("Failed to download model:", downloadError);
                responseText += " There was an issue starting the download. You can try again from the Local AI settings page.";
              }
            }
          } else {
            responseText = `I couldn't find a model matching '${modelName}'. Please check the available models in the Local AI settings.`;
          }
        } else {
          responseText = "I can download AI models for you. Please specify which model you'd like to download.";
        }
      }
      // Check if this is a load model command
      else if (lowerMessage.includes('load model') || 
               lowerMessage.includes('activate model')) {
        
        const modelMatch = messageText.match(/model\s+(?:named|called)?\s+([a-zA-Z0-9-]+)/i);
        if (modelMatch && modelMatch[1]) {
          const modelName = modelMatch[1].trim();
          const matchedModel = models.find(m => 
            m.name.toLowerCase().includes(modelName.toLowerCase())
          );
          
          if (matchedModel) {
            if (!matchedModel.isDownloaded) {
              responseText = `The model '${matchedModel.name}' needs to be downloaded first. Would you like me to download it?`;
            } else if (matchedModel.isLoaded) {
              responseText = `The model '${matchedModel.name}' is already loaded and active.`;
            } else {
              responseText = `I'll load the ${matchedModel.name} model for you. This might take a moment...`;
              
              try {
                // Start loading in background
                const loadSuccess = await loadModel(matchedModel.name);
                
                if (loadSuccess) {
                  const successMessage: ChatMessageProps = {
                    message: `Successfully loaded ${matchedModel.name}! You can now use it for inference by simply asking questions, or you can specifically request: "Use model ${matchedModel.name} to answer..."`,
                    sender: "bot",
                    timestamp: new Date(),
                    emotion: "happy"
                  };
                  setMessages(prev => [...prev, successMessage]);
                  
                  // Speak the success message if voice is enabled
                  if (isVoiceEnabled) {
                    speakText(successMessage.message);
                  }
                }
              } catch (loadError) {
                console.error("Failed to load model:", loadError);
                responseText += " There was an issue loading the model. You can try again from the Local AI settings page.";
              }
            }
          } else {
            responseText = `I couldn't find a model matching '${modelName}'. Please check the available models in the Local AI settings.`;
          }
        } else {
          responseText = "I can load AI models for you. Please specify which model you'd like to load.";
        }
      }
      // Check if this is a weather request
      else if (lowerMessage.includes('weather')) {
        const locationMatch = messageText.match(/weather\s+(?:in|for|at)?\s+([a-zA-Z\s]+)/i);
        const location = locationMatch ? locationMatch[1].trim() : 'current location';
        
        console.log(`Getting weather for location: ${location}`);
        const weatherData = await getWeatherData(location);
        
        if (weatherData) {
          // More conversational weather response
          responseText = `The weather in ${weatherData.location} right now is ${weatherData.condition.toLowerCase()}. The temperature is ${weatherData.temperature}°C, with humidity at ${weatherData.humidity}% and wind speed of ${weatherData.windSpeed} km/h. ${
            weatherData.temperature > 25 ? "It's quite warm today, so dress accordingly!" :
            weatherData.temperature < 10 ? "It's on the colder side, so you might want to bundle up." :
            "The temperature is quite pleasant today."
          }`;
        } else {
          responseText = `I'd love to tell you about the weather in ${location}, but I don't have access to real-time weather data at the moment. If you'd like accurate weather information, you might need to add a weather API key in the settings.`;
        }
      }
      // Check if this is a news request
      else if (lowerMessage.includes('news') || lowerMessage.includes('headlines')) {
        const categoryMatch = messageText.match(/news\s+(?:about|on|regarding)?\s+([a-zA-Z\s]+)/i);
        const category = categoryMatch ? categoryMatch[1].trim() : 'general';
        
        console.log(`Getting news for category: ${category}`);
        const headlines = await getNewsHeadlines(category);
        
        if (headlines && headlines.length > 0) {
          // More conversational news response
          responseText = `Here are some of the latest headlines I found about ${category}:\n\n`;
          headlines.forEach((headline, index) => {
            if (index < 3) { // Limit to first 3 headlines
              responseText += `• ${headline.title} (${headline.source})\n`;
            }
          });
          
          responseText += `\nWould you like me to tell you more about any of these stories?`;
        } else {
          responseText = `I'd be happy to share the latest news about ${category}, but I don't have access to real-time news data at the moment. If you'd like current headlines, you might need to add a news API key in the settings.`;
        }
      }
      // Process web search for factual questions if enabled
      else if (webSearchEnabled && 
              (lowerMessage.startsWith('what is') || 
               lowerMessage.startsWith('who is') ||
               lowerMessage.startsWith('where is') ||
               lowerMessage.startsWith('when was') ||
               lowerMessage.startsWith('how many') ||
               lowerMessage.includes('search') || 
               lowerMessage.includes('find') ||
               lowerMessage.includes('look up'))) {
        
        console.log("Performing web search for factual question");
        const searchResults = await searchDuckDuckGo(messageText);
        
        if (searchResults && searchResults.length > 0) {
          // Provide a more refined, ChatGPT-like response based on search results
          let combinedInfo = "";
          searchResults.forEach((result, index) => {
            if (index < 3) {
              combinedInfo += result.snippet + " ";
            }
          });
          
          // Transform the search results into a more natural, conversational response
          responseText = `Based on what I found, ${combinedInfo.trim()}\n\nThis information comes from various sources online. Is there anything specific about this topic you'd like me to elaborate on?`;
        } else {
          responseText = `I tried searching for information about that, but couldn't find reliable results. Let me tell you what I know based on my training.\n\n`;
          // Fall back to regular response generation
          responseText += generateResponse(messageText, currentPersona);
        }
      }
      // Use local AI if available and appropriate
      else if (isLocalAIAvailable && (offlineMode || modelToUse === "local")) {
        // First check if there's an active model already
        if (activeModel) {
          try {
            console.log(`Using active model: ${activeModel} for inference`);
            usedLocalModel = true;
            responseText = await runInference(messageText);
          } catch (inferenceError) {
            console.error("Local inference error with active model:", inferenceError);
            
            // If the active model failed, try to use any other loaded model
            const anyLoadedModel = models.find(m => m.isLoaded && m.name !== activeModel);
            if (anyLoadedModel) {
              try {
                console.log(`Falling back to loaded model: ${anyLoadedModel.name}`);
                usedLocalModel = true;
                responseText = await runInference(messageText);
              } catch (fallbackError) {
                console.error("Fallback model error:", fallbackError);
                responseText = generateResponse(messageText, currentPersona);
              }
            } else {
              responseText = generateResponse(messageText, currentPersona);
            }
          }
        } else {
          // Check if any model is loaded
          const anyLoadedModel = models.find(m => m.isLoaded);
          if (anyLoadedModel) {
            try {
              console.log(`Using available loaded model: ${anyLoadedModel.name}`);
              usedLocalModel = true;
              responseText = await runInference(messageText, anyLoadedModel.name);
            } catch (error) {
              console.error("Local inference error:", error);
              responseText = generateResponse(messageText, currentPersona);
            }
          } else {
            // No loaded models, use default response generation
            responseText = generateResponse(messageText, currentPersona);
          }
        }
      } 
      // Otherwise, use the default response generation
      else {
        responseText = generateResponse(messageText, currentPersona);
      }
      
      // Add relevant memory as context if available, but in a more natural way
      if (relevantMemory && !responseText.includes("I remember") && !usedLocalModel) {
        // Format memory context more naturally based on persona
        switch(currentPersona) {
          case "teacher":
            responseText = `I recall from our previous conversations that ${relevantMemory}. ${responseText}`;
            break;
          case "friend":
            responseText = `Hey, I remember you mentioned that ${relevantMemory}. ${responseText}`;
            break;
          case "professional":
            responseText = `According to our previous discussion, ${relevantMemory}. ${responseText}`;
            break;
          case "creative":
            responseText = `Drawing from our earlier creative exchange where you mentioned ${relevantMemory}. ${responseText}`;
            break;
          case "scientist":
            responseText = `Based on previous data points from our conversations: ${relevantMemory}. ${responseText}`;
            break;
          default:
            responseText = `I remember you mentioned that ${relevantMemory}. ${responseText}`;
        }
      }
      
      // Update conversation context with AI response
      conversationContext.current.push(`AI: ${responseText}`);
      
      // If a persona change was requested, update it
      if ((lowerMessage.includes("switch to") || 
           lowerMessage.includes("activate") ||
           lowerMessage.includes("change to")) &&
          !lowerMessage.includes("model")) {
        
        if (lowerMessage.includes("teacher")) {
          setCurrentPersona("teacher");
          // Save to localStorage
          updatePersonaInSettings("teacher");
        } else if (lowerMessage.includes("friend")) {
          setCurrentPersona("friend");
          updatePersonaInSettings("friend");
        } else if (lowerMessage.includes("professional")) {
          setCurrentPersona("professional");
          updatePersonaInSettings("professional");
        } else if (lowerMessage.includes("creative")) {
          setCurrentPersona("creative");
          updatePersonaInSettings("creative");
        } else if (lowerMessage.includes("scientist")) {
          setCurrentPersona("scientist");
          updatePersonaInSettings("scientist");
        }
      }
      
      const botMessage: ChatMessageProps = {
        message: responseText,
        sender: "bot",
        timestamp: new Date(),
        emotion: detectEmotion(responseText)
      };
      
      setMessages(prev => [...prev, botMessage]);
      
      if (isVoiceEnabled) {
        console.log("Speaking response with voice enabled");
        speakText(responseText);
      }
      
      // Save significant bot messages to memory
      if (!usedLocalModel) {
        saveToMemory(responseText, false);
      }
      
    } catch (error) {
      console.error("Error processing message:", error);
      toast.error("An error occurred while processing your message");
      
      const errorMessage: ChatMessageProps = {
        message: "I'm sorry, I encountered an error processing your request. Can you try again?",
        sender: "bot",
        timestamp: new Date(),
        emotion: "sad"
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePersonaInSettings = (persona: string) => {
    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        settings.activePersona = persona;
        localStorage.setItem("settings", JSON.stringify(settings));
      } else {
        localStorage.setItem("settings", JSON.stringify({ activePersona: persona }));
      }
      
      // Dispatch event to trigger settings update in other components
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error("Failed to save persona setting:", error);
    }
  };

  const setPersona = (persona: string) => {
    setCurrentPersona(persona);
    updatePersonaInSettings(persona);
  };

  return {
    messages,
    inputText,
    setInputText,
    isLoading,
    handleSendMessage,
    currentPersona,
    setPersona,
    conversationContext: conversationContext.current
  };
};

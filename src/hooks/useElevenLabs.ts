
import { useState, useEffect, useRef } from 'react';

interface UseElevenLabsProps {
  apiKey?: string;
}

interface VoiceOptions {
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url?: string;
}

export const useElevenLabs = ({ apiKey }: UseElevenLabsProps = {}) => {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const voiceCacheRef = useRef<Record<string, ArrayBuffer>>({});
  
  // Store API key in ref for easy access
  const apiKeyRef = useRef<string | null>(null);

  // Create audio element for playback
  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  // Get API key from localStorage if not provided
  const getApiKey = (): string | null => {
    if (apiKey) {
      apiKeyRef.current = apiKey;
      return apiKey;
    }
    
    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const { elevenLabsApiKey } = JSON.parse(savedSettings);
        if (elevenLabsApiKey) {
          apiKeyRef.current = elevenLabsApiKey;
          return elevenLabsApiKey;
        }
      }
    } catch (error) {
      console.error("Failed to get ElevenLabs API key from settings:", error);
    }
    
    return apiKeyRef.current;
  };

  // Voice synthesis function
  const synthesizeSpeech = async (
    text: string, 
    options: VoiceOptions
  ): Promise<ArrayBuffer | null> => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("ElevenLabs API key is required");
      return null;
    }

    setIsLoading(true);
    setError(null);
    
    // Check cache for frequently used phrases for the same voice
    const cacheKey = `${options.voiceId}_${text}`;
    if (voiceCacheRef.current[cacheKey]) {
      console.log(`Using cached audio for voice ${options.voiceId}`);
      setIsLoading(false);
      return voiceCacheRef.current[cacheKey];
    }
    
    try {
      const voiceId = options.voiceId || "21m00Tcm4TlvDq8ikWAM"; // Default voice
      const modelId = options.modelId || "eleven_multilingual_v2";
      const stability = options.stability || 0.5;
      const similarityBoost = options.similarityBoost || 0.75;
      
      // Log voice and model being used
      console.log(`Using ElevenLabs voice ID: ${voiceId}, model: ${modelId}`);
      
      const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: {
            stability,
            similarity_boost: similarityBoost,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`ElevenLabs API error (${response.status}): ${JSON.stringify(errorData)}`);
      }

      const audioBuffer = await response.arrayBuffer();
      
      // Cache common phrases
      if (text.length < 100) {
        voiceCacheRef.current[cacheKey] = audioBuffer;
        console.log(`Cached audio for voice ${options.voiceId}`);
      }
      
      return audioBuffer;
    } catch (error) {
      console.error("ElevenLabs synthesis error:", error);
      setError(error instanceof Error ? error.message : "Unknown error occurred");
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Play audio from buffer
  const playAudio = async (audioData: ArrayBuffer): Promise<void> => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    // Create blob and URL
    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    
    return new Promise((resolve) => {
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audioRef.current.onerror = () => {
          console.error("Error playing audio");
          URL.revokeObjectURL(url);
          resolve();
        };
        
        audioRef.current.play().catch(err => {
          console.error("Failed to play audio:", err);
          resolve();
        });
      } else {
        // Fallback to AudioContext if audio element is not available
        const audioContext = new AudioContext();
        audioContext.decodeAudioData(audioData, (audioBuffer) => {
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          source.start();
          
          source.onended = () => {
            resolve();
          };
        }, (err) => {
          console.error("Error decoding audio data:", err);
          resolve();
        });
      }
    });
  };

  // Speak text function
  const speakText = async (
    text: string, 
    options: VoiceOptions
  ): Promise<void> => {
    try {
      const audioData = await synthesizeSpeech(text, options);
      if (audioData) {
        await playAudio(audioData);
      }
    } catch (error) {
      console.error("Error speaking text:", error);
      setError(error instanceof Error ? error.message : "Unknown error occurred");
    }
  };

  // Test voice function - using shorter text for faster testing
  const testVoice = async (voiceId: string): Promise<boolean> => {
    console.log(`Testing voice ID: ${voiceId}`);
    try {
      setIsLoading(true);
      const audioData = await synthesizeSpeech(
        "This is a voice test.", 
        { voiceId }
      );
      
      if (audioData) {
        await playAudio(audioData);
        setIsLoading(false);
        return true;
      }
      
      setIsLoading(false);
      return false;
    } catch (error) {
      console.error("Voice test failed:", error);
      setIsLoading(false);
      return false;
    }
  };

  // Voice list retrieval function with caching
  const getVoices = async (forceRefresh = false): Promise<ElevenLabsVoice[]> => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setError("ElevenLabs API key is required");
      return [];
    }

    // Return cached voices if we have them and not forcing refresh
    if (voices.length > 0 && !forceRefresh) {
      return voices;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      console.log("Fetching ElevenLabs voices...");
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Retrieved ${data.voices?.length || 0} voices from ElevenLabs`);
      
      // Store voices in state
      const retrievedVoices = data.voices || [];
      setVoices(retrievedVoices);
      
      // Save to localStorage for quick access later
      try {
        localStorage.setItem('elevenlabs_voices', JSON.stringify(retrievedVoices));
      } catch (error) {
        console.error("Failed to cache voice list:", error);
      }
      
      return retrievedVoices;
    } catch (error) {
      console.error("Failed to get ElevenLabs voices:", error);
      setError(error instanceof Error ? error.message : "Unknown error occurred");
      
      // Try to load from cache if fetching failed
      try {
        const cachedVoices = localStorage.getItem('elevenlabs_voices');
        if (cachedVoices) {
          const parsed = JSON.parse(cachedVoices);
          setVoices(parsed);
          return parsed;
        }
      } catch (e) {
        console.error("Failed to load cached voices:", e);
      }
      
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  // Get default/recommended voices for new users
  const getDefaultVoices = (): ElevenLabsVoice[] => {
    return [
      { voice_id: "9BWtsMINqrJLrRacOk9x", name: "Aria (Female)" },
      { voice_id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger (Male)" },
      { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Female)" },
      { voice_id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura (Female)" },
      { voice_id: "IKne3meq5aSn9XLyUdCD", name: "Charlie (Male)" },
      { voice_id: "XB0fDUnXU5powFXDhCwa", name: "Charlotte (British Female)" },
      { voice_id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily (Female)" }
    ];
  };

  return {
    speakText,
    testVoice,
    getVoices,
    getDefaultVoices,
    voices,
    isLoading,
    error,
  };
};

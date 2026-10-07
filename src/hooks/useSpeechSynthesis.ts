
import { useRef, useEffect, useState } from 'react';
import { useElevenLabs as useElevenLabsHook } from './useElevenLabs';

interface UseSpeechSynthesisProps {
  onStart?: () => void;
  onEnd?: () => void;
  useElevenLabs?: boolean;
}

export const useSpeechSynthesis = ({ onStart, onEnd, useElevenLabs = false }: UseSpeechSynthesisProps = {}) => {
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const elevenLabs = useElevenLabsHook();
  const [isElevenLabsEnabled, setIsElevenLabsEnabled] = useState(useElevenLabs);
  const [currentVoice, setCurrentVoice] = useState<string>("21m00Tcm4TlvDq8ikWAM");
  const [lastSettingsCheck, setLastSettingsCheck] = useState(Date.now());
  
  // Create an event listener to detect settings changes
  const [settingsVersion, setSettingsVersion] = useState(0);
  const voiceCache = useRef<Record<string, SpeechSynthesisVoice[]>>({});

  // Function to check for settings updates with improved cache handling
  const checkSettings = () => {
    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const { 
          elevenLabsEnabled, 
          elevenLabsApiKey, 
          elevenLabsVoiceId, 
          voiceEnabled, 
          selectedVoice 
        } = JSON.parse(savedSettings);
        
        // Only enable ElevenLabs if we have an API key
        const shouldEnable = Boolean(elevenLabsEnabled && elevenLabsApiKey);
        
        if (isElevenLabsEnabled !== shouldEnable) {
          console.log(`Updating ElevenLabs status: ${shouldEnable ? 'enabled' : 'disabled'}`);
          setIsElevenLabsEnabled(shouldEnable);
        }
        
        // Store the selected voice ID
        if (elevenLabsVoiceId && elevenLabsVoiceId !== currentVoice) {
          setCurrentVoice(elevenLabsVoiceId);
          console.log(`Updated ElevenLabs voice ID from settings: ${elevenLabsVoiceId}`);
        }
        
        // Set the last check timestamp
        setLastSettingsCheck(Date.now());
      }
    } catch (error) {
      console.error("Failed to load speech settings:", error);
    }
  };

  // Set up event listeners for settings changes
  useEffect(() => {
    // Listen for storage events to detect settings changes
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "settings") {
        console.log("Settings changed, updating speech synthesis");
        checkSettings();
        setSettingsVersion(prev => prev + 1);
      }
    };

    // Listen for custom events from components updating settings
    const handleCustomEvent = () => {
      console.log("Custom storage event detected, updating speech synthesis");
      checkSettings();
      setSettingsVersion(prev => prev + 1);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('storage', handleCustomEvent);
    
    // Check for settings updates periodically (every 30 seconds)
    const periodicCheck = setInterval(() => {
      if (Date.now() - lastSettingsCheck > 30000) {
        checkSettings();
      }
    }, 30000);
    
    // Initial settings check
    checkSettings();

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('storage', handleCustomEvent);
      clearInterval(periodicCheck);
    };
  }, [lastSettingsCheck]);

  useEffect(() => {
    if (window.speechSynthesis) {
      synthRef.current = window.speechSynthesis;
      
      // Pre-load and cache voices for faster access later
      const loadVoices = () => {
        if (synthRef.current) {
          const availableVoices = synthRef.current.getVoices();
          if (availableVoices.length > 0) {
            voiceCache.current = {
              all: availableVoices,
              male: availableVoices.filter(v => v.name.toLowerCase().includes('male')),
              female: availableVoices.filter(v => v.name.toLowerCase().includes('female')),
              english: availableVoices.filter(v => v.lang.startsWith('en')),
            };
            console.log(`Cached ${availableVoices.length} speech synthesis voices`);
          }
        }
      };
      
      // Load voices immediately if available
      loadVoices();
      
      // Also set up event listener for voices loaded
      window.speechSynthesis.onvoiceschanged = loadVoices;
    } else {
      console.warn("Speech synthesis not supported in this browser");
    }

    // Check settings again
    checkSettings();

    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, [settingsVersion]);

  const speak = async (text: string, voiceSettings?: { voice?: string; rate?: number; pitch?: number }) => {
    // Force re-check settings to ensure we have the latest
    checkSettings();
    
    if (isElevenLabsEnabled) {
      try {
        if (onStart) onStart();
        
        let voiceId = currentVoice;
        
        // Check settings for voice ID one last time to ensure most up-to-date
        try {
          const savedSettings = localStorage.getItem("settings");
          if (savedSettings) {
            const { elevenLabsVoiceId } = JSON.parse(savedSettings);
            if (elevenLabsVoiceId) {
              voiceId = elevenLabsVoiceId;
              console.log(`Using voice ID from settings: ${voiceId}`);
            }
          }
        } catch (error) {
          console.error("Failed to get ElevenLabs voice ID from settings:", error);
        }
        
        // If voice settings specify a voice, map it to ElevenLabs voice ID
        if (voiceSettings?.voice) {
          // Map browser voices to ElevenLabs voices based on name
          if (voiceSettings.voice.includes("female") || voiceSettings.voice.includes("Aria")) {
            voiceId = "9BWtsMINqrJLrRacOk9x"; // Aria
          } else if (voiceSettings.voice.includes("male") || voiceSettings.voice.includes("Guy")) {
            voiceId = "CwhRBWXzGAHq8TQ4Fs17"; // Roger
          } else if (voiceSettings.voice.includes("British") || voiceSettings.voice.includes("Ryan")) {
            voiceId = "pFZP5JQG7iQjIQuC4Bku"; // Lily
          } else if (voiceSettings.voice.includes("Sarah")) {
            voiceId = "EXAVITQu4vr4xnSDxMaL"; // Sarah
          } else if (voiceSettings.voice.includes("Charlie")) {
            voiceId = "IKne3meq5aSn9XLyUdCD"; // Charlie
          }
        }
        
        console.log(`Speaking text with ElevenLabs voice ID: ${voiceId}`);
        await elevenLabs.speakText(text, { 
          voiceId, 
          stability: voiceSettings?.pitch ? voiceSettings.pitch * 0.5 : 0.5 // Map pitch to stability
        });
        
        if (onEnd) onEnd();
      } catch (error) {
        console.error("ElevenLabs speech error:", error);
        if (onEnd) onEnd();
        
        // Fall back to browser speech synthesis
        console.log("Falling back to browser speech synthesis");
        if (synthRef.current) {
          browserSpeak(text, voiceSettings);
        }
      }
    } else if (synthRef.current) {
      browserSpeak(text, voiceSettings);
    }
  };
  
  const browserSpeak = (text: string, voiceSettings?: { voice?: string; rate?: number; pitch?: number }) => {
    if (!synthRef.current) return;
    
    synthRef.current.cancel();
    
    try {
      // Break long text into natural sentences for more fluent delivery
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      
      sentences.forEach((sentence, index) => {
        const utterance = new SpeechSynthesisUtterance(sentence.trim());
        
        // Use cached voices if available for better performance
        let voices;
        if (voiceCache.current.all && voiceCache.current.all.length > 0) {
          voices = voiceCache.current.all;
        } else {
          voices = synthRef.current!.getVoices();
        }
        
        // Prefer high-quality natural voices for fluent output
        const preferredVoiceNames = [
          'Google UK English Female', 'Google US English', 'Microsoft Zira',
          'Samantha', 'Karen', 'Daniel', 'Moira', 'Tessa',
          'Google UK English Male', 'Microsoft David',
        ];
        
        let selectedVoice: SpeechSynthesisVoice | undefined;
        
        if (voiceSettings?.voice) {
          selectedVoice = voices.find(v => v.name.includes(voiceSettings.voice!));
        }
        
        // Try preferred natural-sounding voices
        if (!selectedVoice) {
          for (const name of preferredVoiceNames) {
            selectedVoice = voices.find(v => v.name.includes(name));
            if (selectedVoice) break;
          }
        }
        
        // Fall back to any English voice
        if (!selectedVoice) {
          selectedVoice = voices.find(v => v.lang.startsWith('en') && v.localService);
          if (!selectedVoice) {
            selectedVoice = voices.find(v => v.lang.startsWith('en'));
          }
        }
        
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
        
        // Natural speech settings — slightly slower with warm pitch for human feel
        utterance.rate = voiceSettings?.rate ?? 0.92;
        utterance.pitch = voiceSettings?.pitch ?? 1.05;
        utterance.volume = 1;
        
        // Only fire callbacks on first/last utterance
        if (index === 0 && onStart) {
          utterance.onstart = onStart;
        }
        
        if (index === sentences.length - 1 && onEnd) {
          utterance.onend = onEnd;
        }
        
        synthRef.current!.speak(utterance);
      });
    } catch (error) {
      console.error("Speech synthesis error:", error);
      if (onEnd) onEnd();
    }
  };

  return {
    speak,
    cancel: () => synthRef.current?.cancel(),
    isSupported: Boolean(window.speechSynthesis || isElevenLabsEnabled),
    usingElevenLabs: isElevenLabsEnabled,
    currentVoice,
    refreshSettings: checkSettings,
    getVoiceName: (voiceId: string) => {
      const voiceMap: Record<string, string> = {
        "9BWtsMINqrJLrRacOk9x": "Aria (Female)",
        "CwhRBWXzGAHq8TQ4Fs17": "Roger (Male)",
        "EXAVITQu4vr4xnSDxMaL": "Sarah (Female)",
        "FGY2WhTYpPnrIDTdsKH5": "Laura (Female)",
        "IKne3meq5aSn9XLyUdCD": "Charlie (Male)",
        "XB0fDUnXU5powFXDhCwa": "Charlotte (British Female)",
        "pFZP5JQG7iQjIQuC4Bku": "Lily (Female)"
      };
      return voiceMap[voiceId] || "Unknown Voice";
    }
  };
};

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export const useVoiceControls = (
  startRecognition: () => void,
  stopRecognition: () => void,
  cancelSpeech: () => void
) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecognition();
      setIsRecording(false);
      toast.info("Stopped listening");
    } else {
      try {
        startRecognition();
        setIsRecording(true);
        toast.success("Listening...");
      } catch (error) {
        console.error("Error starting speech recognition:", error);
        toast.error("Could not start speech recognition");
        setIsRecording(false);
      }
    }
  }, [isRecording, startRecognition, stopRecognition]);

  const toggleVoice = useCallback(() => {
    const newValue = !isVoiceEnabled;
    setIsVoiceEnabled(newValue);

    try {
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        settings.voiceEnabled = newValue;
        localStorage.setItem("settings", JSON.stringify(settings));
      }
    } catch (error) {
      console.error("Failed to update voice settings:", error);
    }

    if (isTalking) {
      cancelSpeech();
      setIsTalking(false);
    }

    toast.success(newValue ? "Voice enabled" : "Voice disabled");
  }, [isVoiceEnabled, isTalking, cancelSpeech]);

  return {
    isRecording,
    setIsRecording,
    setIsTalking,
    isTalking,
    isVoiceEnabled,
    setIsVoiceEnabled,
    toggleRecording,
    toggleVoice
  };
};

import { useRef, useCallback, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface UseSpeechRecognitionProps {
  onResult: (transcript: string) => void;
  onInterim?: (transcript: string) => void;
  onError?: (error: any) => void;
  onEnd?: () => void;
}

/**
 * Microphone capture + server-side transcription via the `transcribe` edge
 * function (Lovable AI Gateway, openai/gpt-4o-mini-transcribe).
 *
 * Captures a single self-contained recording with MediaRecorder (start → stop),
 * names the upload to match the real container, and posts the file to the
 * server. Skips the browser SpeechRecognition API entirely — quality is far
 * better and works in every modern browser.
 */
export const useSpeechRecognition = ({
  onResult,
  onInterim,
  onError,
  onEnd,
}: UseSpeechRecognitionProps) => {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeRef = useRef<string>("audio/webm");
  const startedAtRef = useRef<number>(0);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const isSupported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof (window as any).MediaRecorder !== "undefined";

  const pickMimeType = useCallback((): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const c of candidates) {
      try {
        if ((window as any).MediaRecorder?.isTypeSupported?.(c)) return c;
      } catch {
        /* ignore */
      }
    }
    return "";
  }, []);

  const extFor = (mime: string) => {
    const base = mime.split(";")[0].toLowerCase();
    if (base.includes("webm")) return "webm";
    if (base.includes("mp4") || base.includes("m4a")) return "m4a";
    if (base.includes("ogg")) return "ogg";
    if (base.includes("wav")) return "wav";
    if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
    return "webm";
  };

  const cleanup = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const transcribe = useCallback(
    async (blob: Blob) => {
      if (blob.size < 1500) {
        toast.info("That was too short — try again.");
        return;
      }
      setIsTranscribing(true);
      onInterim?.("Transcribing…");
      try {
        const form = new FormData();
        const ext = extFor(blob.type || mimeRef.current);
        form.append("audio", blob, `recording.${ext}`);

        const { data, error } = await supabase.functions.invoke("transcribe", {
          body: form,
        });
        if (error) throw error;
        const text = (data as any)?.text?.trim?.() ?? "";
        if (!text) {
          toast.info("Didn't catch that. Try again.");
          onInterim?.("");
          return;
        }
        onResult(text);
      } catch (err: any) {
        console.error("Transcription failed", err);
        toast.error(err?.message || "Couldn't transcribe audio.");
        onInterim?.("");
        onError?.(err);
      } finally {
        setIsTranscribing(false);
      }
    },
    [onError, onInterim, onResult],
  );

  const startRecognition = useCallback(async () => {
    if (!isSupported) {
      toast.error("Recording isn't supported in this browser.");
      return;
    }
    if (recorderRef.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mime = pickMimeType();
      mimeRef.current = mime || "audio/webm";
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const type = recorder.mimeType || mimeRef.current || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const duration = Date.now() - startedAtRef.current;
        cleanup();
        onEnd?.();
        if (duration < 350) {
          toast.info("Hold the mic a bit longer.");
          return;
        }
        await transcribe(blob);
      };

      recorder.onerror = (e: any) => {
        console.error("Recorder error", e);
        toast.error("Recording error. Please try again.");
        cleanup();
        onError?.(e);
        onEnd?.();
      };

      startedAtRef.current = Date.now();
      recorder.start(); // single segment — no timeslice
      recorderRef.current = recorder;
    } catch (err: any) {
      console.error("getUserMedia failed", err);
      if (err?.name === "NotAllowedError") {
        toast.error("Microphone access denied. Enable it in your browser settings.");
      } else {
        toast.error("Couldn't access the microphone.");
      }
      cleanup();
      onError?.(err);
      onEnd?.();
    }
  }, [cleanup, isSupported, onEnd, onError, pickMimeType, transcribe]);

  const stopRecognition = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) {
      onEnd?.();
      return;
    }
    if (recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* ignore */ }
    } else {
      cleanup();
      onEnd?.();
    }
  }, [cleanup, onEnd]);

  return { startRecognition, stopRecognition, isSupported, isTranscribing };
};

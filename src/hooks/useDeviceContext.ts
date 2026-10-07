import { useEffect, useState } from "react";
import type { DeviceContext } from "@/lib/intent/types";

function timeOfDay(): DeviceContext["timeOfDay"] {
  const h = new Date().getHours();
  if (h < 6) return "night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 22) return "evening";
  return "night";
}

function platform(): DeviceContext["platform"] {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "web";
}

/**
 * Ambient device signals the web layer can read today. Native Android
 * capabilities (screen, SMS, telephony) extend this through Capacitor.
 */
export function useDeviceContext(): DeviceContext {
  const [device, setDevice] = useState<DeviceContext>(() => ({
    clipboardAvailable: typeof navigator !== "undefined" && !!navigator.clipboard,
    cameraAvailable: typeof navigator !== "undefined" && !!navigator.mediaDevices,
    microphoneAvailable: typeof navigator !== "undefined" && !!navigator.mediaDevices,
    platform: platform(),
    timeOfDay: timeOfDay(),
    network: { online: typeof navigator !== "undefined" ? navigator.onLine : true },
  }));

  useEffect(() => {
    let cancelled = false;

    const syncNetwork = () => {
      const conn = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
      setDevice((d) => ({
        ...d,
        network: { online: navigator.onLine, type: conn?.effectiveType },
      }));
    };

    syncNetwork();
    window.addEventListener("online", syncNetwork);
    window.addEventListener("offline", syncNetwork);

    const battery = (navigator as unknown as {
      getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, f: () => void) => void }>;
    }).getBattery;

    if (battery) {
      battery.call(navigator).then((b) => {
        if (cancelled) return;
        const sync = () =>
          setDevice((d) => ({ ...d, battery: { level: b.level, charging: b.charging } }));
        sync();
        b.addEventListener("levelchange", sync);
        b.addEventListener("chargingchange", sync);
      }).catch(() => {});
    }

    const clock = setInterval(
      () => setDevice((d) => (d.timeOfDay === timeOfDay() ? d : { ...d, timeOfDay: timeOfDay() })),
      60_000,
    );

    return () => {
      cancelled = true;
      clearInterval(clock);
      window.removeEventListener("online", syncNetwork);
      window.removeEventListener("offline", syncNetwork);
    };
  }, []);

  return device;
}

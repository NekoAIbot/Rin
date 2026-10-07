
import { useState, useEffect } from 'react';

export interface PlatformInfo {
  isMobile: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isCapacitor: boolean;
  isBrowser: boolean;
  platformName: string;
}

export function usePlatform(): PlatformInfo {
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo>({
    isMobile: false,
    isDesktop: false,
    isIOS: false,
    isAndroid: false,
    isCapacitor: false,
    isBrowser: true,
    platformName: 'browser',
  });

  useEffect(() => {
    const checkPlatform = async () => {
      // Check if running in Capacitor
      const isCapacitorAvailable = 'Capacitor' in window;
      
      // Mobile detection
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      // iOS detection
      const isIOSDevice = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      // Android detection
      const isAndroidDevice = /Android/i.test(navigator.userAgent);
      
      // Get more detailed platform info if Capacitor is available
      let platformName = 'browser';
      
      if (isCapacitorAvailable) {
        try {
          // Dynamically import Capacitor to avoid issues when not available
          const { Capacitor } = await import('@capacitor/core');
          const isCapacitor = Capacitor.isNativePlatform();
          
          if (isCapacitor) {
            platformName = Capacitor.getPlatform();
          }
          
          setPlatformInfo({
            isMobile: isMobileDevice || Capacitor.isNativePlatform(),
            isDesktop: !isMobileDevice && !Capacitor.isNativePlatform(),
            isIOS: isIOSDevice || platformName === 'ios',
            isAndroid: isAndroidDevice || platformName === 'android',
            isCapacitor,
            isBrowser: !isCapacitor,
            platformName
          });
          
        } catch (error) {
          console.error("Failed to load Capacitor:", error);
          setDefaultPlatformInfo(isMobileDevice, isIOSDevice, isAndroidDevice);
        }
      } else {
        setDefaultPlatformInfo(isMobileDevice, isIOSDevice, isAndroidDevice);
      }
    };
    
    const setDefaultPlatformInfo = (isMobileDevice: boolean, isIOSDevice: boolean, isAndroidDevice: boolean) => {
      setPlatformInfo({
        isMobile: isMobileDevice,
        isDesktop: !isMobileDevice,
        isIOS: isIOSDevice,
        isAndroid: isAndroidDevice,
        isCapacitor: false,
        isBrowser: true,
        platformName: isMobileDevice ? (isIOSDevice ? 'ios' : isAndroidDevice ? 'android' : 'mobile') : 'desktop'
      });
    };
    
    checkPlatform();
  }, []);

  return platformInfo;
}

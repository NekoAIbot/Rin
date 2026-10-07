
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.0ca2fdfa1eae4c81aab74321b05ff071',
  appName: 'aurora-echo-verse',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://0ca2fdfa-1eae-4c81-aab7-4321b05ff071.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0A0A0B",
      showSpinner: true,
      spinnerColor: "#7E22CE",
      androidSpinnerStyle: "large"
    }
  },
  android: {
    backgroundColor: "#0A0A0B"
  },
  ios: {
    backgroundColor: "#0A0A0B"
  }
};

export default config;

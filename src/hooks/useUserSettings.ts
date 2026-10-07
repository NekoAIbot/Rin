import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface UserSettings {
  voice_enabled: boolean;
  active_persona: string;
  web_search_enabled: boolean;
  preferred_model: string;
  companion_mode: string;
  proactive_enabled: boolean;
  memory_depth: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  voice_enabled: true,
  active_persona: 'assistant',
  web_search_enabled: false,
  preferred_model: 'google/gemini-3-flash-preview',
  companion_mode: 'assistant',
  proactive_enabled: true,
  memory_depth: 'standard',
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch user settings from database
  const fetchSettings = useCallback(async () => {
    if (!user) {
      setSettings(DEFAULT_SETTINGS);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings({
          voice_enabled: data.voice_enabled ?? DEFAULT_SETTINGS.voice_enabled,
          active_persona: data.active_persona ?? DEFAULT_SETTINGS.active_persona,
          web_search_enabled: data.web_search_enabled ?? DEFAULT_SETTINGS.web_search_enabled,
          preferred_model: data.preferred_model ?? DEFAULT_SETTINGS.preferred_model,
          companion_mode: (data as any).companion_mode ?? DEFAULT_SETTINGS.companion_mode,
          proactive_enabled: (data as any).proactive_enabled ?? DEFAULT_SETTINGS.proactive_enabled,
          memory_depth: (data as any).memory_depth ?? DEFAULT_SETTINGS.memory_depth,
        });
      } else {
        // Create default settings for new user
        await createDefaultSettings();
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Create default settings for a new user
  const createDefaultSettings = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_settings')
        .insert({
          user_id: user.id,
          ...DEFAULT_SETTINGS
        });

      if (error && !error.message.includes('duplicate')) {
        throw error;
      }
      
      setSettings(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Error creating default settings:', error);
    }
  };

  // Update a specific setting
  const updateSetting = useCallback(async <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K]
  ) => {
    if (!user) return;

    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);

    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          [key]: value,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      
      // Dispatch storage event for backwards compatibility
      window.dispatchEvent(new Event('storage'));
    } catch (error) {
      console.error('Error updating setting:', error);
      toast.error('Failed to save setting');
      // Revert on error
      setSettings(settings);
    }
  }, [user, settings]);

  // Update multiple settings at once
  const updateSettings = useCallback(async (newSettings: Partial<UserSettings>) => {
    if (!user) return;

    const mergedSettings = { ...settings, ...newSettings };
    setSettings(mergedSettings);

    try {
      const { error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.id,
          ...newSettings,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
      
      window.dispatchEvent(new Event('storage'));
      toast.success('Settings saved');
    } catch (error) {
      console.error('Error updating settings:', error);
      toast.error('Failed to save settings');
      setSettings(settings);
    }
  }, [user, settings]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return {
    settings,
    isLoading,
    updateSetting,
    updateSettings,
    refreshSettings: fetchSettings
  };
}

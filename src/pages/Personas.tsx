
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PersonaSelector } from "@/components/PersonaSelector";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const availableLanguages = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "ja", name: "Japanese" },
  { code: "zh", name: "Chinese" },
  { code: "ko", name: "Korean" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" }
];

export default function Personas() {
  const { user } = useAuth();
  const [personas, setPersonas] = useState<any[]>([]);
  const [editingPersona, setEditingPersona] = useState<any>(null);
  const [preferredLanguage, setPreferredLanguage] = useState("en");

  useEffect(() => {
    // Load saved personas from localStorage
    try {
      const savedPersonas = localStorage.getItem("aurora_personas");
      if (savedPersonas) {
        setPersonas(JSON.parse(savedPersonas));
      } else {
        // Set default personas if none exist
        const defaultPersonas = [
          { id: "default", name: "Aurora", description: "Helpful AI Assistant", systemPrompt: "You are Aurora, a helpful AI assistant." },
          { id: "creative", name: "Creative", description: "Creative writing assistant", systemPrompt: "You are a creative writing assistant, focusing on imaginative and engaging content." },
          { id: "technical", name: "Technical", description: "Technical problem solver", systemPrompt: "You are a technical assistant, providing precise and detailed solutions to technical problems." }
        ];
        setPersonas(defaultPersonas);
        localStorage.setItem("aurora_personas", JSON.stringify(defaultPersonas));
      }

      // Load preferred language
      const savedLanguage = localStorage.getItem("aurora_language");
      if (savedLanguage) {
        setPreferredLanguage(savedLanguage);
      }
    } catch (error) {
      console.error("Failed to load personas:", error);
      toast.error("Failed to load personas");
    }
  }, []);

  const handleSavePersona = () => {
    if (!editingPersona?.name || !editingPersona?.description) {
      toast.error("Name and description are required");
      return;
    }

    let updatedPersonas;
    if (editingPersona.id) {
      // Update existing persona
      updatedPersonas = personas.map(p => 
        p.id === editingPersona.id ? editingPersona : p
      );
    } else {
      // Create new persona
      const newPersona = {
        ...editingPersona,
        id: `custom-${Date.now()}`
      };
      updatedPersonas = [...personas, newPersona];
    }

    setPersonas(updatedPersonas);
    localStorage.setItem("aurora_personas", JSON.stringify(updatedPersonas));
    setEditingPersona(null);
    toast.success("Persona saved successfully");
  };

  const handleDeletePersona = (id: string) => {
    const updatedPersonas = personas.filter(p => p.id !== id);
    setPersonas(updatedPersonas);
    localStorage.setItem("aurora_personas", JSON.stringify(updatedPersonas));
    toast.success("Persona deleted");
  };

  const handleLanguageChange = (language: string) => {
    setPreferredLanguage(language);
    localStorage.setItem("aurora_language", language);
    toast.success(`Language preference set to ${availableLanguages.find(l => l.code === language)?.name}`);
  };

  return (
    <div className="p-6 container mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Personas & Language</h1>
        <p className="text-muted-foreground">Customize AI personality and communication preferences</p>
      </header>

      <Tabs defaultValue="personas">
        <TabsList className="mb-4">
          <TabsTrigger value="personas">Personas</TabsTrigger>
          <TabsTrigger value="language">Language Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="personas" className="space-y-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-4">Current Persona</h2>
            <Card className="p-4">
              <PersonaSelector
                onSelectPersona={async (personaId) => {
                  console.log(`Selected persona: ${personaId}`);
                  toast.success(`Persona changed to ${personas.find(p => p.id === personaId)?.name || 'Default'}`);
                  // Sync to database
                  if (user) {
                    await supabase.from("user_settings").upsert({
                      user_id: user.id,
                      active_persona: personaId,
                      updated_at: new Date().toISOString(),
                    }, { onConflict: "user_id" });
                  }
                }}
              />
            </Card>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Manage Personas</h2>
              <Button 
                onClick={() => setEditingPersona({ name: '', description: '', systemPrompt: '' })}
                className="bg-aurora-green text-white"
              >
                Create New Persona
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {personas.map((persona) => (
                <Card key={persona.id} className="p-4 flex flex-col">
                  <h3 className="font-bold text-lg mb-1">{persona.name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{persona.description}</p>
                  <div className="mt-auto flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => setEditingPersona(persona)}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleDeletePersona(persona.id)}
                      disabled={persona.id === 'default'} // Prevent deleting default persona
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {editingPersona && (
            <Card className="p-4">
              <h3 className="font-bold text-lg mb-4">
                {editingPersona.id ? 'Edit Persona' : 'Create New Persona'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <Input
                    value={editingPersona.name}
                    onChange={(e) => setEditingPersona({...editingPersona, name: e.target.value})}
                    placeholder="Persona name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <Input
                    value={editingPersona.description}
                    onChange={(e) => setEditingPersona({...editingPersona, description: e.target.value})}
                    placeholder="Short description"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">System Prompt</label>
                  <Textarea
                    value={editingPersona.systemPrompt}
                    onChange={(e) => setEditingPersona({...editingPersona, systemPrompt: e.target.value})}
                    placeholder="Detailed instruction for AI behavior"
                    rows={5}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setEditingPersona(null)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSavePersona}>
                    Save
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="language" className="space-y-4">
          <Card className="p-4">
            <h2 className="text-lg font-bold mb-4">Language Preferences</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Preferred Interface Language</label>
                <Select
                  value={preferredLanguage}
                  onValueChange={handleLanguageChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableLanguages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                  This sets your preferred language for the Aurora interface and AI responses.
                </p>
              </div>

              <div className="mt-6">
                <h3 className="font-medium mb-2">Translation Support</h3>
                <p className="text-sm text-muted-foreground">
                  Aurora can automatically detect and translate content between languages.
                  You can ask Aurora to translate any text by saying "translate to [language]".
                </p>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

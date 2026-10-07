
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  timestamp: Date;
  importance?: number;
}

export function Memory() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [newFact, setNewFact] = useState<string>("");
  const [memoryType, setMemoryType] = useState<string>("fact");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filteredMemories, setFilteredMemories] = useState<MemoryItem[]>([]);
  
  // Load memories on component mount
  useEffect(() => {
    const loadedMemories = localStorage.getItem("aurora_memories");
    const loadedName = localStorage.getItem("aurora_user_name");
    
    if (loadedMemories) {
      try {
        const parsedMemories = JSON.parse(loadedMemories);
        const processedMemories = parsedMemories.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
          importance: m.importance || Math.floor(Math.random() * 5) + 1 // Add importance if not present
        }));
        setMemories(processedMemories);
        setFilteredMemories(processedMemories);
      } catch (error) {
        console.error("Failed to parse memories:", error);
        toast.error("Failed to load memories from storage");
      }
    } else {
      // Set some example memories if none exist
      const exampleMemories: MemoryItem[] = [
        {
          id: "1",
          type: "preference",
          content: "User prefers dark mode",
          timestamp: new Date(),
          importance: 3
        },
        {
          id: "2",
          type: "fact",
          content: "User is interested in artificial intelligence",
          timestamp: new Date(),
          importance: 4
        }
      ];
      setMemories(exampleMemories);
      setFilteredMemories(exampleMemories);
      localStorage.setItem("aurora_memories", JSON.stringify(exampleMemories));
    }
    
    if (loadedName) {
      setUserName(loadedName);
    }
  }, []);
  
  // Filter memories when search term changes
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredMemories(memories);
    } else {
      const filtered = memories.filter(memory => 
        memory.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
        memory.type.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredMemories(filtered);
    }
  }, [searchTerm, memories]);
  
  const saveUserName = () => {
    if (!userName.trim()) return;
    
    localStorage.setItem("aurora_user_name", userName);
    
    // Add to memories
    const newMemory: MemoryItem = {
      id: Date.now().toString(),
      type: "name",
      content: `User's name is ${userName}`,
      timestamp: new Date(),
      importance: 5 // Name is highly important
    };
    
    const updatedMemories = [...memories, newMemory];
    setMemories(updatedMemories);
    localStorage.setItem("aurora_memories", JSON.stringify(updatedMemories));
    
    toast.success("Name saved to memory");
    
    // Publish an event that settings have changed
    window.dispatchEvent(new Event('storage'));
  };
  
  const addNewFact = () => {
    if (!newFact.trim()) return;
    
    const newMemory: MemoryItem = {
      id: Date.now().toString(),
      type: memoryType,
      content: newFact,
      timestamp: new Date(),
      importance: memoryType === "preference" ? 4 : memoryType === "fact" ? 3 : 2
    };
    
    const updatedMemories = [...memories, newMemory];
    setMemories(updatedMemories);
    localStorage.setItem("aurora_memories", JSON.stringify(updatedMemories));
    
    setNewFact("");
    toast.success(`New ${memoryType} added to memory`);
    
    // Publish an event that settings have changed
    window.dispatchEvent(new Event('storage'));
  };
  
  const deleteMemory = (id: string) => {
    const updatedMemories = memories.filter(m => m.id !== id);
    setMemories(updatedMemories);
    localStorage.setItem("aurora_memories", JSON.stringify(updatedMemories));
    
    toast.success("Memory deleted");
    
    // Publish an event that settings have changed
    window.dispatchEvent(new Event('storage'));
  };
  
  const clearAllMemories = () => {
    setMemories([]);
    localStorage.removeItem("aurora_memories");
    toast.success("All memories cleared");
    
    // Publish an event that settings have changed
    window.dispatchEvent(new Event('storage'));
  };
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">Memory Management</h1>
      <p className="text-muted-foreground">Aurora's memory system helps it remember important information about you and your preferences.</p>
      
      <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
        <h2 className="text-xl font-bold mb-4">User Profile</h2>
        
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="userName">Your Name</Label>
            <div className="flex space-x-2">
              <Input 
                id="userName" 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)} 
                placeholder="Enter your name"
              />
              <Button onClick={saveUserName}>Save</Button>
            </div>
          </div>
        </div>
      </Card>
      
      <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Memory Database</h2>
          <Button variant="destructive" size="sm" onClick={clearAllMemories}>
            Clear All
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="grid gap-4">
            <Label htmlFor="newFact">Add New Memory</Label>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
              <Select
                value={memoryType}
                onValueChange={setMemoryType}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Memory Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fact">Fact</SelectItem>
                  <SelectItem value="preference">Preference</SelectItem>
                  <SelectItem value="experience">Experience</SelectItem>
                  <SelectItem value="relationship">Relationship</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex flex-1 space-x-2">
                <Input 
                  id="newFact" 
                  value={newFact} 
                  onChange={(e) => setNewFact(e.target.value)} 
                  placeholder="Enter a fact or preference to remember"
                  className="flex-1"
                />
                <Button onClick={addNewFact}>Add</Button>
              </div>
            </div>
          </div>
          
          <div className="pt-4 border-t border-border">
            <Label htmlFor="searchMemory">Search Memories</Label>
            <Input 
              id="searchMemory"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by content or type..."
              className="mb-4"
            />
            
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {filteredMemories.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  {searchTerm ? "No matching memories found" : "No memories stored"}
                </p>
              ) : (
                filteredMemories.map(memory => (
                  <div 
                    key={memory.id}
                    className="bg-secondary/30 p-3 rounded-md flex justify-between items-start"
                  >
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                          {memory.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(memory.timestamp)}
                        </span>
                        {memory.importance && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                            Priority: {memory.importance}
                          </span>
                        )}
                      </div>
                      <p className="mt-1">{memory.content}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMemory(memory.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      &times;
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>
      
      <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
        <h2 className="text-xl font-bold mb-2">Memory Usage</h2>
        <p className="text-sm text-muted-foreground">
          Aurora uses these memories to personalize interactions with you. The higher the importance, the more likely Aurora will recall this information during conversations.
        </p>
      </Card>
    </div>
  );
}

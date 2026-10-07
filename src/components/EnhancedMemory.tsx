
import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BookMarked, Database, FileText } from "lucide-react";

interface MemoryItem {
  id: string;
  type: string;
  content: string;
  timestamp: Date;
  importance?: number;
  category?: string;
  source?: string;
  context?: string;
}

export function EnhancedMemory() {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [userName, setUserName] = useState<string>("");
  const [newFact, setNewFact] = useState<string>("");
  const [memoryType, setMemoryType] = useState<string>("fact");
  const [memoryCategory, setMemoryCategory] = useState<string>("general");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [filteredMemories, setFilteredMemories] = useState<MemoryItem[]>([]);
  const [memoryContext, setMemoryContext] = useState<string>("");
  
  const categories = useMemo(() => [
    "general", "work", "personal", "health", "finance", 
    "education", "entertainment", "technology", "travel"
  ], []);

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
          importance: m.importance || Math.floor(Math.random() * 5) + 1, // Add importance if not present
          category: m.category || "general", // Add category if not present
        }));
        setMemories(processedMemories);
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
          category: "technology",
          timestamp: new Date(),
          importance: 3
        },
        {
          id: "2",
          type: "fact",
          content: "User is interested in artificial intelligence",
          category: "education",
          timestamp: new Date(),
          importance: 4
        },
        {
          id: "3",
          type: "experience",
          content: "User has visited Japan in 2019",
          category: "travel",
          timestamp: new Date(),
          importance: 3,
          context: "Travel discussion"
        }
      ];
      setMemories(exampleMemories);
      localStorage.setItem("aurora_memories", JSON.stringify(exampleMemories));
    }
    
    if (loadedName) {
      setUserName(loadedName);
    }
  }, []);
  
  // Filter memories when search term or active tab changes
  useEffect(() => {
    let filtered = [...memories];
    
    // Filter by tab
    if (activeTab !== "all") {
      filtered = filtered.filter(memory => memory.type === activeTab);
    }
    
    // Filter by search term if present
    if (searchTerm.trim()) {
      filtered = filtered.filter(memory => 
        memory.content.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (memory.category && memory.category.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (memory.context && memory.context.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Sort by importance and recency
    filtered.sort((a, b) => {
      // First sort by importance
      if ((b.importance || 0) !== (a.importance || 0)) {
        return (b.importance || 0) - (a.importance || 0);
      }
      // Then sort by timestamp (more recent first)
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    
    setFilteredMemories(filtered);
  }, [searchTerm, activeTab, memories]);
  
  const saveUserName = () => {
    if (!userName.trim()) return;
    
    localStorage.setItem("aurora_user_name", userName);
    
    // Add to memories
    const newMemory: MemoryItem = {
      id: Date.now().toString(),
      type: "identity",
      content: `User's name is ${userName}`,
      category: "personal",
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
      category: memoryCategory,
      context: memoryContext || undefined,
      timestamp: new Date(),
      importance: 
        memoryType === "identity" ? 5 :
        memoryType === "preference" ? 4 : 
        memoryType === "fact" ? 3 : 2
    };
    
    const updatedMemories = [...memories, newMemory];
    setMemories(updatedMemories);
    localStorage.setItem("aurora_memories", JSON.stringify(updatedMemories));
    
    setNewFact("");
    setMemoryContext("");
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
    if (window.confirm("Are you sure you want to clear all memories? This action cannot be undone.")) {
      setMemories([]);
      localStorage.removeItem("aurora_memories");
      toast.success("All memories cleared");
      
      // Publish an event that settings have changed
      window.dispatchEvent(new Event('storage'));
    }
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

  const exportMemories = () => {
    try {
      const dataStr = JSON.stringify(memories, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
      
      const exportFileDefaultName = `aurora-memories-${new Date().toISOString().slice(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      toast.success("Memories exported successfully");
    } catch (error) {
      console.error("Failed to export memories:", error);
      toast.error("Failed to export memories");
    }
  };

  const getCategoryColor = (category: string) => {
    const categoryColors: Record<string, string> = {
      "general": "bg-gray-500",
      "work": "bg-blue-500",
      "personal": "bg-purple-500",
      "health": "bg-green-500",
      "finance": "bg-emerald-500",
      "education": "bg-indigo-500",
      "entertainment": "bg-pink-500",
      "technology": "bg-cyan-500",
      "travel": "bg-amber-500"
    };
    
    return categoryColors[category] || "bg-gray-500";
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Memory Management 2.0</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportMemories} size="sm">
            Export Memories
          </Button>
          <Button variant="destructive" size="sm" onClick={clearAllMemories}>
            Clear All
          </Button>
        </div>
      </div>
      
      <p className="text-muted-foreground">
        Aurora's enhanced memory system helps it remember important information categorized by type and context,
        allowing for more natural and personalized conversations.
      </p>
      
      <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-aurora-blue/10">
            <FileText className="h-5 w-5 text-aurora-blue" />
          </div>
          <h2 className="text-xl font-bold">User Profile</h2>
        </div>
        
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
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-aurora-blue/10">
            <BookMarked className="h-5 w-5 text-aurora-blue" />
          </div>
          <h2 className="text-xl font-bold">Add New Memory</h2>
        </div>
        
        <div className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="memoryType">Memory Type</Label>
              <Select
                value={memoryType}
                onValueChange={setMemoryType}
              >
                <SelectTrigger id="memoryType">
                  <SelectValue placeholder="Memory Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fact">Fact</SelectItem>
                  <SelectItem value="preference">Preference</SelectItem>
                  <SelectItem value="experience">Experience</SelectItem>
                  <SelectItem value="identity">Identity</SelectItem>
                  <SelectItem value="relationship">Relationship</SelectItem>
                  <SelectItem value="learning">Learning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="memoryCategory">Category</Label>
              <Select
                value={memoryCategory}
                onValueChange={setMemoryCategory}
              >
                <SelectTrigger id="memoryCategory">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div>
            <Label htmlFor="memoryContent">Memory Content</Label>
            <Input 
              id="memoryContent" 
              value={newFact} 
              onChange={(e) => setNewFact(e.target.value)} 
              placeholder="Enter a fact, preference, or experience to remember"
            />
          </div>
          
          <div>
            <Label htmlFor="memoryContext">Context (Optional)</Label>
            <Input 
              id="memoryContext" 
              value={memoryContext} 
              onChange={(e) => setMemoryContext(e.target.value)} 
              placeholder="Where or when did you learn this information?"
            />
          </div>
          
          <Button onClick={addNewFact}>Add to Memory</Button>
        </div>
      </Card>
      
      <Card className="p-5 border-none bg-gradient-to-br from-primary/5 to-accent/5 glass-panel">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-full bg-aurora-blue/10">
            <Database className="h-5 w-5 text-aurora-blue" />
          </div>
          <h2 className="text-xl font-bold">Memory Database</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <Input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search memories..."
              className="mb-4"
            />
            
            <Tabs 
              defaultValue="all" 
              value={activeTab}
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="mb-4 flex flex-wrap h-auto">
                <TabsTrigger value="all">All ({memories.length})</TabsTrigger>
                <TabsTrigger value="fact">Facts ({memories.filter(m => m.type === 'fact').length})</TabsTrigger>
                <TabsTrigger value="preference">Preferences ({memories.filter(m => m.type === 'preference').length})</TabsTrigger>
                <TabsTrigger value="experience">Experiences ({memories.filter(m => m.type === 'experience').length})</TabsTrigger>
                <TabsTrigger value="identity">Identity ({memories.filter(m => m.type === 'identity').length})</TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="space-y-4">
                {renderMemoriesList()}
              </TabsContent>
              
              <TabsContent value="fact" className="space-y-4">
                {renderMemoriesList('fact')}
              </TabsContent>
              
              <TabsContent value="preference" className="space-y-4">
                {renderMemoriesList('preference')}
              </TabsContent>
              
              <TabsContent value="experience" className="space-y-4">
                {renderMemoriesList('experience')}
              </TabsContent>
              
              <TabsContent value="identity" className="space-y-4">
                {renderMemoriesList('identity')}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </Card>
    </div>
  );

  function renderMemoriesList(type?: string) {
    const filtered = type 
      ? filteredMemories.filter(m => m.type === type)
      : filteredMemories;
    
    if (filtered.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm ? "No matching memories found" : "No memories stored"}
        </div>
      );
    }
    
    return (
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {filtered.map(memory => (
          <div 
            key={memory.id}
            className="bg-secondary/30 p-4 rounded-md flex justify-between items-start hover:bg-secondary/40 transition-colors"
          >
            <div className="flex-1">
              <div className="flex flex-wrap gap-2 mb-2">
                <Badge variant="outline" className="capitalize">
                  {memory.type}
                </Badge>
                
                {memory.category && (
                  <Badge className={`${getCategoryColor(memory.category)}/20 text-${getCategoryColor(memory.category).replace('bg-', '')}-700 capitalize`}>
                    {memory.category}
                  </Badge>
                )}
                
                {memory.importance && (
                  <Badge variant="secondary">
                    Priority: {memory.importance}
                  </Badge>
                )}
              </div>
              
              <p className="text-lg font-medium mb-1">{memory.content}</p>
              
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mt-2">
                <span>{formatDate(memory.timestamp)}</span>
                
                {memory.context && (
                  <span>Context: {memory.context}</span>
                )}
              </div>
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
        ))}
      </div>
    );
  }
}

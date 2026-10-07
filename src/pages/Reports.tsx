import { useState, useEffect } from "react";
import { FileText, Download, Calendar, Filter, BarChart3, PieChart, TrendingUp, Mail, Loader2, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ReportConfig {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  fields: string[];
}

interface GeneratedReport {
  id: string;
  type: string;
  dateRange: string;
  format: string;
  createdAt: string;
  data: Record<string, any>;
  fields: string[];
}

const AVAILABLE_REPORTS: ReportConfig[] = [
  {
    id: "usage",
    name: "Usage Summary",
    description: "Overview of AI assistant usage patterns",
    icon: BarChart3,
    fields: ["Total Sessions", "Average Duration", "Peak Usage Times", "Feature Utilization"],
  },
  {
    id: "activity",
    name: "Activity Report",
    description: "Detailed activity log and interactions",
    icon: TrendingUp,
    fields: ["Chat Messages", "Memory Entries", "API Requests", "Emotional Patterns"],
  },
  {
    id: "performance",
    name: "Performance Metrics",
    description: "System performance and response times",
    icon: PieChart,
    fields: ["Response Time", "Success Rate", "Error Rate", "Token Usage"],
  },
];

export default function Reports() {
  const { user } = useAuth();
  const [selectedReport, setSelectedReport] = useState<string>("usage");
  const [dateRange, setDateRange] = useState<string>("7d");
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>({});
  const [exportFormat, setExportFormat] = useState<string>("csv");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReports, setGeneratedReports] = useState<GeneratedReport[]>([]);

  const currentReport = AVAILABLE_REPORTS.find((r) => r.id === selectedReport);

  useEffect(() => {
    // Load saved reports from localStorage
    try {
      const saved = localStorage.getItem("aurora_generated_reports");
      if (saved) setGeneratedReports(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveReports = (reports: GeneratedReport[]) => {
    setGeneratedReports(reports);
    localStorage.setItem("aurora_generated_reports", JSON.stringify(reports));
  };

  const handleFieldToggle = (field: string) => {
    setSelectedFields((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const getDateRangeStart = () => {
    const d = new Date();
    const days = dateRange === "1d" ? 1 : dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
    d.setDate(d.getDate() - days);
    return d.toISOString();
  };

  const fetchReportData = async () => {
    if (!user) return {};
    const startDate = getDateRangeStart();
    const data: Record<string, any> = {};

    const activeFields = Object.entries(selectedFields)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    if (selectedReport === "usage" || selectedReport === "activity") {
      // Fetch conversations count
      const { count: conversationCount } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startDate);
      data["Total Sessions"] = conversationCount || 0;

      // Fetch messages
      const { data: messages } = await supabase
        .from("messages")
        .select("created_at, role")
        .eq("user_id", user.id)
        .gte("created_at", startDate);
      
      data["Chat Messages"] = messages?.length || 0;

      // Peak usage times
      if (messages && messages.length > 0) {
        const hourCounts: Record<number, number> = {};
        messages.forEach((m) => {
          const hour = new Date(m.created_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
        data["Peak Usage Times"] = peakHour ? `${peakHour[0]}:00 (${peakHour[1]} messages)` : "N/A";
        
        // Average duration estimate (messages per session)
        const sessCount = conversationCount || 1;
        data["Average Duration"] = `~${Math.round(messages.length / sessCount)} messages/session`;
      }

      // Memory entries
      const { count: memoryCount } = await supabase
        .from("user_memory")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startDate);
      data["Memory Entries"] = memoryCount || 0;

      // API Requests
      const { count: apiCount } = await supabase
        .from("api_usage")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startDate);
      data["API Requests"] = apiCount || 0;

      // Emotional patterns
      const { count: emotionCount } = await supabase
        .from("emotional_patterns")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("created_at", startDate);
      data["Emotional Patterns"] = emotionCount || 0;

      // Feature utilization
      data["Feature Utilization"] = `Chat: ${data["Chat Messages"]}, Memory: ${data["Memory Entries"]}, API: ${data["API Requests"]}`;
    }

    if (selectedReport === "performance") {
      // API usage stats
      const { data: apiUsage } = await supabase
        .from("api_usage")
        .select("status_code, tokens_used, created_at")
        .eq("user_id", user.id)
        .gte("created_at", startDate);

      const total = apiUsage?.length || 0;
      const errors = apiUsage?.filter((u) => u.status_code && u.status_code >= 400).length || 0;
      const totalTokens = apiUsage?.reduce((s, u) => s + (u.tokens_used || 0), 0) || 0;

      data["Response Time"] = "< 2s average (estimated)";
      data["Success Rate"] = total > 0 ? `${(((total - errors) / total) * 100).toFixed(1)}%` : "N/A";
      data["Error Rate"] = total > 0 ? `${((errors / total) * 100).toFixed(1)}%` : "0%";
      data["Token Usage"] = totalTokens.toLocaleString();
    }

    // Filter to only selected fields
    if (activeFields.length > 0) {
      const filtered: Record<string, any> = {};
      activeFields.forEach((f) => {
        if (data[f] !== undefined) filtered[f] = data[f];
      });
      return filtered;
    }

    return data;
  };

  const handleGenerateReport = async () => {
    const activeFields = Object.entries(selectedFields)
      .filter(([_, v]) => v)
      .map(([k]) => k);

    if (activeFields.length === 0) {
      toast.error("Please select at least one field");
      return;
    }

    setIsGenerating(true);
    try {
      const data = await fetchReportData();
      const report: GeneratedReport = {
        id: `report-${Date.now()}`,
        type: currentReport?.name || selectedReport,
        dateRange,
        format: exportFormat,
        createdAt: new Date().toISOString(),
        data,
        fields: activeFields,
      };

      const updated = [report, ...generatedReports].slice(0, 20);
      saveReports(updated);
      toast.success(`${currentReport?.name} generated successfully`);
    } catch (err) {
      toast.error("Failed to generate report");
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = (report: GeneratedReport) => {
    let content: string;
    let mimeType: string;
    let extension: string;

    if (report.format === "json") {
      content = JSON.stringify(report.data, null, 2);
      mimeType = "application/json";
      extension = "json";
    } else {
      // CSV
      const headers = Object.keys(report.data).join(",");
      const values = Object.values(report.data).map((v) => `"${v}"`).join(",");
      content = `${headers}\n${values}`;
      mimeType = "text/csv";
      extension = "csv";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `aurora-${report.type.toLowerCase().replace(/\s/g, "-")}-${new Date(report.createdAt).toISOString().split("T")[0]}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  const handleDeleteReport = (id: string) => {
    const updated = generatedReports.filter((r) => r.id !== id);
    saveReports(updated);
    toast.success("Report deleted");
  };

  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleEmailReport = async (report: GeneratedReport) => {
    if (!user?.email) {
      toast.error("No email address found. Please update your profile.");
      return;
    }

    setIsSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          to: user.email,
          reportType: report.type,
          reportData: report.data,
          dateRange: report.dateRange,
          format: report.format,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Report emailed to ${user.email}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("not configured")) {
        toast.error("Email service not configured yet. Please ask your admin to add the Resend API key.");
      } else {
        toast.error(`Failed to send email: ${msg}`);
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="p-6 overflow-auto max-w-6xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <FileText className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Reports</h1>
        </div>
        <p className="text-muted-foreground">
          Generate reports from your actual usage data and export them
        </p>
      </header>

      <Tabs defaultValue="generate" className="space-y-6">
        <TabsList>
          <TabsTrigger value="generate">Generate Report</TabsTrigger>
          <TabsTrigger value="history">Export History ({generatedReports.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-3">
            {AVAILABLE_REPORTS.map((report) => {
              const Icon = report.icon;
              const isSelected = selectedReport === report.id;
              return (
                <Card
                  key={report.id}
                  className={`cursor-pointer transition-all hover:border-primary/50 ${isSelected ? "border-primary bg-primary/5" : ""}`}
                  onClick={() => {
                    setSelectedReport(report.id);
                    setSelectedFields({});
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <CardTitle className="text-lg">{report.name}</CardTitle>
                    </div>
                    <CardDescription>{report.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1">
                      {report.fields.map((field) => (
                        <Badge key={field} variant="secondary" className="text-xs">{field}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {currentReport && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Configure {currentReport.name}
                </CardTitle>
                <CardDescription>Select data fields and time range</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> Date Range
                      </Label>
                      <Select value={dateRange} onValueChange={setDateRange}>
                        <SelectTrigger><SelectValue placeholder="Select range" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1d">Last 24 Hours</SelectItem>
                          <SelectItem value="7d">Last 7 Days</SelectItem>
                          <SelectItem value="30d">Last 30 Days</SelectItem>
                          <SelectItem value="90d">Last 90 Days</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Download className="h-4 w-4" /> Export Format
                      </Label>
                      <Select value={exportFormat} onValueChange={setExportFormat}>
                        <SelectTrigger><SelectValue placeholder="Select format" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="csv">CSV</SelectItem>
                          <SelectItem value="json">JSON</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <Label>Data Fields</Label>
                    <div className="space-y-2">
                      {currentReport.fields.map((field) => (
                        <div key={field} className="flex items-center space-x-2">
                          <Checkbox
                            id={field}
                            checked={selectedFields[field] || false}
                            onCheckedChange={() => handleFieldToggle(field)}
                          />
                          <Label htmlFor={field} className="text-sm font-normal cursor-pointer">{field}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex gap-3">
                  <Button onClick={handleGenerateReport} disabled={isGenerating} className="gap-2">
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                    {isGenerating ? "Generating..." : "Generate Report"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Export History</CardTitle>
              <CardDescription>View and download previously generated reports</CardDescription>
            </CardHeader>
            <CardContent>
              {generatedReports.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No reports yet</p>
                  <p className="text-sm">Generate a report to see it here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {generatedReports.map((report) => (
                    <div key={report.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{report.type}</span>
                          <Badge variant="secondary" className="text-xs">{report.format.toUpperCase()}</Badge>
                          <Badge variant="outline" className="text-xs">{report.dateRange}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(report.createdAt).toLocaleString()}
                        </p>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(report.data).map(([key, value]) => (
                            <div key={key} className="text-xs">
                              <span className="text-muted-foreground">{key}:</span>{" "}
                              <span className="font-medium">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4 shrink-0">
                        <Button variant="outline" size="sm" onClick={() => handleExport(report)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleEmailReport(report)} disabled={isSendingEmail}>
                          {isSendingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteReport(report.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

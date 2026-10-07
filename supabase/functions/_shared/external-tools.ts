// External tools for Gemini function-calling.
//
// Three tools available to Gemini when it decides it needs external
// information to answer a question:
//  1. web_search     — Tavily search API
//  2. read_page      — Firecrawl page reader
//  3. read_github_file — GitHub API (PAT-auth) for raw file content
//
// Tool definitions are Gemini function-calling schema. When Gemini returns
// a functionCall in generateContent, the caller executes the tool and feeds
// the result back via a second generateContent call.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const GITHUB_PAT = Deno.env.get("GITHUB_PAT") ?? "";

/** Tool definitions in Gemini function-calling format. */
export const TOOLS = [
  {
    type: "function",
    name: "web_search",
    description: "Search the web for current information. Use when the user asks about recent events, news, prices, or anything that may have changed since the model's training data. Returns search results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific and natural — what would you type into a search engine?",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "read_page",
    description: "Fetch the full text content of a single web page. Use when the user wants details from a specific URL, or when web_search returned a promising URL worth reading in full. Returns the cleaned text content of the page.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the page to read. Must be a valid http:// or https:// URL.",
        },
      },
      required: ["url"],
    },
  },
  {
    type: "function",
    name: "read_github_file",
    description: "Read the raw contents of a single file from a GitHub repository. Use when the user asks about code in a specific repo — file contents, READMEs, configs, source files. Returns the raw file text (truncated to 8000 chars if larger).",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "GitHub username or organisation that owns the repo (e.g. 'facebook', 'vercel').",
        },
        repo: {
          type: "string",
          description: "Repository name without the owner (e.g. 'next.js', 'react').",
        },
        path: {
          type: "string",
          description: "Path to the file within the repo, including filename (e.g. 'packages/next/src/next.ts'). Use '/' for the root README.md.",
        },
        ref: {
          type: "string",
          description: "Git ref to read from — branch name, tag, or commit SHA. Defaults to 'main' if omitted.",
        },
      },
      required: ["owner", "repo", "path"],
    },
  },
] as const;

/** Execute a single tool call and return the result text for Gemini. */
export async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  switch (name) {
    case "web_search": {
      if (!TAVILY_API_KEY) return "ERROR: Tavily API key not configured.";
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({ query: args.query, include_answer: !!args.include_answer, max_results: 5 }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: Tavily search failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({})) as Any;
      const results = data.results ?? [];
      const answer = data.answer ?? "";
      if (answer) {
        return `Web search answer: ${answer}\n\nSources:\n${results.map((r: Any) => `• ${r.title} — ${r.url}`).join("\n")}`;
      }
      if (results.length === 0) return "Web search returned no results.";
      return `Search results:\n${results.map((r: Any) => {
        const snippet = r.snippet ?? "";
        return `• ${r.title} (${r.url})\n  ${snippet.slice(0, 400)}`;
      }).join("\n\n")}`;
    }

    case "read_page": {
      if (!FIRECRAWL_API_KEY) return "ERROR: Firecrawl API key not configured.";
      const res = await fetch(
        "https://api.firecrawl.dev/v1/scrape",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url: args.url,
            formats: ["text"],
            onlyMainContent: true,
            waitFor: 2000,
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: Firecrawl failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({})) as Any;
      const html = data.data?.text ?? data.data?.html ?? data.text ?? data.html ?? data.content ?? "";
      const text = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!text) return "Firecrawl returned empty page content.";
      return text.length > 8000
        ? text.slice(0, 8000) + `\n\n[Truncated — page was ${text.length} chars total.]`
        : text;
    }

    case "read_github_file": {
      if (!GITHUB_PAT) return "ERROR: GitHub PAT not configured.";
      const { owner, repo, path: filePath, ref = "main" } = args;
      const encodedPath = encodeURIComponent(filePath);
      const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${GITHUB_PAT}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (res.status === 404) {
        return `ERROR: File not found at https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: GitHub API failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({})) as Any;
      if (data.content) {
        const decoded = atob(data.content);
        return decoded.length > 8000
          ? decoded.slice(0, 8000) + `\n\n[Truncated — file was ${decoded.length} chars total. Path: ${filePath} in ${owner}/${repo}]`
          : decoded;
      }
      return `ERROR: Unexpected GitHub response format.`;
    }

    default:
      return `ERROR: Unknown tool "${name}".`;
  }
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUser, isAuthResponse, corsHeaders } from "./_shared/auth.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (isAuthResponse(auth)) return auth;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Email service not configured. Please add RESEND_API_KEY." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { to, reportType, reportData, dateRange, format } = await req.json();

    if (!to || !reportType || !reportData) {
      return new Response(JSON.stringify({ error: "Missing required fields: to, reportType, reportData" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email HTML
    const dataRows = Object.entries(reportData)
      .map(([key, value]) => `
        <tr>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #374151;">${key}</td>
          <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; color: #6b7280;">${String(value)}</td>
        </tr>
      `)
      .join("");

    const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Aurora Report</h1>
          <p style="color: #e0e7ff; margin: 8px 0 0; font-size: 14px;">${reportType} • ${dateRange || "Custom Range"}</p>
        </div>
        <div style="padding: 24px;">
          <p style="color: #374151; font-size: 15px; line-height: 1.6;">
            Here's your generated <strong>${reportType}</strong> report from Aurora.
          </p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 12px 16px; text-align: left; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Metric</th>
                <th style="padding: 12px 16px; text-align: left; font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${dataRows}
            </tbody>
          </table>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
            Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} by Aurora AI Companion
          </p>
        </div>
        <div style="background: #f9fafb; padding: 16px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">Aurora • Your AI Companion</p>
        </div>
      </div>
    </body>
    </html>`;

    // Also create a text/csv attachment if format is csv
    let attachments: any[] | undefined;
    if (format === "csv") {
      const csvHeaders = Object.keys(reportData).join(",");
      const csvValues = Object.values(reportData).map((v) => `"${String(v)}"`).join(",");
      const csvContent = `${csvHeaders}\n${csvValues}`;
      const encoded = btoa(csvContent);
      attachments = [{
        filename: `aurora-${reportType.toLowerCase().replace(/\s/g, "-")}-report.csv`,
        content: encoded,
        type: "text/csv",
      }];
    } else if (format === "json") {
      const jsonContent = JSON.stringify(reportData, null, 2);
      const encoded = btoa(jsonContent);
      attachments = [{
        filename: `aurora-${reportType.toLowerCase().replace(/\s/g, "-")}-report.json`,
        content: encoded,
        type: "application/json",
      }];
    }

    const emailPayload: any = {
      from: "Aurora Reports <onboarding@resend.dev>",
      to: [to],
      subject: `Aurora ${reportType} Report - ${new Date().toLocaleDateString()}`,
      html: htmlBody,
    };

    if (attachments) {
      emailPayload.attachments = attachments;
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend error:", resendData);
      return new Response(JSON.stringify({ error: "Failed to send email", details: resendData }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Send report email error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

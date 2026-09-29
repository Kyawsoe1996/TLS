// supabase/functions/gemini/index.ts
//
// Secure server-side proxy to the Google Gemini API.
// The browser calls THIS function; the function holds GEMINI_API_KEY as a server-side
// secret and never exposes it to the client. (Google: "Do not hardcode API keys in web
// apps... run a backend proxy server to make the actual API calls.")
//
// Set the secret in Lovable Cloud (Settings → Secrets), or with the Supabase CLI:
//   supabase secrets set GEMINI_API_KEY=your_key
//
// Frontend usage (from the Lovable-generated app):
//   const { data } = await supabase.functions.invoke("gemini", {
//     body: { kind: "marketing", fields: { occasion: "Eid sale", tone: "festive", service: "bespoke suits" } },
//   });
//   // data.text  → markdown to render

import { GoogleGenAI } from "npm:@google/genai";

// Current fast/cheap stable model. Verify the exact ID is still live in AI Studio before a demo.
const MODEL = "gemini-3.1-flash-lite";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Prompt templates live SERVER-SIDE so the frontend only sends structured fields.
function buildPrompt(kind: string, fields: Record<string, unknown>): string {
  const shop = (fields.shopName as string) || "a bespoke tailor shop";
  switch (kind) {
    case "marketing":
      return [
        `You are a social-media marketer for ${shop}.`,
        `Write content for this campaign:`,
        `- Occasion/season: ${fields.occasion ?? "general promotion"}`,
        `- Tone: ${fields.tone ?? "warm and professional"}`,
        `- Featured service/product: ${fields.service ?? "custom tailoring"}`,
        ``,
        `Return clean markdown with exactly these sections:`,
        `## Social Post`,
        `## Short Caption`,
        `## 3 Campaign Ideas`,
        `Keep it punchy and ready to publish. Add 3-5 relevant hashtags in the post.`,
      ].join("\n");

    case "seo":
      return [
        `You are an SEO copywriter for ${shop}.`,
        `Target keyword/topic: ${fields.keyword ?? "custom tailoring near me"}`,
        `City/area for local SEO: ${fields.city ?? "the local area"}`,
        ``,
        `Return clean markdown with:`,
        `## SEO Blog Intro (120-160 words)`,
        `## 3 Meta Descriptions (max 155 chars each)`,
        `## 5 Long-tail Keyword Suggestions`,
      ].join("\n");

    case "insights":
      return [
        `You are a business analyst for ${shop}. Give plain-English advice from these figures.`,
        `Data: ${JSON.stringify(fields.data ?? {})}`,
        ``,
        `Return clean markdown with:`,
        `## 2 Growth Recommendations`,
        `## 1 Risk to Watch`,
        `Each point: one bold headline + one sentence of why, specific to the numbers.`,
      ].join("\n");

    case "engagement":
      return [
        `Write a short, warm re-engagement email for ${shop} to a past customer who hasn't visited in a while.`,
        `Customer name: ${fields.customerName ?? "there"}`,
        `Tone: friendly and personal; gently invite them back, maybe hint at a returning-customer perk.`,
        ``,
        `Return ONLY the email body (60-90 words, no subject line), ready to send.`,
      ].join("\n");

    case "benchmark":
      return [
        `You are a business analyst for ${shop}. Compare this shop to anonymized industry averages.`,
        `Data: ${JSON.stringify(fields.data ?? {})}`,
        ``,
        `Return clean markdown with:`,
        `## Where you lead`,
        `## Where you lag`,
        `## 2 Actions to close the gap`,
        `Reference the specific numbers.`,
      ].join("\n");

    case "report":
      return [
        `Write a concise monthly performance summary for ${shop} for a non-technical owner.`,
        `Data: ${JSON.stringify(fields.data ?? {})}`,
        ``,
        `Return clean markdown: a 2-3 sentence headline, then "## Highlights" (3 bullets) and "## Focus next month" (2 bullets).`,
      ].join("\n");

    default:
      // Fallback: caller may pass a raw prompt as fields.prompt.
      return (fields.prompt as string) || "Say hello to a tailor shop owner.";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY secret is not set");

    const body = await req.json().catch(() => ({}));
    const kind = (body.kind as string) ?? "raw";
    const fields = (body.fields as Record<string, unknown>) ?? body ?? {};
    const prompt = buildPrompt(kind, fields);

    const ai = new GoogleGenAI({ apiKey });
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
    });

    return new Response(JSON.stringify({ text: res.text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

# Client Demo Script & Pre-Flight Checklist

A 5–7 minute walkthrough that makes the prototype feel like a real product. Lead with the
strongest "wow" and keep mocked areas moving quickly.

## Walkthrough order

1. **Log in** (10s) — "Each tailor shop gets their own secure account." Real auth.
2. **AI Marketing** (90s) — *the hook.* Type `Eid sale` / tone `festive` / service
   `bespoke suits` → Generate → a real, publish-ready post + caption + 3 campaign ideas
   appear live. "This is real AI, generated on the spot for their shop."
3. **AI Insights** (60s) — Generate → 2 plain-English growth recommendations + 1 risk,
   computed from the shop's own numbers. "The platform reads their data and tells them
   what to do next."
4. **Analytics** (60s) — revenue trend, new vs returning customers, campaign ROI. "Every
   decision is backed by their real numbers." *(Seeded demo data — don't dwell on exact
   figures.)*
5. **SEO** (45s) — keyword ranking cards + live "Generate SEO blog intro." "Get found on
   Google and fill the content gap automatically." *(Rankings are sample data.)*
6. **Close** (30s) — "Today it's a working prototype on free infrastructure. With your
   go-ahead we connect real data sources and scale it." Hand them the live link.

## Pre-flight checklist (run 1 hour before)

- [ ] Live `*.lovable.app` URL opens in an **incognito** window; signup/login works.
- [ ] AI Marketing returns text within a few seconds (confirms key + edge function + model).
- [ ] AI Insights and SEO buttons return text.
- [ ] Analytics charts render — no empty states.
- [ ] DevTools → Network/Sources: `GEMINI_API_KEY` is **not** present client-side.
- [ ] Make ~5 AI calls in a row at demo pace — no rate-limit errors.
- [ ] Open the link on your **phone** — responsive layout holds.
- [ ] Have 2–3 pre-tested prompt examples ready (don't improvise on stage).
- [ ] Backup: a short screen-recording of the AI flow, in case Wi-Fi/quotas misbehave.

## Free-tier caveats to manage (decide before the meeting)

1. **EU / UK / Switzerland:** Gemini's free tier may **not legally serve end users** in
   the EEA, UK, or Switzerland — that needs billing enabled. Fine for a you-driven demo;
   flag it for production if the shops are in those regions.
2. **No real client data on free tier:** free-tier prompts are **used for training and may
   be human-reviewed**. Use only the fictional demo shop — no real customer PII or
   confidential briefs.
3. **Rate limits are modest** (low double-digit requests/min). Great for a live demo, not
   for load — don't stress-test on stage.
4. **Verify live before the pitch:** exact model ID string, current free RPM/RPD in AI
   Studio, and that Lovable's free credit amounts haven't changed.

## If they say yes (next steps to mention)

- Connect real data: Google Search Console + GA4 (free), social posting via Meta Graph /
  Buffer free tier.
- Move off free Gemini (enable billing) for EU/UK users and to stop training-on-data.
- Harden the edge function with per-user rate limiting (Supabase + Upstash Redis free tier).

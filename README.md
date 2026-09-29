# TLS — AI Growth Platform for Tailor Shops

One repository, two products that share the same idea: an AI assistant that helps bespoke
tailor shops grow (marketing content, local SEO, fittings with AI cutter notes, win-back emails).

| Folder | What it is | Start here |
|---|---|---|
| [`web/`](web/) | The web app: **Next.js + Supabase + Gemini**. Runs in the browser, includes the client demo. | `web/README.md` |
| [`mobile/`](mobile/) | The phone app (**Expo / React Native**) and its own API (**Cloudflare Workers + Turso + Clerk + Gemini**), plus store-release docs. | `mobile/README.md` |

The two apps are independent: separate dependencies, databases and logins. They only share
the product concept and the AI prompt ideas.

## Quick start

```bash
# Web app
cd web && npm install && cp .env.example .env.local && npm run dev     # http://localhost:3000

# Mobile app (API + Expo) — see mobile/README.md for the keys you need first
cd mobile/api && npm run dev                                           # API on http://localhost:8787
cd mobile/app && npx expo start                                        # then press i (iPhone) or a (Android)
```

In Claude Code, `/start-mobile` and `/stop-mobile` start and stop the whole mobile setup.

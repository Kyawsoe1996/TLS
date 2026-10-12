-- TLS mobile API - AI consent: when the owner agreed to send client details to Google Gemini.
-- NULL until POST /shop/ai-consent; the /ai/* routes refuse (403 consent_required) while it is NULL.
ALTER TABLE shops ADD COLUMN ai_consent_at TEXT;

A full-stack chatbot that helps insurance agents instantly check
underwriting eligibility across 14+ Medicare Supplement carriers.
Agents describe a client scenario in plain English and get per-carrier
verdicts (accept / conditional / decline) with citations back to the
source PDF page and section.

STACK
- Next.js 16 (App Router) on Vercel
- Supabase (Postgres + Auth + Storage + RLS)
- Tailwind CSS + shadcn/ui
- AI: provider-agnostic abstraction (OpenAI + Anthropic adapters)
- PDF extraction: Marker via Datalab API with structured JSON schemas
- PWA-ready with service worker + manifest

AGENT-FACING PRODUCT
- Single-screen chat interface at /chat — no dashboard, no sidebar
- NPN-based auth: signup with NPN, cross-project lookup against
  Project Atlas agents table; free for Brock agents, paywall stub
  for external agents
- Natural language queries: "65yo female in TX, atrial fibrillation,
  takes Eliquis" returns rich inline result cards per carrier
- Guided intake mode: bot asks structured questions step-by-step
- Rich results: knockout flags, confidence scores, lookback periods,
  conditional warnings, citations (doc + page + effective date)
- Carrier comparison view
- Conversation context persists for follow-up questions
- Persistent disclaimer banner on every response
- Embed mode: /chat?embed=true strips chrome for iframe in GoGuruX
- JS widget script (widget.js) for drop-in embedding

ADMIN INGESTION PIPELINE
- PDF upload UI with carrier/doc-type tagging to Supabase Storage
- Marker + AI extraction: PDF -> markdown -> 3x structured JSON
  extraction (knockout conditions, drug-condition mappings,
  process/state/BMI rules) with citation tracking
- AI normalization for edge cases and ambiguous language
- Admin review UI: pending rules table, inline editing, approve/reject
- Version tracking with full diff engine for re-ingestion
- Staleness dashboard (10/12 month thresholds)
- Batch ingest script for all 31 existing UW guide PDFs
- Carrier directory management (add/edit, state availability)

DATABASE SCHEMA (Supabase Postgres)
- carriers, source_documents, rules, drug_rules
- profiles (NPN, role, subscription_tier, is_brock_agent)
- conversations + messages (with structured_query + results JSONB)
- rule_versions (full audit trail on every rule change)
- audit_logs (user actions, resource tracking, IP logging)
- RLS policies throughout; admin-only access on sensitive tables

QUERY ENGINE
- AI parses natural language to structured query (conditions, meds,
  state, age, height/weight)
- Postgres rules search with fuzzy matching + carrier resolution
- Confidence scoring and result ranking
- AI explains results with per-carrier "why" bullets and citations
- Drug cross-reference against drug_rules table

PRIVACY & COMPLIANCE
- Ephemeral prompt storage: PHI auto-purges after 90 days via
  purge_expired_phi() Postgres function + cron endpoint
- Server-side AI only — no client-side API keys
- PHI-free audit logging
- Every response includes non-dismissable disclaimer

CARRIERS INCLUDED (UW guides ingested)
Aetna, Anthem, Atlantic Capital, Bankers Fidelity, Healthspring,
Humana, INA, Liberty Bankers, Lifeshield, MOO, Medico,
Physicians Mutual, UHC, Wellabe

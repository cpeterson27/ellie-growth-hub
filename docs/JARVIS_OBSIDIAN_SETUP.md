# Jarvis + Obsidian setup

Jarvis can work immediately from verified Growth Operator data. OpenAI-written replies, live public-web research, and Obsidian memory are explicit opt-ins, so no customer or campaign information is sent to OpenAI or written to disk until you turn either on.

## 1. Create the vault

In Obsidian, choose **Create new vault** and name it `Growth Operator Command Center`. Existing vaults may keep their current folder name; the product-facing name remains Growth Operator.

Create these folders:

```text
00 Dashboard/
01 Inbox/
01 Inbox/Jarvis Conversations/
02 Campaigns/
03 Contacts & ICP/
04 Partners & Affiliates/
05 Offers & Programs/
06 Marketing Channels/
07 SOPs/
08 Decisions/
09 Archive/
```

Use them as follows:

- `00 Dashboard`: your weekly priorities and active campaigns.
- `01 Inbox/Jarvis Conversations`: created automatically when memory is enabled; do not move this folder.
- `02 Campaigns`: one note per campaign, offer, message angle, and result.
- `03 Contacts & ICP`: ideal-customer profiles, segments, exclusions, and research notes. Do not copy full contact exports here.
- `04 Partners & Affiliates`: partner agreements, affiliate codes, follow-up notes, and referral ideas.
- `05 Offers & Programs`: the $15k program promise, qualification criteria, FAQs, and approved positioning.
- `06 Marketing Channels`: channel plans for Eventbrite, Skool, social platforms, and communities.
- `07 SOPs`: repeatable playbooks Jarvis should follow.
- `08 Decisions`: approved decisions with date, owner, and why.
- `09 Archive`: completed or retired notes.

## 2. Add the environment variables

In `backend/.env`, set the absolute vault path and explicitly opt in:

```dotenv
OBSIDIAN_VAULT_PATH=/absolute/path/to/Ellie AI Command Center
OBSIDIAN_WORKSPACE_ID=the-workspace-object-id-bound-to-this-vault
JARVIS_OBSIDIAN_MEMORY_ENABLED=true
```

Jarvis reads matching approved Markdown notes from the Dashboard, Campaigns, Contacts & ICP, Partners & Affiliates, Offers & Programs, Marketing Channels, SOPs, and Decisions folders before answering. Routine chat history is stored as a workspace/user-scoped Growth Operator conversation, not appended to Obsidian. Only an explicitly prepared and confirmed business memory is written to the vault. Jarvis never reads or writes outside the configured vault path or for a workspace other than `OBSIDIAN_WORKSPACE_ID`. Disable it at any time with `JARVIS_OBSIDIAN_MEMORY_ENABLED=false`.

Do not add `JARVIS_OBSIDIAN_MEMORY_PATH`; the application uses `OBSIDIAN_VAULT_PATH` only.

## 3. Turn on OpenAI only when ready

```dotenv
OPENAI_API_KEY=your_key_here
JARVIS_OPENAI_ENABLED=true
JARVIS_OPENAI_MODEL=gpt-4.1-mini
JARVIS_RESEARCH_OPENAI_MODEL=gpt-5.6-sol
JARVIS_TTS_MODEL=gpt-4o-mini-tts
```

`JARVIS_OPENAI_MODEL` remains the lower-cost model for ordinary workspace summaries. `JARVIS_RESEARCH_OPENAI_MODEL` performs evidence-backed public-web lead research through the Responses API web-search tool.

With `JARVIS_OPENAI_ENABLED=false`, Jarvis continues using verified Growth Operator workspace summaries and does not call OpenAI. With it enabled, Jarvis can search public sources, display supported decision-makers and their evidence directly in its conversation, and speak replies with the selected OpenAI voice. Users choose individual people (or select all new people) before the separate two-step approval on the same page. Research and import never send outreach.

## 4. Recommended first notes

Create these three notes before using Jarvis for strategy:

- `05 Offers & Programs/$15k Program.md`: offer, price, ideal buyer, proof, objections, CTA, enrollment link.
- `03 Contacts & ICP/Ideal Client Profiles.md`: event buyer versus $15k program buyer, exclusion criteria, and positioning.
- `07 SOPs/Lead Generation.md`: sources Jarvis may recommend, review rules, import approval rules, and outreach guardrails.

Jarvis’s configuration status is available from `GET /api/jarvis/status`; the response deliberately never exposes keys or your vault path.

## 5. Free voice controls

Jarvis uses the browser's built-in speech synthesis by default, so no ElevenLabs account or API key is needed. Choose one of the voices listed beneath the Jarvis prompt, then use **Speak** on a Jarvis response. If your browser supports speech recognition, **Talk** fills the prompt from your microphone; your browser may request microphone permission.

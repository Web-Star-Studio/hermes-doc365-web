# Hermes + Doc365 Portal Integration Guide

## Goal

Make the current **Doc365 web portal** act as the primary interface/channel for Hermes, using the existing architecture:

- `web/` = auth, DB, uploads, approvals, audit, UI
- `adapter/` = thin Hermes runner over HTTP/SSE
- Hermes = the actual reasoning and tool-using agent

This guide answers the key decision first:

> **Should the portal act as a channel itself, or should it connect to the Hermes gateway?**

## Short answer

**Use the portal itself as the channel. Do not make the web portal depend on the Hermes gateway for the core MVP.**

Your current architecture is the correct one:

```text
Browser UI → Next.js web app → FastAPI adapter → Hermes AIAgent
```

The Hermes **gateway** is useful for messaging platforms such as Telegram, Discord, Slack, WhatsApp, etc. It is **not** the best primary runtime for this portal, because your portal already owns the things that a serious product must own:

- login and user identity
- conversation persistence
- file upload lifecycle
- approval gates
- audit trail
- operator/admin UI

If you route the portal through the Hermes gateway, you will create unnecessary duplication and awkward coupling around:

- sessions
- file handling
- approvals
- app auth
- UI state
- action auditing

## Recommended architecture

Keep this:

```text
[User in browser]
    ↓
[Next.js web app]
    - Auth.js login
    - Postgres conversation/message/file/action models
    - MinIO/S3 uploads
    - approval modal
    - admin/operator UI
    - SSE re-stream to browser
    ↓ HMAC-signed envelope
[FastAPI adapter]
    - verify signature
    - materialize uploaded files to local temp paths
    - build Hermes prompt/context
    - instantiate AIAgent
    - stream progress + final answer
    ↓
[Hermes AIAgent]
    - reads files
    - reasons over billing workflow
    - uses tools
    - performs allowed actions
```

---

# 1. What the portal should be in Hermes terms

Treat the portal as a **first-party Hermes channel**.

That means:

- the user interacts with **your UI**, not with Hermes CLI or a messaging bot
- your UI/server prepare the conversation context
- your adapter invokes Hermes directly
- your app persists the authoritative state
- Hermes is the execution engine behind the portal

This is conceptually the same as a “channel”, but **implemented in your product**, not via the generic Hermes gateway layer.

## Why this is the right choice

Because your portal needs product-specific behavior that the gateway is not designed to own:

1. **Auth and tenancy**
   - portal users log in to your app
   - gateway is designed around platform identities, not your app’s internal user model

2. **Uploads**
   - portal needs a first-class file lifecycle
   - gateway supports incoming files from platforms, but that is not the same as your upload flow

3. **Approvals**
   - your app needs explicit confirmation for side-effect actions
   - gateway approvals are designed for command confirmation, not your product’s audit model

4. **Auditability**
   - your app must record action requests, approvals, execution results
   - this belongs in your DB and UI

5. **UX**
   - your app needs conversation view, quick actions, file panel, operator panel
   - gateway does not replace that

---

# 2. When the Hermes gateway is still useful

You still **may** want the Hermes gateway later, but as a **secondary delivery surface**, not as the main portal backend.

Good future uses for gateway mode:

- Telegram/Slack notifications
- operator alerts
- async summaries sent to a private channel
- a secondary bot interface for internal staff
- webhook-based automation triggers

Bad use for gateway mode in this product’s MVP:

- primary chat runtime for the portal
- primary file-ingestion path
- primary session model
- primary approval system

---

# 3. Current repo direction: correct

Your current repo is already aligned with the right approach.

## Current shape

- `web/` owns state and UX
- `adapter/` wraps Hermes over `/chat` and `/chat/stream`
- requests are HMAC-signed
- files are uploaded to S3-compatible storage and materialized locally before Hermes runs
- action requests and approval state are stored in Postgres

That is the right backbone.

The main job now is **not** to redesign the architecture. It is to **make the Hermes integration explicit and stable**.

---

# 4. The most important implementation decision

## Do not depend on implicit Hermes defaults

Right now, your adapter creates Hermes with a very lightweight pattern and relies on best-effort compatibility.

That is acceptable as a scaffold, but to make the portal actually work reliably, you should explicitly control:

- provider
- API key
- model
- toolsets enabled
- toolsets disabled
- session behavior
- progress callbacks
- system prompt injection
- timeout/iteration behavior

This is the most important thing to fix.

---

# 5. Recommended integration contract

## 5.1 The web app remains source of truth

The web app should remain authoritative for:

- users
- organizations
- conversations
- messages
- uploaded files
- action requests
- approvals
- audit events

Hermes should **not** become the source of truth for those entities.

## 5.2 The adapter remains stateless per request

The adapter should:

- accept a signed envelope
- verify it
- fetch/materialize files
- build the Hermes execution context
- run Hermes once
- stream results back
- return structured output to the web app

## 5.3 Hermes should receive a complete per-turn envelope

Each request to Hermes should contain:

- `conversation_id`
- authenticated user info
- organization info
- recent history
- uploaded file references
- action origin
- approval state
- action request id
- idempotency key

Your current design already follows this well.

---

# 6. Recommended runtime model for Hermes in this portal

## Recommended model

**One fresh `AIAgent` instance per request**, inside the adapter, executed in a bounded thread pool.

This matches the current repo direction and is the safest MVP choice because `AIAgent` is synchronous and not thread-safe across shared instances.

## Why not reuse one agent instance across requests?

Because for MVP it creates unnecessary risk around:

- cross-user leakage
- threading issues
- prompt caching confusion
- inconsistent session state

Later you can optimize. Right now, correctness matters more.

---

# 7. What to change in the current code right now

These are the concrete changes I recommend before calling the Hermes integration “real”.

## 7.1 Make `AIAgent(...)` explicit in `adapter/src/adapter/hermes_runner.py`

### Current issue
Right now the adapter effectively does:

```python
agent = AIAgent()
```

and then tries to set attributes like:

- `conversation_history`
- `ephemeral_system_prompt`
- callbacks

This is too implicit for production behavior.

### Recommended change
Create a helper like `_build_agent(...)` and pass the important fields explicitly.

Example shape:

```python
from run_agent import AIAgent

def _build_agent(req, settings, files, *, step_cb=None, tool_progress_cb=None):
    return AIAgent(
        provider=settings.hermes_model_provider,
        api_key=settings.hermes_api_key,
        model=settings.hermes_model,
        base_url=settings.hermes_base_url or None,
        api_mode=settings.hermes_api_mode or None,
        max_iterations=settings.hermes_max_iterations,
        enabled_toolsets=settings.hermes_enabled_toolsets,
        disabled_toolsets=settings.hermes_disabled_toolsets,
        quiet_mode=True,
        verbose_logging=False,
        save_trajectories=False,
        ephemeral_system_prompt=_build_system_prompt(req, files),
        session_id=req.conversation_id,
        platform="api_server",
        persist_session=False,
        step_callback=step_cb,
        tool_progress_callback=tool_progress_cb,
        skip_context_files=False,
        skip_memory=False,
    )
```

### Why this matters
This gives you deterministic control over:

- which model is really used
- which toolsets are available
- which callbacks are wired
- whether Hermes persists its own internal session state

---

## 7.2 Add missing Hermes runtime settings to `adapter/src/adapter/config.py`

Your current settings include:

- provider
n- API key
- model
- `HERMES_HOME`

But for a real portal integration, add:

- `HERMES_BASE_URL`
- `HERMES_API_MODE`
- `HERMES_MAX_ITERATIONS`
- `HERMES_ENABLED_TOOLSETS`
- `HERMES_DISABLED_TOOLSETS`
- optionally `HERMES_QUIET_MODE`

### Suggested additions

```python
hermes_base_url: str = Field(default="", alias="HERMES_BASE_URL")
hermes_api_mode: str = Field(default="", alias="HERMES_API_MODE")
hermes_max_iterations: int = Field(default=40, alias="HERMES_MAX_ITERATIONS")
hermes_enabled_toolsets_raw: str = Field(default="", alias="HERMES_ENABLED_TOOLSETS")
hermes_disabled_toolsets_raw: str = Field(default="clarify,messaging,tts", alias="HERMES_DISABLED_TOOLSETS")
```

And add helper properties that split comma-separated values into arrays.

---

## 7.3 Disable unsupported tool flows at first

This is critical.

### Important note
If Hermes has access to tools that require interaction patterns your portal does not yet support, the run will be brittle.

### Toolsets to disable initially
At minimum, I recommend disabling:

- `clarify`
- `messaging`
- `tts`
- `cronjob`

Potentially also disable until intentionally needed:

- `delegation`
- `image_gen`
- `homeassistant`

### Why disable `clarify`
The current portal does **not** expose a tool-level clarify callback/interrupt cycle equivalent to Hermes CLI/gateway clarification.

If Hermes tries to call `clarify`, the result will likely be degraded or error-prone.

### Better MVP behavior
For now, Hermes should ask the user questions in ordinary assistant text, and the portal should treat the next user turn as the answer.

### Recommended enabled toolsets for MVP
A good starting set would be something like:

- `file`
- `browser`
- `terminal`
- `web`
- `search`
- `vision`
- `memory`
- `session_search`
- `skills`
- `todo`
- `code_execution`

Use a stricter subset if you want tighter control.

---

## 7.4 Decide whether Hermes native session persistence should be on or off

## Recommendation for now
Use:

- `session_id=req.conversation_id`
- `persist_session=False`

### Why
Because the portal already persists the authoritative history in Postgres and re-sends recent history in the envelope.

That keeps the architecture simple:

- web DB = source of truth
- Hermes = execution engine

### When to turn `persist_session=True`
Only if you explicitly want Hermes-native session artifacts for:

- native session recall
- deeper trajectory persistence
- debugging in Hermes session storage

For MVP, I would keep it off.

---

## 7.5 Keep the portal’s approval model authoritative

Your current architecture is right:

1. user requests action
2. app creates `action_request`
3. user approves
4. app sends the approved request to adapter
5. adapter re-checks approval state
6. Hermes executes only if approved

Keep this exactly.

Do **not** delegate approval semantics to Hermes or gateway state.

---

# 8. Should you connect this to the Hermes gateway API/server/webhook instead?

## Short answer
**Not for the main portal path.**

## Why not
Hermes gateway/API-server/webhook modes are useful generic entry points, but your app already needs a product-specific execution layer.

If you re-route the portal through generic gateway plumbing, you will have to translate back and forth between:

- portal auth
- gateway session identity
- portal file lifecycle
- gateway file semantics
- portal action approvals
- gateway command approvals
- portal audit trail
- gateway transcript/session model

That adds complexity without giving you meaningful product value.

## Better interpretation
Your `adapter/` is already the correct “Hermes integration surface”.

In other words:

- **portal acts as the channel**
- **adapter is the bridge**
- **gateway remains optional for other interfaces**

---

# 9. Exact request lifecycle the portal should use

## 9.1 Standard chat turn

1. user sends message from UI
2. web app persists user message
3. web app loads recent history + completed file refs
4. web app builds envelope
5. web app signs envelope with HMAC
6. web app sends envelope to adapter `/chat/stream`
7. adapter verifies signature
8. adapter materializes files to local temp dir
9. adapter creates `AIAgent`
10. Hermes runs
11. adapter streams step/tool/message/done events
12. web app forwards SSE to browser
13. web app persists final assistant message

## 9.2 Side-effect action turn

1. user clicks action button
2. web app creates `action_request`
3. if approval required, show modal
4. on approval, mark action request approved
5. send next turn with:
   - `action_origin`
   - `approval_state='granted'`
   - `action_request_id`
   - `idempotency_key`
6. adapter re-checks approval + feature flag
7. Hermes executes only if allowed
8. web app persists execution audit info

This is the right pattern.

---

# 10. Concrete environment variables to add/update

Add these to `infra/.env.example` and the adapter runtime.

```dotenv
# Existing
HERMES_MODEL_PROVIDER=openai
HERMES_API_KEY=
HERMES_MODEL=gpt-4o-mini
HERMES_HOME=/hermes-data

# Recommended additions
HERMES_BASE_URL=
HERMES_API_MODE=
HERMES_MAX_ITERATIONS=40
HERMES_ENABLED_TOOLSETS=file,browser,terminal,web,search,vision,memory,session_search,skills,todo,code_execution
HERMES_DISABLED_TOOLSETS=clarify,messaging,tts,cronjob
```

If you are routing via OpenRouter or another provider, set the provider/model/base URL combination explicitly.

---

# 11. Recommended code structure inside the adapter

## 11.1 Add an explicit builder in `hermes_runner.py`

Implement these helper functions:

- `_build_agent(...)`
- `_normalize_reply(...)`
- `_history_to_hermes(...)`
- `_build_system_prompt(...)`

You already have some of these; the missing piece is a stronger `_build_agent(...)`.

## 11.2 Streaming and non-streaming should share the same agent construction logic

Avoid separate implicit setup in two places.

Both `_run_chat_sync(...)` and `_run_chat_streaming_sync(...)` should call the same builder.

---

# 12. How to think about files in Hermes

Hermes tools generally work best with **local file paths**.

Your current design is good:

- store uploads in S3-compatible storage
- materialize them to a temp directory before the Hermes turn
- inject local paths into the Hermes system prompt/context

That is the right bridge.

## Keep this behavior
Do not try to make Hermes read presigned URLs directly for the MVP.

Local materialization is simpler and more reliable.

---

# 13. How to think about memory and session search

## Memory
Hermes memory is useful for:

- stable user preferences
- stable domain knowledge
- durable conventions

That should remain enabled.

## Session search
Session search is useful only if Hermes session persistence is actually being written somewhere meaningful.

### Recommendation
For MVP:
- keep `memory` enabled
- treat `session_search` as optional
- if it proves noisy or empty, disable it until you intentionally wire Hermes-side session persistence

---

# 14. Recommended MVP-safe tool policy

If the goal is to get this working **right now**, do not expose every Hermes capability on day 1.

## Suggested first-pass tool profile

### Enable
- `file`
- `browser`
- `terminal`
- `web`
- `search`
- `vision`
- `memory`
- `skills`
- `todo`
- `code_execution`

### Disable
- `clarify`
- `messaging`
- `tts`
- `cronjob`
- `delegation` (optional for now)
- `image_gen`
- `homeassistant`

This reduces integration surprises.

---

# 15. Recommended execution checklist

## Phase A — make Hermes runtime explicit

1. add adapter settings for provider/model/base_url/toolsets/max_iterations
2. build `AIAgent(...)` with explicit constructor args
3. disable unsupported toolsets
4. keep `session_id=req.conversation_id`
5. set `persist_session=False`
6. keep portal DB as source of truth

## Phase B — verify one real end-to-end flow

Run this exact test:

1. log in
2. create conversation
3. upload one XML or PDF
4. ask: `o que está faltando?`
5. confirm that Hermes:
   - receives the file
   - produces a coherent answer in pt-BR
   - streams step/message events
   - saves the assistant response in DB

## Phase C — verify approval-gated action flow

1. click `Preparar envio Orizon`
2. verify action request row created
3. click `Enviar para Orizon`
4. verify approval modal appears
5. approve
6. verify adapter only accepts execution when `approval_state='granted'`

## Phase D — only then wire real Orizon execution

Do not wire real portal submission before A/B/C work reliably.

---

# 16. What not to do

## Do not:

- move the portal’s primary runtime to Hermes gateway
- make gateway session state the source of truth
- let Hermes own auth or tenant identity
- let Hermes own approvals or audit logs
- enable all toolsets by default just because they exist
- rely on implicit `AIAgent()` defaults in production

---

# 17. Minimal “make it work now” implementation plan

If the only goal is to make the current portal actually function as a Hermes-powered product as fast as possible, do this:

## Required
1. explicitly configure `AIAgent(...)`
2. pass provider/api_key/model/toolsets via adapter settings
3. disable unsupported toolsets
4. keep the web app as authoritative state layer
5. keep adapter as stateless Hermes bridge
6. verify a real upload → chat → streamed answer happy path

## Optional later
1. support clarify tool round-trips in the portal
2. support Hermes-native session persistence
3. add a secondary Hermes gateway deployment for Telegram/Slack notifications
4. add real Orizon execution tooling behind `submit_orizon`

---

# 18. Final recommendation

## Best architecture decision

**Yes, the portal can and should act as the channel.**

But it should do so through your **current web → adapter → Hermes** architecture, not by making the portal a thin wrapper around the Hermes gateway.

## The right mental model

- `web/` = product shell
- `adapter/` = Hermes bridge
- Hermes = agent brain
- gateway = optional secondary interface layer for future messaging integrations

## In one sentence

> For this product, the portal itself should be the primary Hermes channel, and the FastAPI adapter should be the stable integration boundary — not the generic Hermes gateway.

---

# 19. Suggested next code changes in this repo

If you want to implement this guide immediately, the first files I would change are:

- `adapter/src/adapter/config.py`
- `adapter/src/adapter/hermes_runner.py`
- `infra/.env.example`
- optionally `README.md` to document the runtime contract

---

# 20. Quick implementation note about the current repo

Your current repo already chose the correct architecture.

The main thing missing is not a new integration strategy — it is **hardening the existing Hermes adapter layer** so the runtime behavior is explicit and controlled.

That is the shortest path to getting the portal truly working.

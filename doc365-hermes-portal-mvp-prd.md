# PRD — Doc365 Hermes Portal MVP

## 1. Document Info

**Product name:** Doc365 Hermes Portal MVP  
**Version:** v1.0 PRD  
**Status:** Draft for build planning  
**Target release:** MVP / cold release  
**Primary objective:** Launch a professional web portal where doctors and collaborators can chat with Hermes, upload files, and complete the first useful billing workflows with minimum implementation complexity.

---

## 2. Executive Summary

Doc365 Hermes Portal MVP is a **web-based operational assistant for Brazilian healthcare billing**. It provides a secure professional interface where non-technical users can:

- chat with Hermes in natural language
- upload billing-related files
- ask for validation, explanation, and next steps
- prepare billing submissions
- request limited approved automations such as Orizon-related actions

This MVP is intentionally **thin**. It does **not** attempt to build a full billing platform, BPM engine, or multi-agent architecture. Instead, it wraps a lightweight web application around Hermes, which acts as:

- the conversational interface engine
- the billing reasoning engine
- the document interpretation engine
- the validation assistant
- the automation operator for approved tasks

The product’s value is not “AI chat” by itself. The value is that a doctor or collaborator can interact in plain Portuguese and get operational help with **guias, arquivos, TISS/XML, pendências, glosas, and submission preparation** without needing to understand the technical details behind the billing process.

---

## 3. Product Vision

### Vision Statement
Create the fastest viable professional portal that allows a healthcare billing user to upload files, ask for help in natural language, and have Hermes organize, validate, explain, and execute limited billing actions safely.

### Product Positioning
This is not a generic chatbot.  
This is a **billing assistant workspace**.

The user experience should feel like:

> “I upload the documents, ask what I need in plain language, and the system helps me understand what is missing, what is wrong, and what can be sent — with clear approvals before important actions.”

---

## 4. Problem Statement

Healthcare billing workflows in Brazil are operationally dense and error-prone. Doctors and clinic collaborators often do not want to deal with:

- guide-type classification
- TISS structure
- TUSS coding context
- operadora requirements
- protocol follow-up
- glosa explanation
- portal submission quirks

Today, this work is fragmented across:

- PDFs
- XMLs
- scanned documents
- spreadsheets
- portals like Orizon/FATURE
- tribal operational knowledge

This creates:

- rejected submissions
- missing documentation
- delayed cash flow
- excessive manual checking
- poor traceability
- dependency on specialized back-office staff

The MVP must reduce friction by giving users a single place to:
- upload files
- ask for help
- receive structured operational guidance
- approve limited automation actions

---

## 5. Product Goals

## Primary Goals
1. Provide a **professional web interface** for Hermes.
2. Allow **chat + file upload** in the same workflow.
3. Let non-technical users get useful answers in **plain Portuguese**.
4. Deliver immediate value with **pre-submission understanding and validation**.
5. Enable **human-approved limited automation** for external actions.
6. Keep architecture **portable and self-hostable**, avoiding platform lock-in.

## Secondary Goals
1. Establish a clean base for later features:
   - case organization
   - reconciliation
   - glosa workflows
   - dashboards
   - richer automation
2. Capture enough usage data to learn what users actually ask for.
3. Avoid premature complexity.

---

## 6. Non-Goals for MVP

The MVP will **not** include:

- full RCM/billing ERP functionality
- complete clinic back-office operations platform
- full financial reconciliation system
- advanced payer-rule admin UI
- full workflow/BPM engine
- multi-agent architecture
- automated coding engine with no review
- large-scale analytics dashboard
- deep EMR/prontuário integration
- WhatsApp/Telegram as core interface
- highly customizable enterprise permissions matrix
- full end-to-end autonomous billing without approval

These may be future phases, but are explicitly out of scope for MVP.

---

## 7. Users and Personas

## Persona A — Doctor
**Profile:** busy, non-technical, wants clarity, speed, and trust  
**Needs:**
- simple upload
- easy explanation
- “what is missing?”
- “can this be billed?”
- confidence before submission

**Pain points:**
- does not understand billing structure deeply
- does not want to navigate portal complexity
- fears rejection and delayed payment

## Persona B — Clinic Collaborator / Secretary / Admin Assistant
**Profile:** operationally involved, but not highly technical  
**Needs:**
- upload and organize files
- identify missing docs
- validate before sending
- ask Hermes how to proceed
- trigger approved actions

**Pain points:**
- repeated manual checks
- confusing payer requirements
- uncertainty around guide type and operadora process

## Persona C — Doc365 Internal Operator (light MVP support role)
**Profile:** more expert user, supports edge cases  
**Needs:**
- inspect conversations
- review difficult submissions
- understand why Hermes recommended something
- manually intervene when needed

**Pain points:**
- noisy operations
- repeated questions
- lack of structured visibility

---

## 8. Core Product Principles

### 8.1 Hermes is the main application brain
The portal should not try to duplicate business logic heavily in the backend. Hermes should handle:
- user intent interpretation
- domain explanation
- document understanding
- structured extraction reasoning
- validation explanation
- next-step guidance
- approval-aware automation execution

### 8.2 The web app is a thin professional shell
The portal exists to provide:
- authentication
- chat UI
- upload UX
- conversation persistence
- action buttons
- approval controls
- audit trail for key actions

### 8.3 Upload is a first-class primitive
This is not “chat with attachments.”  
This is a file-centric operational workflow with chat layered on top.

### 8.4 High-risk actions require explicit approval
If an action can affect billing outcomes externally, the user must confirm it before execution.

### 8.5 MVP favors practical usefulness over architectural purity
The system should optimize for:
- shipping quickly
- being usable immediately
- learning from real users
- keeping the stack portable

---

## 9. Scope of MVP

## In Scope
1. Authenticated web portal
2. Chat with Hermes
3. Multi-file upload
4. Message history
5. File attachment awareness in conversation
6. Hermes-based file understanding
7. Hermes-based billing guidance
8. Hermes-based pre-submission validation assistance
9. Action shortcuts / prompt shortcuts
10. Confirmation gates for risky actions
11. Basic audit log for sensitive actions
12. Minimal admin/operator visibility

## Out of Scope
1. Full coding engine
2. Automatic batch reconciliation engine
3. Full case/lote database model with every billing entity normalized
4. Rich analytics
5. Multi-clinic enterprise organization model beyond simple tenancy
6. Direct payer API integrations as primary path
7. Full document OCR pipeline tuning beyond basic ingestion support
8. Custom mobile app

---

## 10. MVP Use Cases

## UC1 — Understand uploaded files
User uploads XML/PDF/image/ZIP and asks:
- “o que é isso?”
- “isso pode ser faturado?”
- “qual operadora é?”
- “qual o tipo de guia?”
- “resuma esses arquivos”

**Expected result:** Hermes identifies the likely document types, explains them, highlights key metadata, and indicates ambiguity where needed.

---

## UC2 — Detect missing items / pendências
User uploads a set of documents and asks:
- “o que está faltando?”
- “tem alguma pendência?”
- “o que preciso antes de enviar?”

**Expected result:** Hermes generates a practical checklist of missing items or potential issues.

---

## UC3 — Validate XML / submission readiness
User uploads XML or related package and asks:
- “valide esse XML”
- “esse lote está pronto?”
- “isso vai ser rejeitado?”
- “verifique erros antes do envio”

**Expected result:** Hermes explains structural or operational risks and classifies readiness.

---

## UC4 — Explain glosa or create recurso draft
User uploads denial-related material and asks:
- “explique essa glosa”
- “o que aconteceu aqui?”
- “faça um rascunho do recurso”

**Expected result:** Hermes summarizes the issue and drafts a structured response with clear uncertainty labels.

---

## UC5 — Approved portal action
User asks for a real external action:
- “envie para Orizon”
- “prepare esse envio”
- “faça o upload”
- “reenvie”

**Expected result:** The portal shows a confirmation step. Hermes only proceeds after approval.

---

## UC6 — Operational guidance
User asks open questions:
- “qual é o próximo passo?”
- “isso é consulta ou SP/SADT?”
- “o que preciso para Bradesco?”
- “sem protocolo, o que significa?”

**Expected result:** Hermes answers in operational language suitable for a non-technical user.

---

## 11. User Stories

### Chat and Upload
- As a doctor, I want to upload billing files and ask simple questions so I can understand what to do next.
- As a collaborator, I want to send multiple files at once so I can avoid repetitive uploads.
- As a user, I want Hermes to consider the uploaded files in the conversation context so I don’t have to describe everything manually.

### Validation
- As a collaborator, I want Hermes to tell me if something is missing before submission so I reduce rejection risk.
- As a doctor, I want a clear readiness explanation without technical jargon.
- As a user, I want uncertainties flagged clearly so I know when human review is still needed.

### Action Execution
- As a user, I want the system to ask for approval before external submission so I remain in control.
- As an operator, I want a record of what was submitted and why so I can audit later.

### History
- As a user, I want to revisit prior conversations and files so I can continue work later.
- As Doc365 staff, I want minimal operator visibility into problematic threads so I can assist if needed.

---

## 12. Functional Requirements

# 12.1 Authentication
The system shall:
1. require login for portal access
2. support at minimum email/password auth
3. support session management
4. associate users with an organization or workspace boundary
5. prevent unauthorized access to another user’s files/conversations

**MVP note:** keep auth simple and portable; avoid managed lock-in assumptions.

---

# 12.2 Conversations
The system shall:
1. allow a user to create a new conversation
2. allow a user to continue an existing conversation
3. persist messages in order
4. associate uploaded files with a conversation
5. render Hermes responses in a chat format
6. support streaming responses if feasible
7. store enough context to continue sessions safely

**MVP simplification:** “conversation” is the main top-level entity; do not require a complex case model yet.

---

# 12.3 File Upload
The system shall:
1. allow multi-file upload
2. support files relevant to billing workflows, including at least:
   - XML
   - ZIP
   - PDF
   - images
   - common office files if feasible
3. store uploaded files securely
4. attach file metadata to the conversation
5. make file references available to Hermes
6. show uploaded file names and statuses in the UI

**MVP note:** file ingestion may initially rely on Hermes-supported tools plus minimal server-side handling.

---

# 12.4 Hermes Interaction
The system shall:
1. send user messages plus relevant conversation/file context to Hermes
2. distinguish between ordinary chat input and action-triggered prompts
3. support structured instruction wrappers behind the scenes
4. return Hermes responses to the UI
5. preserve thread continuity per conversation
6. let Hermes reference uploaded files in reasoning

---

# 12.5 Action Shortcuts
The system shall provide explicit action triggers such as:
- Analyze files
- Check missing items
- Validate submission
- Draft recurso
- Prepare Orizon action
- Submit to Orizon

These actions may internally generate structured prompts to Hermes.

---

# 12.6 Approval Gates
The system shall:
1. classify some actions as requiring explicit confirmation
2. present a confirmation modal or equivalent UI before execution
3. record the approval event
4. prevent accidental repeated execution
5. tie execution to an approved request

**High-risk examples:**
- portal submission
- resend
- explicit override of mismatch/warning

---

# 12.7 Auditability
The system shall log at minimum:
1. who requested a sensitive action
2. when it was requested
3. whether it was approved
4. whether Hermes executed it
5. the resulting status
6. any returned execution summary

**MVP note:** does not need full event-sourcing architecture; a basic action log is sufficient.

---

# 12.8 Minimal Operator Visibility
The system should allow an internal Doc365 operator/admin to:
1. view conversation list
2. inspect a conversation
3. see uploaded files
4. review sensitive action history
5. optionally continue or assist in the thread later

This can be simple and limited in MVP.

---

## 13. Non-Functional Requirements

### 13.1 Portability
- The stack must be self-hostable.
- Avoid hard coupling to a single managed backend vendor.
- Components should be replaceable with standard open-source equivalents.

### 13.2 Security
- authenticated access only
- secure file storage
- transport encryption
- tenant/user isolation
- restricted file access
- action logging for sensitive operations

### 13.3 Performance
- typical chat interactions should feel responsive
- upload acknowledgment should be immediate
- large-file interpretation may be async if needed, but the user must be informed

### 13.4 Reliability
- failed Hermes/tool calls should return graceful UI messaging
- failed external automation should not produce silent ambiguity
- approval-gated actions must be idempotency-aware where possible

### 13.5 Explainability
- Hermes responses should be understandable to non-technical users
- uncertainty should be explicit
- action outcomes should be summarized clearly

---

## 14. Proposed MVP Architecture

## 14.1 Architectural Summary
A **two-layer product** with a thin server application in front of Hermes.

### Layer A — Web Portal
Responsibilities:
- auth
- session management
- chat UI
- upload UI
- action buttons
- confirmation modals
- conversation history rendering

### Layer B — Application Server / Hermes Adapter
Responsibilities:
- authenticate requests
- persist users/conversations/messages/file metadata
- store files
- package context for Hermes
- call Hermes
- relay/stream responses
- track sensitive actions
- map portal sessions to Hermes sessions/threads

### Hermes
Responsibilities:
- understand intent
- interpret uploaded files
- provide billing guidance
- perform validation reasoning
- draft outputs
- execute approved automations when applicable

---

## 14.2 Recommended Tech Stack (Portable, No Supabase)

### Frontend
- **Next.js** web app
- React UI
- server-rendered app shell where useful
- standard file upload components

### Backend / App server
Choose one of:
- **Next.js API routes / server actions** for the leanest unified app
- or a separate **FastAPI** service if you want cleaner backend separation

**Recommendation for MVP:**  
Use **Next.js + route handlers** if speed is critical and the team is comfortable with Node.  
Use **FastAPI** only if Python-side Hermes integration is significantly easier in your environment.

### Database
- **PostgreSQL**

### Object/File Storage
Portable options:
- local filesystem for early internal testing
- S3-compatible object storage for production
  - MinIO
  - Cloudflare R2
  - AWS S3 if needed
  - any S3-compatible provider

**Recommendation:** use an S3-compatible abstraction, not a vendor-specific storage API.

### Reverse Proxy / Deployment
- Nginx or Caddy in front
- containerized deployment preferred
- Docker Compose acceptable for MVP
- Kubernetes not required

### Hermes Integration
- Hermes accessed through a stable local service interface, wrapper process, or application-integrated invocation path
- The adapter layer must own:
  - request formatting
  - thread/session mapping
  - attachment reference passing
  - response capture
  - action-result persistence

---

## 15. Data Model (MVP)

Keep the model intentionally small.

## 15.1 Entities

### User
- id
- organization_id
- name
- email
- password_hash
- role
- created_at
- last_login_at

### Organization
- id
- name
- created_at

### Conversation
- id
- organization_id
- user_id
- title
- status
- created_at
- updated_at

### Message
- id
- conversation_id
- sender_type (`user`, `assistant`, maybe `system`)
- content
- created_at
- metadata_json

### FileAttachment
- id
- conversation_id
- uploaded_by_user_id
- original_name
- mime_type
- size_bytes
- storage_key
- checksum
- created_at
- metadata_json

### ActionRequest
- id
- conversation_id
- requested_by_user_id
- action_type
- payload_json
- approval_status
- execution_status
- approved_by_user_id
- requested_at
- approved_at
- executed_at
- result_summary

### AuditEvent
- id
- organization_id
- user_id
- conversation_id nullable
- action_type
- target_type
- target_id
- metadata_json
- created_at

---

## 16. UX / Screen Definitions

## 16.1 Login Screen
### Purpose
Authenticate the user.

### Components
- email
- password
- sign-in button
- forgot password optional later

### MVP simplicity
No SSO required initially.

---

## 16.2 Conversation List / Home
### Purpose
Show prior conversations and allow starting a new one.

### Components
- new conversation button
- searchable conversation list
- last updated timestamp
- small status chip if needed

### Notes
Do not overcomplicate this into “case management” yet.

---

## 16.3 Main Workspace
### Purpose
Primary operating screen for chat + uploads + actions.

### Layout
**Left sidebar**
- conversation list
- new conversation

**Center panel**
- chat messages
- streaming assistant replies
- input composer

**Right sidebar**
- uploaded files
- extracted highlights (optional)
- warnings/pending items (optional)
- quick actions

### Composer area
- text input
- upload button
- send button

### Quick actions
- Analyze files
- Check pending items
- Validate submission
- Draft recurso
- Prepare Orizon submission
- Submit to Orizon

---

## 16.4 Confirmation Modal
### Purpose
Prevent unintended external actions.

### Fields
- action summary
- files in scope
- warning summary
- confirm / cancel

### Example copy
“You are about to request submission to Orizon for the files attached in this conversation. Confirm to proceed.”

---

## 16.5 Minimal Admin / Operator View
### Purpose
Support internal Doc365 review.

### Components
- conversation list
- conversation detail
- action history
- file list

Keep this very basic in MVP.

---

## 17. Interaction Model with Hermes

## 17.1 Context Packaging
Every request to Hermes should include, server-side:

- authenticated user identity
- organization/workspace context
- conversation ID
- relevant prior messages
- list of attached files
- secure accessible file references or local paths
- explicit action origin if the message came from a shortcut button
- approval state if the request is a sensitive action

This is critical. The quality of the portal will depend heavily on good context packaging.

---

## 17.2 Prompt / Instruction Strategy
The portal should not expose raw system complexity to end users. Internally, it should wrap user requests with structured context such as:

- this is a user-facing Doc365 portal interaction
- the user is non-technical unless context suggests otherwise
- explain in operational Portuguese
- identify uncertainty explicitly
- if there are uploaded files, inspect them first before answering
- if the action has side effects, require confirmed approval state before execution

---

## 17.3 Action Buttons as Structured Prompts
Each quick action should map to a structured instruction template.

Examples:

### Analyze Files
“Review the files attached to this conversation. Identify likely file/document types, summarize what each appears to contain, and explain what they are in clear operational Portuguese.”

### Check Pending Items
“Review the attached materials and identify missing information, missing supporting documents, likely pendências, and any reasons the billing package may not yet be ready.”

### Validate Submission
“Review the attached materials for pre-submission risk. Flag structural, documentary, and operational issues. Distinguish between verified facts, likely risks, and items that need human confirmation.”

### Draft Recurso
“Based on the attached denial/glosa-related materials, explain the issue and draft a practical recurso summary, clearly separating confirmed information from assumptions.”

### Submit to Orizon
Only available after approval context is true.

---

## 18. Risk Classification for Actions

## 18.1 Informational Actions
No approval required.
Examples:
- summarize
- classify
- explain
- identify likely issues
- answer workflow questions

## 18.2 Preparatory Actions
May be button-triggered, no strong approval required initially.
Examples:
- prepare submission checklist
- validate readiness
- draft recurso
- create structured summary

## 18.3 External Side-Effect Actions
Hard approval required.
Examples:
- upload/send to Orizon
- resend batch
- execute portal interaction
- override mismatch warning and continue

---

## 19. Billing-Domain-Specific Product Behavior

This PRD should reflect operational reality from the healthcare billing domain.

### Important operational concepts to support in explanations
- eligibility and authorization are upstream risk areas
- correct guia type matters
- TISS XML validity is necessary but not sufficient
- protocol/PEG matters operationally
- pre-protocol rejection differs from post-protocol glosa
- missing documentation is a major failure source
- prevention value is very high before submission

### Hermes should favor useful MVP value in:
1. file/document understanding
2. pre-submission validation
3. pendência detection
4. glosa explanation and draft response
5. approval-gated execution of limited portal actions

This is aligned with the highest-value prevention opportunities in the operational lifecycle.

---

## 20. MVP Feature Breakdown

# 20.1 Must Have
- login
- authenticated chat UI
- multi-file upload
- message persistence
- file-to-conversation association
- Hermes response rendering
- quick action buttons
- approval modal for risky actions
- action log
- portable storage/database setup
- basic internal admin visibility

# 20.2 Should Have
- response streaming
- file preview metadata panel
- conversation titling
- lightweight error/status banners
- retry/recover UX for failed Hermes actions

# 20.3 Nice to Have
- inline extracted metadata cards
- generated titles based on first message/upload
- file-type badges
- partial async ingestion status
- export conversation summary

---

## 21. Acceptance Criteria

## A. Portal Basics
1. User can log in securely.
2. User can create and resume conversations.
3. Messages persist after refresh.
4. User can upload one or multiple files.
5. Uploaded files appear in the conversation UI.

## B. Hermes Integration
6. Hermes can answer based on uploaded files.
7. Hermes can respond to plain-language questions from a non-technical user.
8. Hermes can handle at least one structured action shortcut correctly.

## C. Validation Utility
9. User can ask what is missing and receive a useful answer.
10. User can ask whether something is ready to send and receive a clear explanation.
11. Hermes distinguishes uncertainty where applicable.

## D. Action Safety
12. Sensitive actions require explicit approval in UI.
13. Approved actions are logged.
14. Failed actions return a visible result, not silent failure.

## E. Minimal Admin
15. Internal operator can inspect a conversation and related files.

---

## 22. Success Metrics

## Product Metrics
- number of active users
- number of conversations per week
- number of uploaded files per week
- percentage of conversations that include file upload
- percentage of users invoking quick actions

## Utility Metrics
- number of validation requests
- number of pending-item analyses
- number of submission-prep actions
- number of glosa explanation/draft requests

## Operational Metrics
- approval-to-execution rate for sensitive actions
- failure rate on sensitive actions
- average response time
- user return rate after first use

## Outcome Proxies
- reduction in repeated clarification requests
- increased use of pre-submission validation before send
- operator-reported usefulness
- percentage of conversations resolved without human escalation

---

## 23. Technical Implementation Guidelines

## 23.1 Build Strategy
Start with the smallest coherent slice:
1. auth
2. conversation model
3. chat UI
4. file upload
5. Hermes adapter
6. action shortcuts
7. approval flow
8. action logging

Anything beyond that is phase 2 unless it is required for release.

---

## 23.2 Portability Requirements
Avoid:
- vendor-specific auth dependencies
- vendor-only object APIs
- DB-specific proprietary feature dependencies
- deeply coupled managed backend architecture

Prefer:
- PostgreSQL
- S3-compatible object interface
- Dockerized services
- standard app-layer auth/session handling

---

## 23.3 Deployment Preference
For MVP, target:
- one app deployment
- one Postgres instance
- one object storage service or compatible provider
- one reverse proxy
- Hermes reachable by the app server

That is enough.

---

## 24. Risks and Mitigations

## Risk 1 — Hermes context packaging is too weak
**Impact:** bad answers, inconsistent behavior  
**Mitigation:** define a strict server-side request envelope with files, session context, and action state.

## Risk 2 — External action execution is too risky for MVP
**Impact:** incorrect submissions  
**Mitigation:** hard approval gates, clear warnings, limited supported actions.

## Risk 3 — File handling becomes messy
**Impact:** unusable UX  
**Mitigation:** keep files attached to conversation, show them clearly, avoid over-modeling early.

## Risk 4 — Team overbuilds backend
**Impact:** slower launch  
**Mitigation:** enforce “thin shell around Hermes” scope discipline.

## Risk 5 — Users expect full back-office system
**Impact:** disappointment  
**Mitigation:** position MVP clearly as an assistant workspace focused on validation, guidance, and selected actions.

## Risk 6 — Domain ambiguity causes overconfident outputs
**Impact:** trust loss  
**Mitigation:** instruct Hermes to separate verified facts, likely interpretation, and unknowns.

---

## 25. Release Strategy

## Cold Release Goal
Ship to a small initial set of real users with limited but credible capabilities.

### Recommended release framing
“This portal helps you upload billing-related files, ask questions in plain language, identify missing items, validate readiness, and request selected assisted actions.”

Avoid claiming:
- full autonomous billing
- full denial recovery automation
- perfect payer-rule certainty
- full portal coverage

---

## 26. Phased Roadmap After MVP

## Phase 1 — MVP
- chat
- uploads
- document understanding
- pending-item guidance
- pre-submission validation
- approval-gated limited Orizon actions

## Phase 2
- stronger conversation-to-case grouping
- richer extracted metadata panel
- improved operator console
- more structured submission prep
- better glosa workflows

## Phase 3
- reconciliation workflows
- protocol tracking
- dashboards
- payer-specific knowledge layers
- advanced operational analytics

---

## 27. Open Questions

1. What exact external actions should be supported in MVP?
   - only “prepare send”?
   - actual Orizon upload?
   - both?

2. What file types must be fully supported on day 1?
   - XML, PDF, image, ZIP for sure?
   - spreadsheets too?

3. Should conversations be single-user private only in MVP, or shared within organization?

4. Does Doc365 need an internal operator-only panel at launch, or can operator access be done through privileged standard accounts initially?

5. Should the first release be Portuguese-only in UI?

6. What is the preferred Hermes integration mode in your stack?
   - in-process wrapper
   - local service
   - external adapter API

---

## 28. Final Recommendation

Build the MVP as a **portable web portal that wraps Hermes directly**, with the following product identity:

### “Doc365 Hermes Portal”
A professional billing assistant workspace where the user can:
- upload files
- ask for help in plain Portuguese
- understand billing context
- detect pendências
- validate readiness
- approve selected automations

The main product insight is:

> The portal should not try to replace Hermes with backend logic.  
> The portal should provide the professional UI, control, storage, and safety layer that lets Hermes operate effectively for non-technical healthcare billing users.

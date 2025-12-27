# LLM Service - Vigil Fact Extraction

**Python/vLLM Extraction Service**

LLM-powered fact extraction service for Vigil. This service provides **automated extraction** that creates reminders directly—users correct the ~10% of cases where the LLM is wrong. Every extraction must be grounded in verifiable source text.

## Critical Design Constraints

### Automated Extraction with User Correction

- Extractions are **automated**—they create reminders immediately
- Every extraction MUST include a `source_span` (verbatim quote from email)
- Extractions without valid source spans are **DISCARDED** by the backend
- Users correct the ~10% of cases where LLM is wrong (edit, merge, dismiss, reassign)
- The system functions correctly even if this service is offline

### Grounded Extraction Requirement

```
Email Text → Regex identifies candidates → LLM interprets context → source_span validation → Accept/Discard
```

- The `source_span` field MUST be a verbatim substring of the input email
- If LLM hallucinates text that doesn't exist, the extraction is discarded
- This prevents invented deadlines or phantom obligations

## SDD Traceability

The [Software Design Document (SDD)](../docs/SDD.md) is the **authoritative source of truth** for all system requirements. This LLM service implements the following requirements:

| This Document Section | SDD Requirements |
|-----------------------|------------------|
| Fact Extraction | FR-7, FR-7a (Three-Tier Extraction Model) |
| Hard Deadline Extraction | FR-6, MR-LLMService-1 |
| Soft Deadline Signals | FR-6b, MR-LLMService-4 |
| Urgency Signal Detection | FR-6c, MR-LLMService-5 |
| Closure Detection | FR-7, MR-LLMService-2 |
| Source Span Validation | MR-LLMService-3 |
| Non-Autonomous Design | FR-16 (Delegated Vigilance), FR-20 (Expressly Constrained) |
| Infrastructure | IR-10, IR-11, IR-12 |

See [SDD Section 5: Implementation Coverage Table](../docs/SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## Implementation Coverage Contribution

This component contributes **~10%** of overall project implementation. The LLM service is a bounded, subordinate extraction appliance.

### Coverage by Category

| Category | LLM Service Owns | Total in SDD | Coverage |
|----------|------------------|--------------|----------|
| Feature Requirements (FR) | 4 of 22 | 22 | 18% |
| Module Requirements (MR) | 5 of 26 | 26 | 19% |
| Infrastructure (IR) | 3 of 24 | 24 | 13% |

### LLM Service-Owned Requirements

| Requirement | Description | Endpoint |
|-------------|-------------|----------|
| MR-LLMService-1 | Hard Deadline Extraction | `POST /extract/deadline` |
| MR-LLMService-2 | Closure Signal Detection | `POST /extract/closure` |
| MR-LLMService-3 | Source Span Validation | Internal validation |
| MR-LLMService-4 | Soft Deadline Signal Extraction | `POST /extract/soft_deadline` |
| MR-LLMService-5 | Urgency Signal Detection | `POST /extract/urgency` |
| IR-10 | Network Isolation | Private network only |
| IR-11 | LLM Timeout | 10-second max response |
| IR-12 | Determinism | Same input → same output |

### LLM Service is Called By (Backend Only)

```
Backend Ingestion Pipeline:
  MESSAGE_RECEIVED event created
           ↓
  Sender validated (allowlist check)
           ↓
  Backend calls LLM Service (HTTP):
    ├── POST /extract/deadline
    ├── POST /extract/soft_deadline
    ├── POST /extract/urgency
    └── POST /extract/closure
           ↓
  Backend emits extraction events:
    ├── HARD_DEADLINE_OBSERVED
    ├── SOFT_DEADLINE_SIGNAL_OBSERVED
    ├── URGENCY_SIGNAL_OBSERVED
    └── CLOSURE_SIGNAL_OBSERVED
```

### LLM Service Does NOT:

- ❌ Access event store
- ❌ Emit events (backend does)
- ❌ Make decisions about thread creation
- ❌ Store state or history
- ❌ Communicate with frontend
- ❌ Call external APIs
- ❌ Override user corrections
- ❌ Resolve conflicts (surfaces them for user)

### One Email, Multiple Extractions

A single email may generate multiple extraction results:
- "Please send the report by Friday" → Hard deadline extraction
- "Also, can you schedule a call?" → Urgency signal extraction

Each becomes an independent draft reminder for user review.

---

## Working with Agents

This section guides AI agents implementing discrete features within the LLM service.

### Before Starting Any Feature

1. **Identify the MR-LLMService-X requirement** being implemented
2. **Review extraction response schemas** in this README
3. **Understand the bounded role:** Extract facts, never decide
4. **Test with sample emails** before integration

### Feature Implementation Checklist

```
□ Identify SDD requirement (MR-LLMService-X)
□ Review acceptance criteria in SDD Section 4
□ Design prompt template in src/prompts/
□ Implement endpoint in src/extraction/
□ Add response validation (Pydantic schemas)
□ Implement source_span verification
□ Add unit tests with sample emails
□ Test with vLLM backend
□ Run `pytest` to verify
```

### Discrete Feature Examples

| Feature | SDD Requirement | Files to Create/Modify | Output Event |
|---------|-----------------|------------------------|---------------|
| Hard deadline extraction | MR-LLMService-1 | `src/extraction/deadline.py` | HARD_DEADLINE_OBSERVED |
| Soft signal detection | MR-LLMService-4 | `src/extraction/soft.py` | SOFT_DEADLINE_SIGNAL_OBSERVED |
| Urgency signal detection | MR-LLMService-5 | `src/extraction/urgency.py` | URGENCY_SIGNAL_OBSERVED |
| Closure detection | MR-LLMService-2 | `src/extraction/closure.py` | CLOSURE_SIGNAL_OBSERVED |
| Source span validation | MR-LLMService-3 | `src/extraction/validate.py` | Validation utility |

### Prompt Template Pattern

```python
# src/prompts/deadline.py
DEADLINE_PROMPT = """
Extract any explicit deadline from the following email.

Return JSON with:
- deadline_found: boolean
- deadline_timestamp: Unix ms (or null)
- deadline_text: verbatim text containing the deadline
- source_span: exact substring from email (MUST exist in input)
- confidence: "high" | "medium" | "low"
- is_absolute: boolean (true if specific date/time)

Email:
{email_text}

Reference timestamp: {reference_timestamp}

Respond with valid JSON only.
"""
```

### Response Validation Pattern

```python
# src/models/deadline.py
from pydantic import BaseModel, validator

class DeadlineResponse(BaseModel):
    deadline_found: bool
    deadline_timestamp: int | None
    deadline_text: str | None
    source_span: str | None
    confidence: Literal["high", "medium", "low"]
    is_absolute: bool
    binding: bool = True
    extractor_version: str = "v1.0.0"
    
    @validator("source_span")
    def validate_source_span(cls, v, values):
        # MR-LLMService-3: Source span must exist in input
        # Validation done at endpoint level with original text
        return v
```

## Purpose

Extracts structured **candidate facts** from email text via language model inference. All extractions are advisory and require user confirmation.

### Extraction Types (Three-Tier Model)

**Tier 1: Hard Deadlines (Binding)**
- Explicit dates/times with commitment language
- Examples: "by Friday 5pm", "deadline December 31st", "must respond by EOD"
- Creates draft `HARD_DEADLINE_OBSERVED` events
- Requires `source_span` validation before acceptance

**Tier 2: Soft Deadline Signals (Advisory)**
- Fuzzy temporal language without explicit dates
- Examples: "next week", "end of month", "soon", "in a few days"
- Creates draft `SOFT_DEADLINE_SIGNAL_OBSERVED` events
- User decides whether to create reminder

**Tier 3: Urgency Signals (Loosest)**
- Questions, requests, obligations without dates
- Examples: "can you provide", "I need", "ASAP", "please respond"
- Creates draft `URGENCY_SIGNAL_OBSERVED` events
- User decides whether to create reminder

**Closure Detection**
- Explicit confirmation that obligation is complete
- Examples: "this is done", "no longer needed", "completed"
- Creates draft `CLOSURE_SIGNAL_OBSERVED` events
- User confirms before thread closure

## Router LLM Model

The LLM service operates as a **router LLM** that runs on every inbound email:

- **Universal Invocation:** Called for every email received by an active watcher (after sender validation)
- **Single-Pass Extraction:** Performs all extraction types in one pass (deadline, soft signal, urgency, closure)
- **Advisory Output:** All extractions are candidates for user review, never auto-committed
- **Audit Trail:** ALL extraction events are emitted and persisted, even when users dismiss them

**Key Constraint:** This service determines what the system **suggests**, but users decide what happens next. Extraction events are hypotheses about what text contains—users confirm or reject them.

## Architecture

- **Separate deployment** from backend (can run on different machine with GPU)
- **Private network only** - not publicly accessible
- **HTTP API** for single-task fact extraction
- **vLLM-backed** inference for performance
- **Network-routed** - backend calls over HTTP

## API Endpoints

### POST /extract/deadline
Extract hard deadline information from email text.

**Request:**
```json
{
  "email_text": "Please reply by Friday December 27, 2025 at 5pm EST",
  "reference_timestamp": 1703462400000
}
```

**Response:**
```json
{
  "deadline_found": true,
  "deadline_timestamp": 1735336800000,
  "deadline_text": "Friday December 27, 2025 at 5pm EST",
  "source_span": "by Friday December 27, 2025 at 5pm EST",
  "is_absolute": true,
  "confidence": "high",
  "binding": true,
  "extractor_version": "v1.0.0"
}
```

### POST /extract/soft_deadline
Extract soft deadline signals (fuzzy temporal language).

**Request:**
```json
{
  "email_text": "I'll need this sometime next week",
  "reference_timestamp": 1703462400000
}
```

**Response:**
```json
{
  "signal_found": true,
  "signal_text": "sometime next week",
  "source_span": "sometime next week",
  "estimated_horizon_hours": 168,
  "confidence": "medium",
  "binding_language": false,
  "extractor_version": "v1.0.0"
}
```

### POST /extract/urgency
Extract urgency signals (questions, requests, obligations).

**Request:**
```json
{
  "email_text": "Can you please provide the quarterly report?"
}
```

**Response:**
```json
{
  "signal_found": true,
  "signal_type": "request",
  "signal_text": "provide the quarterly report",
  "source_span": "Can you please provide the quarterly report?",
  "confidence": "high",
  "extractor_version": "v1.0.0"
}
```

### POST /extract/closure
Detect explicit closure confirmation.

**Request:**
```json
{
  "email_text": "Thanks, this is all done now. No further action needed."
}
```

**Response:**
```json
{
  "closure_found": true,
  "closure_type": "explicit",
  "source_span": "this is all done now. No further action needed",
  "extractor_version": "v1.0.0"
}
```

## Network Configuration

**Configuration:** See `.env.example`

```bash
cp .env.example .env
# Edit LLM_SERVICE_URL in backend/.env to point here
```

**Key Environment Variables:**
```bash
# Server
LLM_SERVICE_PORT=8000
LLM_SERVICE_HOST=0.0.0.0

# Model Configuration
MODEL_NAME=meta-llama/Llama-3.1-8B-Instruct
MODEL_MAX_TOKENS=4096
TENSOR_PARALLEL_SIZE=1

# vLLM Settings
GPU_MEMORY_UTILIZATION=0.9
MAX_NUM_SEQS=256
```

**Example Network Setup:**
- LLM Service: `http://llm-service:8000` or `http://192.168.1.100:8000`
- Backend calls extraction endpoints via this URL

## Invariants

The LLM service:
- ✅ Performs exactly **ONE task per request**
- ✅ Returns **structured JSON + verbatim source_span evidence**
- ✅ **source_span MUST exist in input text** — or extraction is discarded
- ✅ Includes `confidence` level (high/medium/low)
- ✅ Includes `extractor_version` for reproducibility
- ✅ Can extract **multiple concerns from one email**
- ❌ Does **NOT chain prompts**
- ❌ Does **NOT call tools or external APIs**
- ❌ Does **NOT retry autonomously**
- ❌ Does **NOT emit events** (only backend emits events)
- ❌ Does **NOT store state or history**
- ❌ Does **NOT make decisions** about what happens next
- ❌ Does **NOT auto-commit** — users confirm all reminders

**If LLM service is unavailable, Vigil continues to function with regex-only extraction.**

### Source Span Validation (Critical)

```python
# Backend validation pseudo-code
def validate_extraction(email_text: str, extraction: dict) -> bool:
    source_span = extraction.get("source_span", "")
    if not source_span:
        return False  # DISCARD: no grounding
    
    if source_span.lower() not in email_text.lower():
        return False  # DISCARD: hallucinated text
    
    return True  # ACCEPT: grounded extraction
```

Extractions that fail validation are silently discarded. This prevents:
- Hallucinated deadlines
- Invented obligations
- Phantom urgency signals

## SDD References

- **Module Requirements:** MR-LLMService-1 through MR-LLMService-5
- **Feature Requirements:** FR-6 (Deadline Extraction), FR-6b (Soft Deadline), FR-6c (Urgency Signal), FR-7 (Closure Detection)
- **Infrastructure Requirements:** IR-4 (LLM Timeout), IR-5 (Source Span Validation)

## Structure

```
llm-service/
├── src/
│   ├── main.py           # FastAPI application
│   ├── extraction/       # Extraction endpoints
│   │   ├── deadline.py   # Hard deadline extraction
│   │   ├── soft.py       # Soft deadline signals
│   │   ├── urgency.py    # Urgency signal detection
│   │   └── closure.py    # Closure detection
│   ├── models/           # Pydantic schemas
│   └── prompts/          # LLM prompt templates
├── tests/                # Unit tests
├── .env.example
├── requirements.txt
├── Dockerfile
└── README.md
```

## Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn src.main:app --reload --port 8000

# Run tests
pytest
```

## Deployment

### Docker
```bash
docker build -t vigil-llm-service .
docker run -p 8000:8000 --gpus all vigil-llm-service
```

### GPU Requirements
- Minimum: NVIDIA GPU with 16GB VRAM (RTX 4090, A10)
- Recommended: 24GB+ VRAM for larger models
- vLLM requires CUDA 11.8+

## Status

**To be implemented**

### Implementation Checklist
- [ ] FastAPI server scaffolding
- [ ] Hard deadline extraction endpoint
- [ ] Soft deadline signal endpoint
- [ ] Urgency signal endpoint
- [ ] Closure detection endpoint
- [ ] Source span validation
- [ ] Confidence scoring
- [ ] vLLM integration
- [ ] Docker deployment
- [ ] GPU optimization

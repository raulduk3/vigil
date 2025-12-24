# LLM Service - DEVA Fact Extraction

LLM-powered fact extraction service for DEVA. This service is **strictly subordinate** to the backend control plane and operates in a bounded, non-autonomous role.

## Purpose

Extracts structured facts from email text:
- **Deadlines** - Explicit or implied due dates/times
- **Risk indicators** - Silence-sensitive language requiring timely response
- **Closure signals** - Explicit confirmation that an obligation is complete
- **Thread routing** (optional) - Classification to existing thread

## Architecture

- **Separate deployment** from backend (can run on different machine with GPU)
- **Private network only** - not publicly accessible
- **HTTP API** for single-task fact extraction
- **vLLM-backed** inference for performance
- **Network-routed** - backend calls over HTTP

## Network Configuration

The LLM service listens on a configurable port and is called by the backend.

**Configuration:** See `.env.example`

```bash
cp .env.example .env
# Edit LLM_SERVICE_URL in backend/.env to point here
```

**Example:**
- LLM Service: `http://llm-service:8000` or `http://192.168.1.100:8000`
- Backend calls extraction endpoints via this URL

## API Endpoints

### POST /extract/deadline
Extract deadline information from email text.

**Request:**
```json
{
  "email_text": "Please reply by Friday EOD",
  "reference_timestamp": 1703462400000
}
```

**Response:**
```json
{
  "deadline_timestamp": 1703721600000,
  "deadline_text": "Friday EOD",
  "evidence": "Please reply by Friday EOD",
  "confidence": "high"
}
```

### POST /extract/risk
Extract silence-sensitive language.

### POST /extract/closure
Detect explicit closure confirmation.

### POST /route (optional)
Classify email to existing thread.

## Invariants

The LLM service:
- ✅ Performs exactly **ONE task per request**
- ✅ Returns **structured JSON + verbatim evidence**
- ❌ Does **NOT chain prompts**
- ❌ Does **NOT call tools**
- ❌ Does **NOT retry autonomously**
- ❌ Does **NOT emit events** (only backend emits events)

**If LLM service is unavailable, DEVA continues to function safely with reduced informational fidelity.**

## Status

**To be implemented**

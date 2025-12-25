# Vigil Documentation

Comprehensive documentation for the Vigil vigilance system.

## SDD Traceability

The [Software Design Document (SDD)](SDD.md) is the **authoritative source of truth** for all system requirements. This index document covers navigation to all SDD sections.

| This Document | SDD Sections |
|---------------|--------------|
| Core Specifications | All sections (FR-*, IR-*, MR-*, SEC-*, CONS-*, ASSUM-*) |
| Component Documentation | MR-* (Module Requirements) |
| Quick Navigation | SDD Sections 1-11 |
| Architectural Principles | SDD Section 1, FR-16, FR-20, CONS-1 through CONS-8 |

See [SDD Section 5: Implementation Coverage Table](SDD.md#implementation-coverage-table) for complete mapping of requirements to implementations.

---

## Documents

### Core Specifications
- **[Software Design Document (SDD)](SDD.md)** - Complete production-grade specification with Feature Requirements (FR-1 through FR-20), Infrastructure Requirements (IR-1 through IR-24), Module Requirements, Security Requirements, and Data Consistency Requirements
- **[System Design Document](SYSTEM_DESIGN.md)** - Implementation-grade system design with four subsystems, concrete components, and engineering constraints

### Component Documentation
- **[Backend Control Plane](../backend/README.md)** - TypeScript/Bun backend API, event store, watcher runtime
- **[LLM Extraction Service](../llm-service/README.md)** - Python/vLLM fact extraction (deadlines, signals, closure)
- **[SMTP Adapter](../smtp-adapter/README.md)** - Lightweight email ingress adapter
- **[Frontend](../frontend/README.md)** - Next.js/Vercel web application (splash, auth, dashboard)

### Additional Resources
- **[Event Types Reference](../backend/src/events/types.ts)** - Complete event type definitions (20+ types)
- **[Environment Configuration](DEPLOYMENT.md)** - Network routing and deployment setup (TBD)


## Quick Navigation

**For Product Understanding:**
- Start with main [README](../README.md)
- Read [SDD](SDD.md) sections 1.1-1.4 (System Overview, Primitives)
- Read [System Design Document](SYSTEM_DESIGN.md) sections 1-2

**For Implementation:**
- Read complete [SDD](SDD.md) for acceptance criteria and test requirements
- Read [System Design Document](SYSTEM_DESIGN.md) for component architecture
- Review component-specific READMEs
- Study [Event Types Reference](../backend/src/events/types.ts)

**For Testing:**
- [SDD](SDD.md) Section 2: Feature Requirements with unit test specifications
- [SDD](SDD.md) Section 3: Infrastructure Requirements with verification methods
- [SDD](SDD.md) Section 4: Module Requirements with failure modes

**For Operations:**
- Review [Deployment Guide](DEPLOYMENT.md) (TBD)
- Check component `.env.example` files
- [SDD](SDD.md) Section 1.5: Distributed Deployment Model
- [SDD](SDD.md) Section 1.7: Logging Architecture


## Architectural Principles

1. **Events are the sole source of truth** - All state derived from immutable, append-only events
2. **No long-lived mutable state** - Projections are disposable, rebuildable
3. **No agent behavior** - No background loops, no autonomous actions
4. **LLM as fact extraction appliance only** - Never decides, only extracts
5. **Threads represent tracked conversations** - Created by extraction events, monitor silence/inactivity
6. **Threads do NOT own deadlines** - Deadlines belong to reminders, not threads
7. **Messages are NOT persisted** - Only metadata retained, bodies discarded after extraction
8. **Reminder state is derived, not stored** - Computed on-demand from events
9. **One-way data flow** - Baseline → Extraction → Thread → Reminder → Alert
10. **Extraction events always emitted** - Audit trail preserved regardless of thread state
11. **All data tracked for traceability** - Complete pipeline visibility for users

See [SDD](SDD.md) for complete specifications and [System Design Document](SYSTEM_DESIGN.md) for implementation details.


## Document Relationship

```
SDD.md (Production Specification)
├── Feature Requirements (FR-1 to FR-20) - What the system does
├── Infrastructure Requirements (IR-1 to IR-24) - Non-functional requirements
├── Module Requirements (MR-*) - How components implement features
├── Security Requirements (SEC-1 to SEC-8)
├── Data Consistency (CONS-1 to CONS-8)
└── Unit Test Requirements - Per-feature test specifications

SYSTEM_DESIGN.md (Implementation Guide)
├── Four-Subsystem Architecture
├── Component Responsibilities
├── Network Communication
└── Engineering Constraints

Component READMEs
├── backend/README.md - Backend implementation details
├── llm-service/README.md - LLM service implementation
├── smtp-adapter/README.md - SMTP adapter implementation
└── frontend/README.md - Frontend implementation
```

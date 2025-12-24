# DEVA Documentation

Comprehensive documentation for the DEVA vigilance system.

## Documents

### Core Architecture
- **[System Design Document](SYSTEM_DESIGN.md)** - Complete implementation-grade system design with four subsystems, concrete components, and engineering constraints

### Component Documentation
- **[Backend Control Plane](../backend/README.md)** - Backend API and watcher runtime
- **[LLM Extraction Service](../llm-service/README.md)** - Bounded semantic intelligence
- **[SMTP Adapter](../smtp-adapter/README.md)** - Email ingress layer
- **[Frontend](../frontend/README.md)** - Inspection and control interface

### Additional Resources
- **[Event Types Reference](../backend/src/events/types.ts)** - Complete event type definitions
- **[Environment Configuration](DEPLOYMENT.md)** - Network routing and deployment setup (TBD)


## Quick Navigation

**For Product Understanding:**
- Start with main [README](../README.md)
- Read [System Design Document](SYSTEM_DESIGN.md) sections 1-2

**For Implementation:**
- Read complete [System Design Document](SYSTEM_DESIGN.md)
- Review component-specific READMEs
- Study [Event Types Reference](../backend/src/events/types.ts)

**For Operations:**
- Review [Deployment Guide](DEPLOYMENT.md) (TBD)
- Check component `.env.example` files
- Understand [System Design Document](SYSTEM_DESIGN.md) section 6 (Cross-Cutting Guarantees)


## Architectural Principles

1. **Events are the sole source of truth**
2. **No long-lived mutable state**
3. **No agent behavior**
4. **LLM as fact extraction appliance only**
5. **Threads represent obligations, not conversations**
6. **Reminder state is derived, not stored**

See [System Design Document](SYSTEM_DESIGN.md) for complete details.

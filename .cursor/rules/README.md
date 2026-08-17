---
description: Global project rules for nuxt-cms-core
alwaysApply: true
---

# nuxt-cms-core Project Rules

## Project

- This project is a reusable CMS Core for Nuxt 4.
- The project must remain simple, maintainable and scalable.
- The CMS is designed for content management, not page building.
- Prefer long-term maintainability over short-term convenience.
- Avoid overengineering and unnecessary abstractions.

---

# Core Principles

- CMS Core contains reusable functionality only.
- Client Projects contain business logic.
- Keep a clear separation between Core and Client Projects.
- Prefer extending existing architecture over introducing a new one.
- Reuse existing code before creating new implementations.
- Every architectural decision should simplify future development.

---

# CMS Scope

CMS Core MAY contain:

- Admin Panel
- Edit Mode
- Authentication
- Users & Roles
- Media Library
- Forms
- Localization
- Generic CMS Components
- Generic Repositories
- Generic Composables
- Generic Utilities
- Generic Plugins
- Generic Middleware

CMS Core MUST NEVER contain:

- Business logic
- Ecommerce logic
- Booking logic
- Product logic
- Landing page logic
- Business-specific UI
- Project-specific repositories
- Client-specific components

---

# Page Structure

The CMS is NOT a page builder.

Always follow these rules:

- Developers create page structure in Nuxt code.
- Database stores editable content only.
- Never store page layout in database.
- Never store component hierarchy in database.
- Never generate drag & drop builders.
- Never build a dynamic page builder.

Users may:

- edit content
- create template pages
- manage supported collections

Users may NOT:

- change page layout
- reorder sections
- build pages visually

---

# Components

CMS Components must always remain generic.

Examples:

- CmsText
- CmsImage
- CmsButton
- CmsCollection

Never create:

- Hero components
- Pricing components
- Product components
- Business-specific sections
- Client-specific UI

Business UI belongs to the Client Project.

---

# Architecture

Use:

- Nuxt Layer
- Nuxt Module
- Repository Pattern
- Composition API
- TypeScript

Architecture flow:

UI
→ Composable
→ Repository
→ Database Adapter

Never bypass repositories.

Repositories hide implementation details.

The database provider must remain replaceable.

Never tightly couple the project to Supabase.

---

# Database

The database stores editable content only.

Never store:

- page structure
- frontend layout
- component hierarchy

Collections store only business data.

Keep schema simple.

Avoid unnecessary complexity.

---

# Migrations

Create migrations ONLY when database schema changes.

Rules:

- Prefer one migration per feature.
- Avoid multiple tiny migrations.
- Avoid duplicate migrations.
- Keep migrations clean and readable.
- Do not generate migrations unless required.

---

# Development Rules

Never:

- create git commits
- push code
- create pull requests
- create git tags
- install new packages without asking
- update dependencies without asking
- rename unrelated files
- move project structure without asking
- remove existing functionality unless requested
- perform large refactors unless requested

Only implement the requested feature.

Avoid changing unrelated code.

---

# Code Style

Always:

- use Composition API
- use strict TypeScript
- write readable code
- use explicit naming
- create small focused functions
- reuse existing code

Avoid:

- any
- magic values
- duplicated code
- deep nesting
- unnecessary abstractions
- unnecessary design patterns

Prefer readability over clever code.

---

# Performance

Public website must NEVER load:

- Edit Mode
- Admin UI
- Editor libraries
- Admin-only JavaScript

Use lazy loading whenever possible.

Minimize runtime overhead.

Avoid unnecessary watchers.

Avoid unnecessary reactive state.

---

# UI

Keep UI:

- simple
- modern
- minimal
- consistent

Prefer project components.

Avoid heavy UI frameworks.

Use project styling conventions.

---

# AI Behaviour

Before implementing:

- understand the existing architecture
- search existing code
- reuse existing patterns

If requirements are unclear:

ASK FIRST.

Never:

- invent requirements
- invent architecture
- invent database schema
- silently introduce new patterns
- silently change architecture

Explain architectural changes before implementation.

Prefer consistency over novelty.

Think like a Senior Software Engineer.

---

# Future Compatibility

Always keep architecture compatible with:

- npm package distribution
- future CLI
- backend replacement
- project updates

Never introduce decisions that make backend replacement difficult.

---

# General Principles

Prefer:

- simplicity
- consistency
- maintainability
- scalability
- explicit code

Avoid:

- premature optimization
- unnecessary flexibility
- unnecessary configuration
- unnecessary dependencies
- enterprise patterns without real need

---

These rules have higher priority than implementation convenience.

If a request conflicts with these rules, stop and ask for clarification before implementing.
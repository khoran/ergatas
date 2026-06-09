---
name: db-access
description: >
  Database access rules for ergatas2. Use whenever writing or reviewing code that
  reads or writes the database — adding endpoints, queries, SQL, PostgREST calls,
  or data-access methods. Enforces: tables are reached only through views, and the
  application reaches views only through data-access.js (the DataAccess class).
---

# Database Access Rules

Two hard rules govern every database interaction in this project. They are not
style preferences — violating them is a defect.

## Rule 1 — Never query a table directly. Always go through a view.

The application must never read from or write to a base table. Every access goes
through a database **view** (the `web.*` views defined in `sql/20-views.sql` and
the per-feature `sql/*.sql` files, e.g. `web.users_view`, `web.organizations_view`).

- Reads, inserts, updates, and deletes all target a view, never the underlying table.
- New features that need data exposed must add a `CREATE OR REPLACE VIEW web.<name>`
  in the appropriate `sql/*.sql` file, with the right grants, RLS, and any
  `INSTEAD OF` triggers needed to make the view writable.
- PostgREST is only ever pointed at views in the `web` schema. A request URL that
  names a base table is wrong.

Why: views are the security and abstraction boundary — they enforce row-level
access, hide internal columns, and let the table schema change without breaking
callers.

## Rule 2 — Every PostgREST call has a named wrapper in `data-access.js`; the transport helpers are private to it.

All application access to those views goes through `lib/shared/data-access.js`
(the `DataAccess` class). There are **two layers**, and the boundary between them
is the rule:

1. **Named domain wrapper methods** — `getUser`, `saveProfile`, `getPages`,
   `recordScreening`, etc. Each one knows its own view URL, filters, and headers
   and returns domain data. **This is the only surface code outside
   `data-access.js` may call.**
2. **Low-level transport helpers** — `dbRequest` and the
   `dbGet`/`dbAuthGet`/`dbPost`/`dbAuthPost`/`dbPatch`/`dbAuthPatch`/`dbAuthDelete`
   methods. These are an **internal implementation detail of `data-access.js`**
   and must only be called from inside that file (treat them as private — and
   prefer making them actually private, e.g. `#`-prefixed, so the boundary is
   enforced by the language, not convention). The `FilterAppender` family is
   likewise an internal building block for the wrappers.

Concretely:

- For every PostgREST request the app needs, there must exist a named wrapper
  function on `DataAccess`. If one doesn't exist for what you're doing, **add it**
  — do not reach for `db*`/`dbRequest` or build a raw `fetch`/`ajax`/PostgREST
  request inline (in client components, server routes, utilities, or anywhere
  else).
- Code outside `data-access.js` calls only those named wrappers. A `db*` call
  (e.g. `self.da.dbGet('/pages_view')`, `sdb.dbAuthPost('/...')`) outside
  `data-access.js` is a Rule 2 violation — replace it with (or add) a named
  wrapper.
- New query/filter/header shape? Extend `DataAccess` (a new method, or a
  `FilterAppender` subclass), keeping the inline URL/header construction inside
  `data-access.js`.

Why: the wrapper layer is the single place that owns view URLs, auth tokens,
read-only guards (`ensureNotReadOnly`), error handling, and PostgREST URL/filter
construction. Calling the transport helpers directly scatters that knowledge,
skips those guarantees, and couples callers to PostgREST URL shapes.

> Known debt (as of 2026-06): the core app already follows this (dozens of named
> methods). The bypasses to clean up are server-side — `lib/server/worker-documents.js`
> (~21 direct `db*` calls), the `lib/server/grants/*` modules (`records.js`,
> `ofac.js`, `board.js`, `agreements.js`, `grantees.js`), `lib/server/utils.js`,
> and `lib/components/manage-wiki-pages.js` (`dbGet('/pages_view')` fallback).
> These should grow named wrappers (and may motivate splitting `data-access.js`
> into web-schema vs. grants-schema method groups).

## Checklist when touching data

1. Is there a view for this data? If not, add one in `sql/`.
2. Am I calling a **named** `DataAccess` wrapper method? If I'm writing a raw
   request — or calling `db*`/`dbRequest` from outside `data-access.js` — stop and
   use (or add) a named wrapper instead.
3. Does the wrapper's URL/PostgREST target a view name, never a base table?
4. Are `dbRequest`/`db*` still confined to `data-access.js` (ideally private)?

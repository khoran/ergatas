# Foreign Grant Compliance System — Legal Justification

**Internal reference document. Not part of the Ergatas website and not published to users.**

> **This is not legal advice.** It records *why* each part of the grant system exists and
> which legal principle it is designed to serve, so the design can be reviewed with counsel.
> Attestation wording, voting rules, governing law, records-retention periods, and any
> transaction touching a comprehensively sanctioned jurisdiction must be confirmed with
> qualified nonprofit counsel and your accountant before use.

## Purpose and audience

The system lets a U.S. public charity (a §501(c)(3) organization) disburse funds to foreign
charities while (a) preserving the grantor's **discretion and control** over the funds,
(b) avoiding **conduit / earmarking** treatment, (c) meeting **U.S. sanctions and
anti-terrorist-financing** obligations, and (d) documenting **board governance**. Each step
produces an immutable, hash-stamped record that links to the step before it, forming a
traceable evidence chain per grantee. The sections below map each component of the system to
the legal principle it implements.

The components referenced here live in `lib/server/grants/` and `lib/components/grant-*`,
with schema in `sql/40..45-grants*.sql`. The user-facing documentation is at
`lib/page-templates/docs/grant-*.html`.

---

## 1. Overall framework — discretion and control; the anti-conduit doctrine

**What the system does:** Treats every grant as the grantor's own charitable expenditure —
board-approved for a specific grantee and charitable purpose, governed by an agreement that
reserves the grantor's control, and substantiated by screening, approval, disbursement, and
reporting records.

**Legal basis:**

- A U.S. public charity may make grants to foreign organizations in furtherance of its **own**
  exempt purposes. The grantor must exercise **discretion and control** over the use of the
  funds and must not act as a mere **conduit** passing earmarked contributions to a
  predetermined foreign recipient. Contributions solicited or accepted for a *specific* foreign
  organization, with the U.S. charity acting only as a pass-through, are not deductible and
  jeopardize exempt treatment (the "conduit" problem). The controlling IRS guidance is the line
  of revenue rulings on domestic charities making foreign grants — **Rev. Rul. 63-252**,
  **Rev. Rul. 66-79**, and **Rev. Rul. 68-489** — which turn on the U.S. charity's control over
  and review of the ultimate use of the funds.
- **Public charity vs. private foundation.** This system is designed for a **public charity**.
  A private foundation making foreign grants generally must exercise **expenditure
  responsibility** under **IRC §4945(d)(4)/(h)** or make an **equivalency determination**; a
  public charity is not held to that specific regime, but documenting discretion and control to
  the same evidentiary standard is the prudent way to defend the grants. The board-approval,
  agreement, and reporting records here are built to that standard.

**Where in the system:** the board-approval "exempt-purpose & control finding"
(`board.js`, `board-approval-form.*`); the agreement's discretion/control and
independent-relationship clauses (`agreement-template.md`); the whole linked evidence chain.

---

## 2. OFAC / sanctions screening and due diligence

**What the system does:** Before any board decision, screens the grantee organization, its
directors/officers/key employees, and beneficial owners against OFAC lists, checks the
jurisdiction, records a disposition for every result, and captures a due-diligence summary. A
non-clear result gates the grant.

**Legal basis:**

- **OFAC sanctions prohibitions.** U.S. persons — including U.S. charities — are prohibited
  from transacting with sanctioned parties. These prohibitions are administered by OFAC under
  the **International Emergency Economic Powers Act (IEEPA)** and the **Trading with the Enemy
  Act (TWEA)** and are **mandatory**, not optional. Screening is how the charity avoids an
  unlawful transaction.
- **The lists.** Screening runs against the **Specially Designated Nationals (SDN) List** and
  the **Non-SDN Consolidated Sanctions List**.
- **The 50% Rule.** Entities owned 50% or more, individually or in aggregate, by blocked
  persons are themselves blocked even if not separately named — hence screening beneficial
  owners.
- **Sanctioned jurisdictions.** Comprehensively sanctioned countries/regions can require an
  OFAC **license** before any transaction; the jurisdiction check flags this.
- **USA PATRIOT Act / BSA / AML.** Anti-money-laundering and counter-terrorist-financing law
  informs the "know your grantee" posture.
- **Treasury Anti-Terrorist Financing Guidelines.** Treasury's voluntary best-practice
  guidelines for U.S.-based charities frame screening as one part of a broader, risk-based
  approach. The guidelines are *voluntary*; the underlying OFAC prohibitions are **not**.
- **Point-in-time + re-screening.** Because the lists change frequently, results are bound to a
  list version/date and re-run at annual review and on trigger events; a confirmed match halts
  the relationship.

**Where in the system:** `ofac.js`, `screening.js`, `ofac-screening.*`; the
`ofac_screening` and `due_diligence` records (`sql/41-grants-ofac.sql`).

---

## 3. Board review and approval; the exempt-purpose / anti-conduit finding

**What the system does:** Records a **grantee-specific** board decision (never a blanket
approval), gated on completed screening and due diligence, including a verbatim affirmation
that the grant furthers the organization's own exempt purposes and that it retains discretion
and control and is not a conduit. Captures per-member votes, quorum, recusals, conditions, and
any delegated disbursement scope.

**Legal basis:**

- The board decision is the **primary evidence of discretion and control** (see §1). Approving
  a named grantee, a defined charitable purpose, and a term — rather than "foreign grantmaking"
  in general — is what distinguishes an exercise of independent judgment from a conduit
  arrangement.
- **State nonprofit corporation law and the organization's bylaws** govern the voting mechanics
  (quorum, majority, recusal for conflicts of interest, who may finalize the record). These are
  configurable and must be confirmed against the applicable state statute and bylaws.
- **Conflict-of-interest / duty of loyalty.** Per-member recusal with a recorded conflict reason
  supports the board members' fiduciary duties.
- **Delegation.** Recording a specific delegated disbursement scope keeps later staff
  disbursements within an authority the board actually granted; anything outside it requires a
  fresh decision.

**Where in the system:** `board.js`, `board-approval-form.*`; the board-approval record with
`exempt_purpose_finding`, `votes[]`, `quorum_met`, `delegation` (`sql/42-grants-board.sql`).

---

## 4. Grant agreement clauses

**What the system does:** Binds the grantee, in a versioned written agreement, to use funds
only for the charitable purpose, to report, to comply with law, to keep and produce records,
and to return unused funds — and reserves the grantor's control.

**Legal basis, clause by clause:**

- **Charitable-purpose restriction** — implements the deductibility/exempt-use requirement of
  **IRC §170(c)(2)(B)** (funds used exclusively for charitable purposes) and the discretion-and-
  control doctrine (§1).
- **Reporting obligation** — produces the substantiation the grantor needs to show the funds
  were used as intended; fulfilled through the Salary-Use Report (§6).
- **Records, inspection, and audit / site visits** — preserves the grantor's ability to verify
  use, reinforcing control.
- **Return of unused or misused funds** — keeps the funds dedicated to the charitable purpose
  and under the grantor's control until properly expended.
- **Anti-terrorism / sanctions / anti-bribery / AML representations** — flow-down of the OFAC,
  PATRIOT Act, **Foreign Corrupt Practices Act (FCPA)**, and AML obligations to the grantee.
- **Independent-relationship / anti-conduit clause** — states that no agency, partnership, or
  conduit relationship is created, directly supporting §1.
- **Governing law and dispute resolution (e.g., California law; arbitration)** — a business
  term to confirm with counsel for enforceability against a foreign counterparty.

**Where in the system:** `agreement-template.md`, `agreements.js`, `grant-agreements.*`.

---

## 5. Online acceptance (electronic signature / clickwrap)

**What the system does:** Presents the exact agreement text, requires affirmative, deliberate
assent (unchecked-by-default boxes, optional typed signature), captures E-SIGN consent, and
records a durable, tamper-evident proof of assent (document hash + snapshot, server timestamp,
IP/user-agent, signer identity, version binding).

**Legal basis:**

- **E-SIGN Act — 15 U.S.C. §7001 et seq.** and the state-law **Uniform Electronic Transactions
  Act (UETA)** give electronic signatures and records the same legal effect as handwritten ones,
  provided the parties consent to transact electronically and can retain a copy — which is why
  the flow captures an explicit electronic-records consent.
- **Enforceability of clickwrap.** Courts enforce online assent when the user takes a deliberate
  affirmative action after the terms are conspicuously presented. The design (no pre-checked
  boxes, terms shown in full, disabled submit until assent) is built to that standard.
- **Evidentiary integrity.** Storing a **hash and snapshot** of the exact version shown, a
  **server-side** timestamp, and the signer's identity lets the grantor later prove *which*
  terms were agreed to and *when* — supporting both contract enforceability and IRS
  substantiation. The record is write-once; a new version requires re-acceptance.

**Where in the system:** `grant-acceptance.*`, `agreements.js`, `records.js`; the acceptance
record (`sql/43-grants-agreements.sql`).

---

## 6. Salary-use reporting

**What the system does:** Has the grantee certify, per period, how grant funds were applied to
staff salaries, reconciling funds sent against funds applied, with explicit attestations and a
signature.

**Legal basis:**

- **Substantiation of charitable use.** The report is the grantor's evidence that the funds were
  used for the charitable purpose — the ongoing proof that supports the discretion-and-control
  position (§1) and the deductibility of the underlying contributions.
- **Fulfillment of the agreement's reporting clause** (§4), binding each report to the agreement
  version in force for the period.
- **Reconciliation as control evidence.** Requiring every variance to be explained, and every
  report to be attested and signed, converts a data-collection step into an accountability
  record.
- **Data protection.** Naming individual foreign employees can implicate **GDPR-type** data-
  protection regimes; the role-based mode lets names stay in the grantee's own records while
  still reporting by role.

**Where in the system:** `reports.js`, `salary-report-form.*`; the report record
(`sql/44-grants-reports.sql`).

---

## 7. Disbursement tracking within delegated scope

**What the system does:** Records fund releases against a board approval's delegated scope and
monthly cap, rejecting anything over the cap or against a suspended/terminated decision.

**Legal basis:** Enforces that money moves only within the authority the **board** actually
delegated (§3), so routine staff disbursements never drift outside an approved scope. This is
the operational expression of discretion and control between board meetings.

**Where in the system:** `disbursements.js`, `grant-disbursements.*`
(`sql/45-grants-disbursements.sql`).

---

## 8. Immutability, hashing, and versioning (cross-cutting)

**What the system does:** Sets record IDs, timestamps, content hashes, and identities
**server-side**; stores every record **write-once**; and versions agreements append-only, with
supersession instead of edit/delete.

**Legal basis:** An audit trail is persuasive only if it cannot be altered after the fact.
Server-authoritative integrity values and write-once storage make the records suitable as
**IRS substantiation** and as evidence in any dispute, and align with the organization's
records-retention obligations. Superseding rather than deleting preserves the full history a
regulator or auditor would expect to see.

**Where in the system:** the server-side record helpers (`records.js`) and the write-once
grants schema (`sql/40-grants.sql`).

---

## Summary map

| System part | Primary legal basis |
|---|---|
| Overall framework | Discretion & control / anti-conduit — Rev. Rul. 63-252, 66-79, 68-489; §501(c)(3); public-charity vs. §4945 PF regime |
| OFAC & due-diligence screening | OFAC prohibitions (IEEPA/TWEA), SDN/Consolidated lists, 50% Rule; USA PATRIOT Act; BSA/AML; Treasury ATF Guidelines |
| Board review & approval | Discretion & control evidence; state nonprofit law & bylaws; conflict-of-interest/duty of loyalty |
| Grant agreement clauses | §170(c)(2)(B) charitable use; reporting/records/return-of-funds; FCPA/OFAC/AML flow-down; anti-conduit clause |
| Online acceptance | E-SIGN Act (15 U.S.C. §7001) & UETA; clickwrap enforceability; evidentiary integrity |
| Salary-use reporting | Substantiation of charitable use; agreement reporting clause; GDPR-type data protection |
| Disbursement tracking | Board-delegated authority (discretion & control between meetings) |
| Immutability / hashing / versioning | Audit-trail integrity; IRS substantiation; records retention |

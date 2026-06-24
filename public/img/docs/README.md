# Screenshots for the Ministry Review docs page

These images are referenced by `lib/page-templates/docs/ministry-review.html` and served at
`/img/docs/<file>`. They were captured from the live feature on the local Docker stack
(org 4 "Global Recordings Network USA", which has Ministry Review enabled) by the Playwright
spec `test/e2e/screenshots-ministry-review.spec.js`.

| File | What it shows | Captured |
|------|---------------|----------|
| `manage-org-enable.png` | Manage Organization edit form → the **Ministry Review Documents** section: enable checkbox, **Report Frequency**, **Deadline Day of Month**. | ✅ |
| `manage-org-compliance.png` | The **Ministry Review Documents Submitted** table — Worker / Documents Submitted / Pending Reminders + Refresh. | ✅ |
| `worker-files-tab.png` | A worker profile → **Files** tab → **Ministry Review Documents** with the **Add Document** form open (Document Type, Submission Period, Choose File & Upload). | ✅ |

A fourth shot of an *uploaded* document thumbnail was intentionally not captured: it requires a
real upload through Uppy/transloadit (an external service) which leaves a persistent blob in
storage, so the docs page describes that step in text instead of an image.

## Re-capturing

```
source .test_user_creds   # SHOT_EMAIL / SHOT_PASSWORD for a local org-4 admin (gitignored)
NODE_OPTIONS=--no-deprecation npx playwright test \
  test/e2e/screenshots-ministry-review.spec.js --workers=1
```

The spec logs in via the local FusionAuth OAuth flow and writes the PNGs straight into this
folder. The compliance table is populated from `web.worker_documents` /
`web.worker_document_reminders` rows; seed a couple of disposable rows (tagged
`created_by='screenshot-seed'`) first if the table is empty.

# Grant email templates

Mailgun stored templates used by the grants module. Mailgun is the source of truth at send
time (`sendTemplatedEmail(name, …)` passes only the template name); these files are the
version-controlled copies.

| Template | Sent by | Subject | Variables |
|---|---|---|---|
| `grant-report-reminder` | `report-reminders.js` (daily) | Annual grant report due | `firstName`, `granteeOrg`, `reportUrl`, `reports[]` = `{year, deadlineDate, overdue, remindersSent, maxReminders}` |

Upload or update (handlebars engine, from the repo root):

```sh
source <(grep -E "^MAILGUN_(API_KEY|DOMAIN)=" .env)
# first time: create the template
curl -s --user "api:$MAILGUN_API_KEY" "https://api.mailgun.net/v3/$MAILGUN_DOMAIN/templates" \
  -F name=grant-report-reminder -F description="Annual grant salary-use report reminder" \
  -F engine=handlebars -F tag=initial -F headers='{"Subject":"Annual grant report due"}' \
  -F template="<lib/server/grants/email-templates/grant-report-reminder.html"
# later changes: add a new active version
curl -s --user "api:$MAILGUN_API_KEY" "https://api.mailgun.net/v3/$MAILGUN_DOMAIN/templates/grant-report-reminder/versions" \
  -F tag=v$(date +%Y%m%d) -F active=yes -F engine=handlebars -F headers='{"Subject":"Annual grant report due"}' \
  -F template="<lib/server/grants/email-templates/grant-report-reminder.html"
```

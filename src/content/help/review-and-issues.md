---
title: "Review & Issues: fix what Tubes flags"
collection: cost-control
summary: "Every issue the approval rules raise shows up in Review & Issues with its reason. Info and warnings can be approved; a block must be resolved first."
order: 6
date: 2026-09-17
---
The **Review & Issues** tab of the Finance hub lists the transactions that have something open: an issue from the payment approval rules, an unlinked line, a missing cost type.

## Read the issue

Each transaction shows its issues with the reason in plain words, for example "This invoice has no matched PO reference", "Line exceeds the live PO remainder: line 1,200, available 900, overdraw 33%", or "This invoice appears to duplicate transaction #482".

Issues have a severity:

- **Info**: noted, does not stop anything.
- **Warning**: shown to the approver, who can approve anyway.
- **Block**: the transaction cannot be selected for approval until the issue is resolved.

## Resolve

Depending on the issue:

- Link the line to the right purchase order, or add the committed cost that was never recorded.
- Add the missing cost type.
- Delete a duplicate, or mark it as a genuine second invoice.
- Request a correction from the supplier.
- Waive the issue with a note when it is correct as it is (for example a legitimately old invoice).

Then choose **Retry validation**. When no block remains, the transaction moves to **Approval**.

## Missing approvers

When a project has no operational approvers configured, a transaction gets stuck waiting. Tubes notifies the person who flagged it, and the project owner sets the approvers under **Project team**. See [How approval works](/help/approvals/how-approval-works/).

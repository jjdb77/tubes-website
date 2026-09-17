---
title: "How approval works: controller, project team and finance"
collection: approvals
summary: "A transaction is reviewed level by level: the controller checks it, the project team approves it, finance releases it for export. Who sits where is set per project."
order: 1
date: 2026-09-17
---
Approval in Tubes is a fixed route with people you choose per project.

## The route

1. **Controller**: checks that the invoice is read correctly, linked to the right cost types and purchase orders, and that the issues from the approval rules are resolved.
2. **Project team**: the required reviewers on the project approve, level by level. A producer may be level 1 and the executive producer level 2; level 2 only sees it after level 1 approved.
3. **Finance**: the final approval, after which the transaction is ready for export to Excel or the accounting system.

The account setting **May skip the review** lets a transaction go straight to the project team when there is nothing for the controller to check.

## Set the approvers per project

Open the project and go to **Project team**. Assign the people and their level. A project without operational approvers stops transactions in their tracks: Tubes flags it ("no operational approvers configured, transaction is stuck waiting") and notifies the person who noticed.

## Where approvers work

- **Approvals** in the sidebar shows what is waiting for you, with a badge for the count. See [Approve or reject a transaction](/help/approvals/approve-or-reject-a-transaction/).
- Finance works in the **Approval** tab of the Finance hub, where validated invoices can be approved in bulk. See [Bulk approval and export](/help/approvals/bulk-approval-and-export/).

## Rules before people

Before anyone approves, the payment approval rules have already checked the transaction for a missing PO, an overdrawn PO, a duplicate, a missing cost type, an unusual VAT rate, a high amount or an old invoice date. A blocking issue must be resolved first. See [Payment approval rules](/help/approvals/payment-approval-rules/).

## Budgets have their own approval

Approving a budget is separate from approving costs: see [Budget approval and signers](/help/approvals/budget-approval-and-signers/).

---
title: "Register a cost manually and link it to the budget"
collection: cost-control
summary: "Add a transaction by hand, split it into lines, give each line a cost type and project, and link it to the purchase order it belongs to."
order: 3
date: 2026-09-17
---
Not every cost arrives as a document. A cash receipt, a bank charge or an internal cost can be entered by hand.

## Add a transaction

1. Open **Finance > Transactions** (or **Production > Transactions** in the project) and choose **New transaction**.
2. Fill in the header: supplier, reference, invoice date, due date, currency and the totals.
3. Add lines. A line has a description, an amount, a VAT rate, a cost type and a project. Split a line when one invoice covers two productions or two cost types.

## Link to the budget

The cost type on a line is what connects the cost to the budget: budget lines carry cost types, and the forecast sums cost per cost type. A line without a cost type raises an issue and is not counted in cost to date.

Where a purchase order exists, link the line to it (**Link expectation**). The forecast then knows this invoice fulfils that commitment and does not count it twice. **Unlink** when it was the wrong one. Tubes also tries to match automatically; **Retry matching** runs that again after you changed the reference.

## VAT

The VAT rules of the account decide which VAT is recoverable. Mark VAT as **non-recoverable** on a line when it counts as cost, for example on foreign invoices.

## Currencies

A transaction in another currency uses the FX rate of the project. **Refresh FX** takes the current project rate; the currency of a transaction can be changed while it is not yet approved.

## Request a correction

When an invoice is wrong (wrong amount, missing PO number), **Request correction** sends the supplier a message from Tubes and parks the transaction until the corrected version arrives.

## Retry validation

After fixing a line, **Retry validation** runs the payment approval rules again so the issue clears and the transaction can move to approval.

---
title: "Payment approval rules"
collection: approvals
summary: "Seven checks that run on every invoice before approval, each set to Info, Warning or Block with your own thresholds."
order: 3
date: 2026-09-17
---
The payment approval rules are the automatic checks that run on every transaction when it is validated. An administrator sets them under **Settings > Payment Approval Rules**.

## The rules

| Rule | What it checks |
| --- | --- |
| Missing PO reference | The invoice has no matched purchase order. |
| Line exceeds PO remainder | An invoice line is above the live remainder of its PO. Above the **Block overdraw %** you set, it becomes blocking. |
| Duplicate invoice reference | The invoice appears to duplicate another transaction. |
| Missing cost type | One or more invoice lines have no cost type. |
| High VAT rate | All lines carry a VAT rate above the expected threshold. |
| High value requires controller | The invoice total is above the **Threshold** you set, so a controller override is required. |
| Stale invoice date | The invoice date is older than the **Maximum age in months** you set. |

## Severities

Each rule has a severity:

- **Info**: noted on the transaction, nothing else.
- **Warning**: shown to approvers, who can approve or waive it.
- **Block**: the transaction cannot be selected for approval until the issue is resolved.

A rule can be switched off entirely.

## Choosing the settings

Start strict on what costs money twice (duplicate, PO overdraw as Block) and lenient on what is often legitimate (stale date as Warning). Raise thresholds when finance is waiving the same warning every day.

## Where issues appear

On the transaction, in **Review & Issues** and in the approver's queue, each with the message in plain words and the numbers behind it. See [Review & Issues](/help/cost-control/review-and-issues/).

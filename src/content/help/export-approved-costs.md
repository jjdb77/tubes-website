---
title: "Export approved costs to Excel or your accounting system"
collection: imports-exports
summary: "Approved transactions leave Tubes in batches: as an Excel file, or straight into Xero or Exact. Every batch is logged and can be re-exported or undone."
order: 4
date: 2026-09-17
---
Once finance has approved transactions, they wait on the **Export** tab of the Finance hub.

## Export to Excel

1. Tick the items, or all of them.
2. Choose **Export to Excel** and confirm. The items are marked as accepted and grouped in a numbered **batch**.
3. Download the file. It contains the headers and lines with cost types, projects, amounts and VAT, ready for your bookkeeper.

## Export to accounting

With an accounting integration connected and export enabled, the button reads **Export to Xero** (or Exact). Tubes sends the items and shows the progress: pending, running, success, partial, failed. A partial result names how many items succeeded and how many failed; open the batch for the details per item.

The export is blocked when items are not mapped yet ("(n) item(s) not mapped yet"): a cost type without a ledger account, or a VAT rate without a tax code. Follow the link to complete the mapping and export again. See [Connect Xero](/help/imports-exports/connect-xero/).

## Batches, re-export and undo

Every export is a batch with number, date, who exported and the items. **Re-export** sends a batch again, for example after fixing a rejected item. **Undo** takes a batch back so its items return to Export; use it when the file was never booked.

## Attachments

With Xero, receipts and invoice documents can be exported along with the transaction, so the bookkeeper sees the PDF in Xero.

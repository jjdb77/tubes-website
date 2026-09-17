---
title: "Import payment card transactions"
collection: cost-control
summary: "Import the weekly export of your payment cards per production, as a batch that can be deleted again. Already imported weeks are skipped."
order: 5
date: 2026-09-17
---
Production payment cards produce many small transactions. Instead of typing them, import the export of the card provider per production per week.

## Import

1. Open **Finance** and the **Paymentcards** tab.
2. Choose the production, the week and the year.
3. Upload the export file: .xlsx, .xls or .csv.
4. Check the result: "Imported (n) batch(es) with (n) payment card transactions."

## What the file needs

The file needs the columns Tubes asks for (at least a date and an amount per row, plus the card or description columns from your provider). Rows without a valid date or amount are reported by row number. If a required column is missing, the import stops and names it.

## Batches

Every import is a batch. A batch can be deleted, which removes all its transactions. A week that was already imported for that production is skipped, so importing the same file twice does not create doubles; the message names the skipped codes.

## After the import

The card transactions are ordinary transactions: give the lines a cost type, link them to a receipt where there is one, and they move through approval like an invoice.

---
title: "Number format, currency, FX rates and VAT rules"
collection: settings
summary: "Set how amounts are displayed and in which currency before the first budget. FX rates per project, and VAT rules that decide what is recoverable."
order: 5
date: 2026-09-17
---
## Number format and default currency

Under **Settings** in the workspace setup panel you choose the number format (English 1,234.56, Dutch and most of Europe 1.234,56, Swiss 1'234.56) and the default currency, used for budgets, reports and invoices.

> **Note:** The number format and default currency can no longer be changed once a budget or transaction exists in the account. Decide before you build anything.

## FX rates

A project has its own FX rates for the foreign currencies it uses. Budget lines and transactions in those currencies use the project rate; a line can lock its own rate so it no longer follows the project. Project rates can be locked as a whole when the budget is agreed.

With Xero connected, every currency you use must also exist in Xero.

## VAT rules

VAT rules define the rates in use and whether the VAT is recoverable. They appear on budget additional costs (subtotal, VAT, total including VAT), on invoice lines, and in the export mapping to tax codes. Mark VAT as non-recoverable on a transaction line when it counts as cost.

## Per line, per production

The default currency and VAT rules are account-wide; FX rates are per project; a currency and a VAT rate can still differ per line. That order, account then project then line, is how Tubes resolves what applies.

---
title: "Import a Movie Magic budget"
collection: imports-exports
summary: "Upload the Excel export from Movie Magic Budgeting and continue working in Tubes without retyping. Every detail line comes in, with its fringes as separate percentage lines."
order: 1
date: 2026-09-17
updated: 2026-09-30
---
You can bring an existing budget from Movie Magic Budgeting into Tubes. Your budget lines are imported automatically and sorted under the cost types of your account.

## Export from Movie Magic

In Movie Magic choose **File > Export > Excel**. Tubes reads the **Account Details** sheet of that file: every detail line with its description, amount, unit, rate and currency. The budget name comes from the **Budget Metadata** sheet.

> **Note:** Only the Excel export can be imported for now. A JSON export is not supported yet; if you upload one, Tubes says so and imports nothing.

## Import into Tubes

1. During setup of a new account, the **Budget import** step offers the upload. Later, choose **Magic Movie import** from the budget actions.
2. Drop the .xlsx file (up to 50 MB).
3. Choose **Import**. The result says how many budget lines and fringe lines were imported, and which account codes were unknown and skipped.

## What happens to the codes

Movie Magic account numbers are matched to the cost types of your Tubes account. Codes that do not exist in your chart are skipped and listed, so you can add the cost types and import again, or add those lines by hand. Lines with a subtotal of zero are skipped too.

## Fringes

Tubes has no separate fringe calculation. A line that carries a fringe in Movie Magic comes in twice: the line itself, and a line with "(Fringe x%)" in its name holding the fringe amount.

## Which project the budget lands in

The imported budget is added to the **first project** of your account, not necessarily the project you had open. If your account has no project yet, Tubes creates one called "Magic Movie Import". Check the project after importing, and contact us if the budget ended up in the wrong one.

## After the import

The budget is an ordinary Tubes budget: open it, check the totals, add sales prices and additional costs, and publish it when it is agreed. See [Build a budget](/help/budgeting/build-a-budget/).

> **Tip:** Compare the imported budget with the original topsheet before you continue. The free [budget comparison tool on tubes.media](/tools/budget-compare/) shows differences between two versions line by line, in your browser.

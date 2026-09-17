---
title: "Import lists from a file"
collection: imports-exports
summary: "Import contacts, crew, items or other lists from Excel or CSV with a preview and a column mapping. An import can be undone."
order: 2
date: 2026-09-17
---
Most lists in Tubes can be filled from a file instead of typed: contacts, cast & crew, items, price lists, cost category colours, payment card transactions.

## Run an import

1. Open the list and choose **Import**, or go to **Settings > Imports**.
2. Upload the file (.xlsx, .xls or .csv).
3. Check the **preview**: the first rows as Tubes read them.
4. **Map** the columns: which column in your file is the name, which the email, which the rate. A mapping can be saved as an **import configuration** for next time.
5. **Perform** the import. The result lists what was created and which rows were skipped, with the row number and the reason.

## Undo

An import session can be undone, which removes everything it created. Use it when a mapping was wrong; then correct the mapping and run again.

## Cost category colours

A specific import sets the colour of cost categories in bulk: a file with two columns, the cost category ID and a hex colour like #7C3AED. The first row may be a header. See [Cost categories and cost types](/help/settings/cost-categories-and-cost-types/).

## Migrating from another system

Accounts that move from an older Tubes version or from FileMaker use a separate, read-only sync under **FileMaker Sync**. Tubes does this with you; it is not a self-service import.

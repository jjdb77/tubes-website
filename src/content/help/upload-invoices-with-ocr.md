---
title: "Upload invoices and let OCR read them"
collection: cost-control
summary: "Drop PDF, image, email or UBL files on the upload screen, choose the file type, process them and check what was extracted. Duplicates are flagged automatically."
order: 2
date: 2026-09-17
---
## Upload

1. Open **Finance** and choose **Upload documents**.
2. Drop one or more files, or choose **Choose files**. Supported formats: PDF, JPG, PNG, TIFF, MSG, EML, XML and UBL. An email (.msg or .eml) with the invoice attached works too.
3. Select the file type per file, or for all files at once, so Tubes recognises the right data.
4. Choose **Process all**, or process files one by one.

Each file shows **Pending**, **Processing**, **Processed** or **Error**. Open a processed file with **View Details** to see the transaction Tubes created.

## What OCR extracts

Supplier, invoice number, invoice date and due date, currency, subtotal, VAT and total, IBAN and the invoice lines. UBL and XML invoices are read directly without OCR and are always exact. For PDFs and images the extraction depends on the quality of the document: check the amounts before you link the lines.

## Duplicates

When a new invoice looks like one that already exists (same supplier, same invoice number or amount), Tubes marks it as **Duplicate** and names the transaction it duplicates. Delete the copy, or keep it if it really is a second invoice.

## After the upload

The transaction is now in **Review & Issues** or, when everything was recognised, ready for linking. Give the lines a cost type and project, link them to a purchase order if there is one, and the approval rules run. See [Link a cost to the budget](/help/cost-control/register-and-link-a-cost/).

## Suppliers can upload themselves

A supplier with portal access can submit an invoice directly, review the extracted data and send it to your controller. See [Submit an invoice through the portal](/help/portal/submit-an-invoice/).

> **Note:** PDF extraction needs an AI assistant configured for the account. If the upload screen says PDF processing is unavailable, an administrator sets it up under **Settings > Assistants**. UBL and XML uploads keep working regardless.

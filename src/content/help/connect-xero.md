---
title: "Connect Xero"
collection: imports-exports
summary: "A guided setup: connect your Xero organisation, map cost categories to ledger accounts and VAT rates to tax codes, sync contacts, and switch on export."
order: 5
date: 2026-09-17
---
Xero is the accounting destination of a Tubes workspace: approved costs go out to Xero, contacts can be synced, and the chart of accounts is mapped to your cost categories.

## Start the wizard

Open **Integrations** (or the **Xero** step during setup) and choose **Set up Xero**. The wizard asks how experienced you are with Xero and adjusts its explanations.

## Two ways to connect

- **Direct connect**: authorise Tubes in Xero and choose the organisation. The quickest route.
- **Your own Xero app**: for accounts that want their own credentials. Open the Xero Developer portal, create a **Web app**, paste the redirect URL Tubes shows you, and copy the **Client ID** and **Client Secret** into Tubes. Then authorise and choose the organisation.

If you have several Xero organisations, pick the right one; the wizard lists them.

## Map the chart of accounts

Sync the chart of accounts from Xero, then map every Tubes cost category to a Xero ledger account, and every Tubes VAT rule to a Xero tax rate. **AI auto-map** suggests a mapping from the names; check it. Alternatively, push your Tubes cost categories to Xero as new ledger accounts with **Sync to Xero**.

Unmapped items block the export later, so finish the mapping.

## Contacts

Sync contacts from Xero, or **Import from Xero** to create a relation in Tubes for every Xero contact that is not linked yet.

## Export settings

Choose the default invoice type, the default contact, an optional tracking category (for example the production number), and whether to export attachments. Then enable the export. See [Export approved costs](/help/imports-exports/export-approved-costs/).

> **Note:** Make sure your account's currency, and any FX currencies used on your projects, are also set up as currencies in Xero. Otherwise Xero rejects exports in those currencies.

## Let your accountant do it

You can invite your accountant to complete the accounting configuration for your workspace. They receive an invitation by email that expires after a set date and only gives access to this setup.

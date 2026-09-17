---
title: "Cost categories and cost types"
collection: settings
summary: "The chart that budgets, invoices and forecasts share. How it is structured, where to maintain it, and how to map it to your accounting system."
order: 3
date: 2026-09-17
---
Every budget line, every invoice line and every forecast row carries a **cost type**, and cost types are grouped in **cost categories**. That one chart is what lets Tubes put budget, actuals and forecast on the same row.

## Structure

A cost category (Crew, Camera, Post-production) contains cost types (Director of photography, Camera rental, Colour grading), each with a code, a name and a colour. The administration format chosen at signup determines the starting chart; Movie Magic accounts import theirs.

## Maintain

Under **Settings > Cost categories** and **Cost types** you add, rename, recode and reorder. A cost type in use by budgets or transactions cannot be deleted; deactivate it instead.

Colours can be set per category, or imported in bulk from a file with the category ID and a hex colour. See [Import lists from a file](/help/imports-exports/import-lists-from-a-file/).

## Administrations

An account can have several **administrations** (legal entities), each with its own ledger. Cost types are mapped to a ledger account per administration under **Cost type administrations**, which is what the export uses.

## Mapping to accounting

With Xero connected, every cost category maps to a ledger account and every VAT rule to a tax rate. Unmapped items block the export. See [Connect Xero](/help/imports-exports/connect-xero/).

## Role scope

A role can be limited to a subset of cost categories or cost types, so a department only sees its own costs. See [Roles and permissions](/help/settings/roles-and-permissions/).

> **Note:** Recoding a cost type changes it everywhere, including budgets that are already published and exports that already happened. Do it only when you are sure, and preferably not during a running production.

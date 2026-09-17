---
title: "Connect your own AI assistant (MCP) and use the API"
collection: imports-exports
summary: "Let Claude, Cursor or another AI assistant work in your Tubes account through MCP, with a token per role. Or build your own integration on the API."
order: 7
date: 2026-09-17
---
## AI assistant via MCP

Tubes has an MCP server (Model Context Protocol), so an AI assistant on your own computer, such as Claude Desktop or Cursor, can read and act in your Tubes account: ask for the forecast of a production, list open approvals, or draft a budget line.

1. Open **Settings > AI Assistant (MCP)**.
2. Create a token for a **role**. Each role in your account gets a unique token; the AI then automatically works with the permissions of that role. A token for a read-only role cannot change anything.
3. Copy the configuration snippet into your assistant. For Claude Desktop, add it to the configuration file under MCP Servers.

Remove a token to end the access immediately.

## API tokens

For your own integrations there is a REST API. Create a token under **Account > API**, use it in the authentication header, and revoke it there when it is no longer needed. Each token is tied to the user who created it and their permissions.

## Assistants inside Tubes

The AI features inside Tubes (the Help assistant, the budget draft, invoice reading, translation) run on assistants an administrator configures under **Settings > Assistants**. They use the AI credits of the account; see [Let AI draft a budget](/help/budgeting/let-ai-draft-a-budget/).

> **Note:** A token is a key to your account. Treat it like a password and never paste it in a shared document.

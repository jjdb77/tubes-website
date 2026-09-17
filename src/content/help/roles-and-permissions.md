---
title: "Roles and permissions"
collection: settings
summary: "A role is a set of permissions per screen and action, plus what the role may see: all projects or only its own, all cost types or a subset."
order: 2
date: 2026-09-17
---
Roles decide what a member can see and do. They are yours to define: a producer, a line producer, a controller, a freelancer and a financier rarely need the same screens.

## Create a role

1. Open **Settings > Roles** and choose **New role**.
2. Give it a name and tick the permissions: per screen (budgets, planning, finance, settings) and per action (view, create, edit, delete, approve, export). **Add selected permission(s) for role** adds them in one go.
3. Set the scope flags:
   - **All projects**: the role sees every project. Off: only the projects the member is on.
   - **All cost types** and **All cost categories**: off means the role only sees the ones you assign, so a department head sees only their own costs.
   - **All budget line tags**: the same for tags.
4. Set the special rights: **approvals** (may approve transactions), **financial** (sees amounts and finance screens) and **customize nav** (may hide sidebar items for themselves).

## The Producer Pro role

New accounts come with a **Producer Pro** role: full permissions except for the screens reserved for Tubes staff. Use it for the people who run productions end to end, and create narrower roles for everyone else.

## Roles and the sidebar

A sidebar item a role has no permission for is hidden automatically. See [Find your way around](/help/getting-started/find-your-way-around/).

## Roles and AI

An MCP token is created per role, so an AI assistant works with exactly that role's permissions. See [Connect your own AI assistant](/help/imports-exports/ai-assistant-mcp-and-api/).

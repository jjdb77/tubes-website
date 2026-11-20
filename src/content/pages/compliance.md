---
layout: layout.njk
title: Compliance
seo_title: "Security & Compliance | GDPR and EU Hosting | Tubes"
description: "Where Tubes keeps your production data. Servers in Germany, files in Frankfurt, AI in the EU, a data processing agreement, and the few services outside the EU named one by one."
permalink: /compliance/
sections:
  - type: hero
    kicker: Trust & security
    title: Security & Compliance
    text: |
      Your production data stays in Europe. Tubes runs on servers in Germany, and we name every service that handles your data, including the few outside the EU.
    buttons:
      - label: Book your free Production Health Check
        url: /production-finance-health-check/
    image: /assets/images/compliance-hero.jpeg
    image_alt: Security and compliance
  - type: textblock
    theme: teal
    heading: Where your data lives
    two_column: true
    text: |
      - The application and its database run on servers in Germany (Hetzner, Falkenstein)
      - Files and documents are stored in Frankfurt (AWS, eu-central-1)
      - Email from Tubes is sent from Germany (Euromailing)
      - AI features run on Mistral through its EU endpoint, checked with every call
      - This website and our CRM run in Amsterdam
      - Daily backups
  - type: textblock
    theme: light
    heading: Outside the EU, and why
    text: |
      A few services sit outside the EU. Each one runs under the EU-U.S. Data Privacy Framework or the EU Standard Contractual Clauses.

      - Payments and subscription billing (Stripe)
      - Optional sign-in with Google or Apple
      - OpenAI, only for a workspace that has agreed this with us. Otherwise no AI request goes to OpenAI.
      - Our own mailboxes (Google Workspace) and the forms on this website (Resend)
      - Error alerts to our team (Slack), and the AI tools our developers use for support (Anthropic)

      The full list of providers, with what each one does, is in our [privacy policy](https://app.tubesmedia.online/privacy).
  - type: textblock
    theme: white
    heading: Your data stays yours
    two_column: true
    text: |
      - A data processing agreement is part of our terms (chapter 4 of the NLdigital Terms 2025)
      - At least 90 days after your contract ends to export your data
      - Deleted or anonymised within 90 days after that
      - Role-based access and permissions per production
      - Full audit trails and data traceability
      - Clear data ownership and isolation per production environment
  - type: cta
    title: Talk it through with us
    text: |
      Book a free Production Health Check: 45 minutes on your production finance process, including how your data is handled.
    button:
      label: Book your free Production Health Check
      url: /production-finance-health-check/
---

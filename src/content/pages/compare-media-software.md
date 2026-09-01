---
layout: layout.njk
title: Software for media companies
seo_title: "Software for Media & Production Companies: Search & Compare | Tubes"
description: "Search and compare software for film, TV and media companies: production management, budgeting, scheduling, accounting, asset management, post-production and more. Published facts only."
permalink: /compare-media-software/
sections:
  - type: hero
    kicker: Software directory
    title: Find and compare *software* for media companies
    text: |
      Production management, budgeting and cost control, scheduling, accounting and payroll, asset management, post-production, rights: search by need, filter by category, and put up to three products side by side.

      Free and open to everyone. We list only what a vendor publishes itself, pricing included, and Tubes is listed like any other product. Missing one? Suggest it below.
    buttons_position: side
    tight: true
    buttons:
      - label: Browse software
        url: "#directory"
      - label: Suggest a product
        url: "#request-entry"
  - type: directory
    dataset: mediasoftware
    noun: products
    theme: light
    heading: Search software by what you need
    intro: |
      Type a task ("call sheets", "cost report", "review and approval"), filter by category, deployment or vendor country, and select up to three products to compare what they do, who they are for, how they are priced and what they connect to.
    search_placeholder: "Call sheets, cost report, review and approval, payroll ..."
    filters:
      - { key: category, label: Category }
      - { key: deployment, label: Deployment }
      - { key: vendor_country, label: Vendor country }
    map: false
    card:
      title: name
      subtitle: "{vendor}, {vendor_country}"
      tag: category
      text: summary
      meta:
        - { label: For, key: for_whom }
        - { label: Pricing, key: pricing_model }
      links:
        - { label: Vendor site, key: official_url }
    compare_rows:
      - { label: Category, key: category, tag: true }
      - { label: What it does, key: summary }
      - { label: For whom, key: for_whom }
      - { label: Pricing (as published), key: pricing_model }
      - { label: Deployment, key: deployment }
      - { label: Platforms, key: platforms }
      - { label: Integrations, key: integrations }
      - { label: Vendor, key: vendor }
      - { label: Founded, key: founded }
      - { label: Vendor site, key: official_url, link: true, link_label: Open }
    request_heading: Missing a product? Suggest it
    request_text: |
      Vendor or user of a tool that belongs here? Tell us the product and the official link, and we add it with verified details. We publish only what the vendor publishes, including pricing; a "Not published" is better than a guess.
    request_field_label: Product and vendor
    request_placeholder: "For example: Yamdu, by Yamdu GmbH"
  - type: feature
    theme: teal
    heading: Where Tubes fits
    lead: Budgeting, planning and cost control in one platform
    text: |
      Most production companies run a stack: a scheduling tool here, a budgeting spreadsheet there, accounting somewhere else. Tubes connects budgets, planning and actual costs in one workspace, with approvals and reporting on top, and links to the accounting system you already use.

      This directory is meant to help you choose well, whichever tools you pick. If you want to see how Tubes compares in practice, ask for a demo.
    image: /assets/images/app-dashboard.jpg
    image_alt: Projects financial overview in Tubes
    media_position: left
    button:
      label: Request a Demo
      url: /contact/
  - type: faq
    theme: white
    heading: Frequently asked questions
    items:
      - question: Is this directory independent?
        answer: |
          It is published by Tubes, which is itself listed. To keep it fair we only record what each vendor publishes on its own site, quote pricing as published or mark it "Not published", and link to the vendor rather than describing products in our own words.
      - question: Why is there no price for some products?
        answer: |
          Because the vendor does not publish one. We do not estimate prices; "Quote on request" or "Not published" is what the vendor's site says.
      - question: How do I get a product listed or corrected?
        answer: |
          Use the "Suggest it" form with the vendor's link. Vendors are welcome to submit their own product; we verify against the vendor site before listing.
  - type: cta
    title: See how Tubes fits your stack
    text: |
      Budgeting, planning and cost control in one platform, connected to the tools you keep.
    button:
      label: Request a Demo
      url: /contact/
---

---
layout: layout.njk
title: Festival, tradeshows and events
seo_title: "European Film Festivals, Markets & Trade Shows: Search & Compare | Tubes"
description: "Search film festivals, markets, series events and film & TV trade shows across Europe, see them on a map, and compare up to three side by side: dates, focus, industry programme, submissions."
permalink: /compare-film-festivals/
sections:
  - type: hero
    kicker: Festival, tradeshows and events
    title: Find and compare *festivals*, tradeshows and events
    text: |
      From Berlinale and the Marché du Film to series markets, industry conferences and broadcast technology shows: search by type, country or month, see the calendar on a map, and put up to three events side by side to decide where to premiere, sell, pitch or shop for kit.

      Free and open to everyone. Only what an event publishes itself is listed; missing one? Suggest it below. Looking for places to shoot? See the [locations guide](/compare-film-tv-locations/).
    buttons:
      - label: Browse events
        url: "#directory"
      - label: Suggest an event
        url: "#request-entry"
  - type: directory
    dataset: filmfestivals
    noun: events
    theme: light
    heading: Search festivals, tradeshows and events
    intro: |
      Type what you are after ("documentary", "co-production forum", "broadcast technology"), filter by type, country or month, and select up to three events to compare their dates, focus, industry side and submission route.
    search_placeholder: "Documentary, co-production market, broadcast technology ..."
    filters:
      - { key: type, label: Type }
      - { key: country, label: Country }
      - { key: month, label: Month }
    map: true
    card:
      title: name
      subtitle: "{city}, {country}"
      tag: type
      text: focus
      meta:
        - { label: When, key: month }
        - { label: Next edition, key: next_dates }
        - { label: Industry, key: industry }
      links:
        - { label: Official site, key: official_url }
    compare_rows:
      - { label: Type, key: type, tag: true }
      - { label: When, key: month }
      - { label: Next edition, key: next_dates }
      - { label: Focus, key: focus }
      - { label: Industry programme, key: industry }
      - { label: Submissions, key: submissions }
      - { label: Deadline, key: submission_deadline_note }
      - { label: Founded, key: founded }
      - { label: Official site, key: official_url, link: true, link_label: Open }
    request_heading: Missing an event? Suggest it
    request_text: |
      Festival, market, series event or trade show not listed, or a date that changed? Tell us which one, add the official link, and we add or correct it. We only publish dates and details the event itself publishes.
    request_field_label: Event and place
    request_placeholder: "For example: Cinekid, Amsterdam"
  - type: feature
    theme: teal
    heading: From festival calendar to production plan
    lead: Deadlines, travel and market weeks in the same schedule as the shoot
    text: |
      A festival strategy is also a schedule and a budget: delivery deadlines, market weeks, travel and accreditation costs. In Tubes you plan those milestones next to the production itself, keep the budget per scenario and see what a premiere or a market trip does to the numbers.

      Tubes does not submit films or sell accreditations; the links go straight to the events.
    image: /assets/images/tubes-agenda.png
    image_alt: Milestones and activities in the Tubes calendar
    media_position: left
    button:
      label: Request a Demo
      url: /contact/
  - type: faq
    theme: white
    heading: Frequently asked questions
    items:
      - question: Where do the dates come from?
        answer: |
          From the event's own website. If an event has not published its next dates, the field stays empty rather than being guessed, and the "When" field shows the usual month.
      - question: Can I submit a film through this page?
        answer: |
          No. Each card links to the official site and, where published, names the submission platform. You deal with the event directly.
      - question: How do I get an event listed?
        answer: |
          Use the "Suggest it" form on this page with the official link. Listing is free; we verify against the event's own publications before adding it.
  - type: cta
    title: Plan the festival run alongside the production
    text: |
      See how Tubes keeps milestones, budgets and scenarios in one place, from first cut to premiere.
    button:
      label: Request a Demo
      url: /contact/
---

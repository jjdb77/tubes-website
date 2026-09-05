---
layout: layout.njk
title: Studios, production and post-production companies
seo_title: "Film Studios, Production & Post-Production Companies in Europe: Search & Compare | Tubes"
description: "Search studios, production companies and post-production houses across Europe, see them on a map, and compare up to three side by side: specialism, services, facilities, credits. Published facts only."
permalink: /compare-media-production-companies/
sections:
  - type: hero
    kicker: Studios, production and post-production
    title: Find and compare *studios*, production and post-production companies
    text: |
      Looking for a co-producer in Poland, a service production company in Portugal, a sound stage near Berlin or a grading suite in Lisbon? Search by what you need, filter by country, type and specialism, see everyone on a map, and put up to three companies side by side.

      Free and open to everyone. Only what a company publishes itself is listed; missing one? Suggest it below. Looking for places to shoot? See the [locations guide](/compare-film-tv-locations/).
    buttons_position: side
    tight: true
    buttons:
      - label: Browse companies
        url: "#directory"
      - label: Suggest a company
        url: "#request-entry"
  - type: directory
    dataset: mediacompanies
    noun: companies
    theme: light
    heading: Search studios, production and post-production companies
    intro: |
      Type what you are after ("virtual production", "documentary", "Dolby Atmos", "service production"), filter by country, type or specialism, and select up to three companies to compare what they do, their facilities and credits, and who they belong to.
    search_placeholder: "Sound stages, co-producer, VFX, grading, service production ..."
    filters:
      - { key: country, label: Country }
      - { key: type, label: Type }
      - { key: specialism, label: Specialism }
    map: true
    card:
      title: name
      subtitle: "{city}, {country}"
      tag: type
      text: summary
      meta:
        - { label: Specialism, key: specialism }
        - { label: Services, key: services }
        - { label: Credits, key: credits }
      links:
        - { label: Official site, key: official_url }
        - { label: In the locations guide, key: guide_url }
    compare_rows:
      - { label: Type, key: type, tag: true }
      - { label: Specialism, key: specialism }
      - { label: What they do, key: summary }
      - { label: Services, key: services }
      - { label: Facilities, key: facilities }
      - { label: Credits, key: credits }
      - { label: Part of, key: group }
      - { label: Founded, key: founded }
      - { label: Official site, key: official_url, link: true, link_label: Open }
      - { label: Locations guide, key: guide_url, link: true, link_label: Show location }
    request_heading: Missing a company? Suggest it
    request_text: |
      Studio, production company or post-production house not listed, or a detail that changed? Tell us which one, add the official link, and we add or correct it. We only publish what a company itself publishes; credits, facilities and founding years stay empty rather than guessed.
    request_field_label: Company and place
    request_placeholder: "For example: Filmmore, Amsterdam"
  - type: feature
    theme: teal
    heading: From partner list to production plan
    lead: Studios, crews and post houses in the same budget and schedule
    text: |
      Choosing a studio, a co-producer or a post house is a budget decision as much as a creative one: stage weeks, service fees, delivery dates and who invoices whom. In Tubes you plan those choices in the same workspace as the rest of the production, with the budget per scenario, the schedule and the actual costs side by side.

      Tubes does not broker studios or post work; the links go straight to the companies.
    image: /assets/images/tubes-budgeting.png
    image_alt: Budget lines and scenarios in Tubes
    media_position: left
    button:
      label: Request a Demo
      url: /contact/
  - type: faq
    theme: white
    heading: Frequently asked questions
    items:
      - question: Which companies are listed?
        answer: |
          Three types: studios you can hire (sound stages, backlots, virtual production stages, TV studios, scoring stages), production companies (feature film, TV drama, documentary, commercials, animation, unscripted and service production) and post-production houses (picture, colour, VFX, sound, dubbing and full-service post). Europe only, without Russia and Belarus. Corporate video agencies, equipment rental and distributors are not included.
      - question: Where do the details come from?
        answer: |
          From each company's own website, and for founding years and credits also from Wikipedia. We write the one-sentence summary ourselves; services, facilities, credits and founding years are copied as published or left empty. A dash in the comparison means the company does not publish it.
      - question: Why are the studios also in the locations guide?
        answer: |
          Because a hireable studio is both a location and a company. The studios here are taken from the [locations guide](/compare-film-tv-locations/), where you find them on the map next to real-world locations; the link "In the locations guide" on a studio card takes you straight there.
      - question: How do I get a company listed or corrected?
        answer: |
          Use the "Suggest it" form with the official link. Companies are welcome to submit their own entry; we verify against the company site before listing. Listing is free and there is no ranking or sponsorship.
      - question: Is Tubes affiliated with these companies?
        answer: |
          No. Tubes is a production management platform, not a broker. The directory exists because a producer choosing a partner deserves better than a search engine full of adverts, and because a chosen partner becomes a line in a budget and a block in a schedule, which is where Tubes comes in.
  - type: cta
    title: Turn the choice into a plan
    text: |
      Budgeting, planning and cost control in one platform, with your studios, crews and post partners in the same picture.
    button:
      label: Request a Demo
      url: /contact/
---

---
layout: layout.njk
title: Film funds and investors in Europe
seo_title: "Film Funds and Investors in Europe: Search and Compare | Tubes"
description: "Search public film funds, regional funds, private film financiers, lenders and tax shelter investors across Europe, and compare up to three on what they fund and how to apply."
permalink: /compare-film-investors/
sections:
  - type: hero
    kicker: Free tool
    title: Find and compare *film funds and investors* in Europe
    text: |
      Public film funds, regional funds, private film financiers, specialist lenders and tax shelter investors, in one list. Search by country, kind of money and format, see them on a map, and put up to three side by side to see what they fund, at which stage, and how to apply.

      Free and open to everyone. Only what an organisation publishes itself is listed. New to film finance? [How a film is made](/how-a-film-is-made/#financing) explains grants, soft loans, equity and gap finance in plain words. For tax rebates and credits per country, see the [incentive comparison](/compare-film-incentives/).
    tight: true
    buttons:
      - label: Browse funds and investors
        url: "#directory"
      - label: Suggest one
        url: "#request-entry"
    promo:
      heading: Budgeting, planning and cost control in one platform
      text: "One workspace for budget, schedule, purchase orders and actual costs, with approvals and reporting on top and a direct link to Xero."
      chips:
        - { label: Budget, tone: blue }
        - { label: Plan, tone: amber }
        - { label: Produce, tone: teal }
      price: From € 49 per month
      button:
        label: Request a Demo
        url: /contact/
      link:
        label: More about Tubes
        url: /
  - type: directory
    dataset: filminvestors
    noun: funds and investors
    theme: light
    heading: Search film funds and investors
    intro: |
      Type what you are after ("documentary development", "gap finance", "minority co-production"), filter by country, type or kind of money, and select up to three to compare what they fund, who may apply and how.
    total_note: "each checked on the organisation's own website. Growing through your suggestions."
    search_placeholder: "Documentary, animation, gap finance, co-production ..."
    filters:
      - { key: country, label: Country }
      - { key: type, label: Type }
      - { key: instruments, label: Kind of money }
    map: true
    card:
      title: name
      subtitle: "{city}, {country}"
      tag: type
      text: summary
      meta:
        - { label: Funds, key: formats_label }
        - { label: Money, key: instruments_label }
        - { label: Stages, key: stages_label }
      links:
        - { label: Official site, key: official_url }
    compare_rows:
      - { label: Type, key: type, tag: true }
      - { label: Formats, key: formats }
      - { label: Kind of money, key: instruments }
      - { label: Stages, key: stages }
      - { label: Who can apply, key: eligibility }
      - { label: How to apply, key: how_to_apply }
      - { label: Amounts, key: budget_note }
      - { label: Founded, key: founded }
      - { label: Official site, key: official_url, link: true, link_label: Open }
    request_heading: Missing a fund or investor? Suggest it
    request_text: |
      A fund, financier or lender that invests in film or TV and is not listed, or a detail that changed? Tell us which one and add the official link. We only publish what the organisation itself publishes.
    request_field_label: Fund or investor and country
    request_placeholder: "For example: Film Fund Luxembourg"
    promo_inline: false
    promo:
      heading: Budgeting, planning and cost control in one platform
      text: "One workspace for budget, schedule, purchase orders and actual costs, with approvals and reporting on top and a direct link to Xero."
      chips:
        - { label: Budget, tone: blue }
        - { label: Plan, tone: amber }
        - { label: Produce, tone: teal }
      price: From € 49 per month
      button:
        label: Request a Demo
        url: /contact/
      link:
        label: More about Tubes
        url: /
  - type: textblock
    theme: white
    heading: The kinds of money in this list
    plain_list: true
    text: |
      - **Grant.** Money that does not have to be paid back, usually from a public fund, awarded by application and often tied to spending or cultural criteria.
      - **Soft loan.** A loan that is repaid only from the film's revenues, so the producer does not owe it back if the film does not earn. Many national funds work this way.
      - **Equity.** An investment in the film in return for a share of its income, recouped in an agreed order with the other financiers.
      - **Debt and gap finance.** A loan from a bank or specialist lender, secured on contracts already signed (pre-sales, tax credits) or on sales still to come (gap).
      - **Tax shelter.** Investment raised from companies that get a tax benefit in return, such as the Belgian Tax Shelter. Run by specialised intermediaries.

      Who decides on the money, and how it flows back, is explained step by step in [how a film is made](/how-a-film-is-made/#financing). The [production roles guide](/production-roles/) explains who does what at the producer's side of the table.
  - type: faq
    theme: light
    heading: Frequently asked questions
    items:
      - question: Where does the information come from?
        answer: |
          From each organisation's own website. Amounts, deadlines and conditions are only listed when the organisation publishes them; otherwise the field stays empty rather than being guessed. Funding rules change every year, so always check the official site before you apply.
      - question: Can I apply through this page?
        answer: |
          No. Each entry links to the official site. You apply to the fund or talk to the financier directly.
      - question: Why are tax rebates not in this list?
        answer: |
          A rebate or tax credit is not an investor you approach. It is a scheme you qualify for by spending money in a country. Those are compared in the [incentive comparison](/compare-film-incentives/) and explained per country in the [incentive guide](/film-incentives/).
      - question: Are private individuals listed?
        answer: |
          No. Only organisations that say on their own website that they finance film or TV: public funds, companies, banks and fund managers.
      - question: How do I get listed?
        answer: |
          Use the "Suggest one" form on this page with the official link. Listing is free. We check the organisation's own publications before adding it.
  - type: cta
    title: A finance plan needs a budget that holds
    text: |
      Every fund and financier asks for a budget, a schedule and later a cost report. Tubes keeps all three in one place, so the numbers you send them stay current.
    button:
      label: Request a Demo
      url: /contact/
---

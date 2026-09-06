# Microsoft Store market and language strategy

## First submission

- Availability: all possible Microsoft Store markets supported by Partner Center.
- Pricing: Free.
- Discoverability: available and discoverable in the Microsoft Store.
- Listing languages: exactly the same 101 Microsoft Store-supported locales as the packaged desktop UI and exported reports.
- Publish timing: submit only after the production package, current assets, policy URLs, declarations, and certification notes have passed final review.

Listing language and market availability are separate. Do not restrict a country merely because it does not have a dedicated localized listing; Microsoft Store can use a fallback listing. Likewise, adding a language does not by itself limit or enable a market.

## Language source of truth

`apps/desktop/src/i18n/localeCatalog.ts` is the source of truth for the 101 supported Store locales. Runtime dictionaries, localized reports, the MSIX resource declaration, and Partner Center listing columns must remain in exact one-to-one parity.

The CSV builder fails closed when Partner Center exports fewer or more than those 101 locale columns. Languages that Microsoft Store does not expose as listing languages are not added under an inaccurate substitute locale.

## Market review notes

- Keep Partner Center's available-market list as the source of truth; do not hard-code a country list in the repository.
- Complete legal contact details required by the developer account type and selected markets. Business/company accounts offering the app in France require the applicable phone and address information in Partner Center.
- Recheck sanctions, export-control, local-law, tax, and consumer-contact requirements immediately before submission.
- Age-rating answers and product declarations must describe the actual production package, not this metadata draft.

## Localization gate

Before import, every listing language must have a non-empty localized description, short description, captions, features, and search terms derived from the same complete runtime/report dictionary. The generator also enforces Store field limits and requires screenshots for every language column.

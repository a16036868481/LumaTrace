# Microsoft Store market and language strategy

## First submission

- Availability: all possible Microsoft Store markets supported by Partner Center.
- Pricing: Free.
- Discoverability: available and discoverable in the Microsoft Store.
- Listing languages: English (United States) and Chinese (Simplified) only.
- Publish timing: submit only after the production package, current assets, policy URLs, declarations, and certification notes have passed final review.

Listing language and market availability are separate. Do not restrict a country merely because it does not have a dedicated localized listing; Microsoft Store can use a fallback listing. Likewise, adding a language does not by itself limit or enable a market.

## Held languages

Chinese (Traditional) is intentionally held until a reviewer approves dedicated Traditional Chinese Store copy and screenshots. Other runtime UI dictionaries must not be added as Store listing languages until their marketing copy, privacy wording, screenshots, and product terminology receive native-speaker review.

Do not add Esperanto, Latin, or Cantonese as independent Store listing languages because Microsoft Store does not expose those listing languages. A future Hong Kong Traditional Chinese listing may use `zh-HK` only after editorial review; it must not be described as an independent Cantonese Store localization.

## Market review notes

- Keep Partner Center's available-market list as the source of truth; do not hard-code a country list in the repository.
- Complete legal contact details required by the developer account type and selected markets. Business/company accounts offering the app in France require the applicable phone and address information in Partner Center.
- Recheck sanctions, export-control, local-law, tax, and consumer-contact requirements immediately before submission.
- Age-rating answers and product declarations must describe the actual production package, not this metadata draft.

## Localization rollout gate

Add another listing language only when all of the following are complete:

1. a dedicated short description, full description, features, keywords, privacy policy, and certification notes exist;
2. terminology matches the runtime UI and exported report language;
3. current screenshots in that language have been visually reviewed;
4. a native or professionally qualified reviewer has approved the text; and
5. the language code is supported by Microsoft Store.

# Microsoft Store submission material

This directory contains reviewable Microsoft Store metadata. It does not create, sign, upload, or submit a package.

## Language parity

- The desktop UI, exported reports, and Microsoft Store listings share one catalog of exactly 101 Microsoft Store-supported locales.
- `en-US` and `zh-CN` keep manually polished listing JSON and dedicated screenshots.
- The other 102 Store listings are committed as separate JSON files built directly from their matching, complete 577-key runtime/report dictionaries. English text is not copied into localized text fields.
- `store/scripts/build-localized-listings.mjs` rejects a Partner Center CSV unless its language columns exactly match the 101-locale runtime catalog, with no missing, extra, or duplicate locale.
- The standalone generator preserves Microsoft's current `Field`, `ID`, `Type`, and `default` columns, supports the current MSIX field names, and validates Microsoft's published text limits before import.
- Screenshots may be reused across listing languages because they show the same product surface; localized captions and all textual listing fields still come from the matching locale dictionary.

## Files

- `privacy-policy.md`: consumer privacy policy in English.
- `privacy-policy.zh-CN.md`: consumer privacy policy in Simplified Chinese.
- `listings/en-US.json`: English Store listing and certification notes.
- `listings/zh-CN.json`: Simplified Chinese Store listing and certification notes.
- `listings/<locale>.json`: one explicit localized listing artifact for every other catalog locale.
- `scripts/sync-localized-listings.mjs`: deterministic direct-dictionary listing synchronizer; it preserves the two manually polished files.
- `scripts/build-localized-listings.mjs`: strict 101-language Partner Center CSV builder.
- `market-strategy.md`: market, language, pricing, and rollout decisions.

## Public URLs

The repository is public at <https://github.com/a16036868481/LumaTrace>. After these files are committed and pushed, the following interim URLs can be used:

- Privacy policy: <https://github.com/a16036868481/LumaTrace/blob/main/store/privacy-policy.md>
- Simplified Chinese privacy policy: <https://github.com/a16036868481/LumaTrace/blob/main/store/privacy-policy.zh-CN.md>
- Support: <https://github.com/a16036868481/LumaTrace/issues>

The privacy URLs are not live until the files reach the public `main` branch. A stable project-controlled website or GitHub Pages URL is preferable before final submission. Do not enter a local file path or an unpushed URL in Partner Center.

## Pre-submission boundary

The listing material is not release approval. A Store submission still requires a reserved product name, a production package, signing or a compliant MSIX route, package validation, current screenshots and artwork, age-rating answers, license terms, support/contact details, and completed Partner Center declarations.

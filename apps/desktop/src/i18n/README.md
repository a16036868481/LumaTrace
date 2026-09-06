# LumaTrace translations

- English (`en-US`) is the product default and the canonical source dictionary.
- The global planning catalog follows the 194 unique language and variant entries in the
  [Google Cloud Translation NMT catalog](https://docs.cloud.google.com/translate/docs/languages)
  snapshot dated 2026-07-31. Application locale identifiers use canonical BCP 47 tags;
  provider-specific target identifiers stay in `localeCatalog.ts`.
- The selector exposes only dictionaries that are present in `locales/` and pass validation.
  A planned language is never shown with an English fallback masquerading as a translation.
- Non-English dictionaries are loaded on demand. They are validated before tests and builds
  for exact keys, non-empty text, runtime placeholders, protected technical terms, Unicode
  integrity, and a minimum localization ratio.
- Every shipped locale is a static dictionary maintained directly in this repository. LumaTrace
  has no runtime translation dependency and does not bundle translation-model weights.
- Direct translation is not equivalent to native-speaker certification. Low-resource
  dictionaries must still be reviewed by native speakers before the product claims
  publication-grade localization.

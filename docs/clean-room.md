# Clean-Room Policy

LumaTrace implements a general cross-platform device metrics testing tool category. It must not copy commercial products.

## Prohibited

- Copying any commercial tool code.
- Copying UI, icons, visual layout, product text, interaction flows, protocols, private implementations, or proprietary logic.
- Submitting reverse engineered commercial protocols.
- Submitting private API bypass code.
- Submitting assets from commercial tools.
- Making root, jailbreak, or permission bypass the default path.
- Fabricating metrics that could not be collected.

## Allowed

- Implementing common metrics-testing concepts independently.
- Using public OS documentation and public command-line tools within their documented permissions.
- Building a new UI and product structure from first principles.
- Marking unavailable, experimental, or permission-gated capabilities honestly.

## Contributor Rules

Before adding a feature, ask:

1. Is this based on public, documented behavior?
2. Does it avoid copied code, text, assets, protocols, and layouts?
3. Does it preserve local-first privacy?
4. Does every metric have source, precision, confidence, and availability?
5. Does failure degrade to diagnostics or availability instead of fake data?

If the answer is unclear, do not merge the feature until reviewed.

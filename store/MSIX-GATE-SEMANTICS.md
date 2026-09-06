# Microsoft Store MSIX gate semantics

The Store build manifest uses separate gates so that an uploadable package is not mistaken for a release-approved package.

## `storeUploadEligible`

This gate means that the MSIX was produced and passed the package-layout checks needed to hand it to Partner Center for server-side validation. A locally CA-trusted signature is **not** required for this Store MSIX route. Microsoft signs/re-signs an accepted MSIX after certification.

The local package remains unsuitable for ordinary direct sideload distribution while it is unsigned. That direct-install limitation is recorded separately and must not be converted into a Store upload blocker.

Official references:

- [Code signing options for Windows app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Upload MSIX app packages](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/upload-app-packages)
- [Microsoft Store app certification process](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-certification-process)

## WACK evidence

When a matching local Windows App Certification Kit report is available, the build records only its file name, SHA-256, kit version, overall result, and identity/version/architecture match. It never records the user-profile path. The current report records overall `PASS`.

WACK is a local pre-submission check and is now documented as optional/deprecated; Partner Center certification is authoritative. A known overall `FAIL` still blocks this repository's internal upload gate because knowingly uploading a failed package would discard useful evidence. Absence of a local report is an advisory, not a fabricated Microsoft requirement.

- [Windows App Certification Kit](https://learn.microsoft.com/en-us/windows/uwp/debug-test-perf/windows-app-certification-kit)
- [Packaging MSIX apps and local validation](https://learn.microsoft.com/en-us/windows/msix/package/packaging-uwp-apps)

## `certificationEligible`

This stricter gate means the submission is ready to be sent for Microsoft certification. In addition to upload eligibility, it requires real evidence for:

- sidecar production approval;
- bundled dependency/license notice review;
- installed-package GUI and launch smoke testing;
- completed Partner Center listing, privacy/support, market, age-rating, capability-justification, and release fields.

Until those gates are complete, `certificationEligible` and `productionReady` remain `false`, even when `storeUploadEligible` is `true` and WACK reports overall `PASS`.

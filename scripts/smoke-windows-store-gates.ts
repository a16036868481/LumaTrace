import { evaluateStoreGates, parseWackReport } from "./windows-store-gates.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const unsignedStoreCandidate = evaluateStoreGates({
  packageBuilt: true,
  makeAppxValidated: true,
  wackOverall: "PASS",
  sidecarProductionReady: false,
  licenseReviewApproved: false,
  installedPackageGuiQaPassed: false,
  partnerCenterFormsComplete: false
});

const chineseWackPass = parseWackReport(
  '<div class="appInfo"><dt>\u5de5\u5177\u5305\u7248\u672c: </dt><dd>10.0.26100.7705</dd></div><div class="overall">\u603b\u4f53\u7ed3\u679c: <span style="color: green;">\u901a\u8fc7</span></div>'
);
assert(chineseWackPass.overall === "PASS", "The localized current WACK PASS form must parse.");
assert(chineseWackPass.kitVersion === "10.0.26100.7705", "The WACK kit version must parse.");
const englishWackFailure = parseWackReport(
  '<div><dt>Kit version: </dt><dd>10.0.1.2</dd></div><div class="overall">Overall result: <span style="color:red;">FAILED</span></div>'
);
assert(englishWackFailure.overall === "FAIL", "The English WACK failure form must parse.");
const xmlWackPass = parseWackReport(
  '<REPORT OVERALL_RESULT="PASS" VERSION="10.0.26100.7705" APP_NAME="eirros.LumaTracePerformanceLab" APP_VERSION="1.0.2.0" TOOLSET_ARCHITECTURE="x64"></REPORT>'
);
assert(xmlWackPass.overall === "PASS", "The official WACK XML PASS form must parse.");
assert(xmlWackPass.kitVersion === "10.0.26100.7705", "The official WACK XML kit version must parse.");
assert(unsignedStoreCandidate.storeUploadEligible, "An unsigned Store MSIX with passing package checks must remain upload eligible.");
assert(!unsignedStoreCandidate.certificationEligible, "Pending release evidence must keep certification eligibility false.");
assert(
  unsignedStoreCandidate.localTrustedSignatureRequiredForStoreUpload === false,
  "The upload gate must not require a local CA-trusted signature."
);
assert(unsignedStoreCandidate.storeUploadBlockers.length === 0, "Release blockers must not leak into the upload gate.");
for (const code of [
  "SIDECAR_NOT_PRODUCTION_READY",
  "LICENSE_REVIEW_PENDING",
  "INSTALLED_PACKAGE_GUI_QA_PENDING",
  "PARTNER_CENTER_FORMS_PENDING"
]) {
  assert(
    unsignedStoreCandidate.certificationBlockers.some((blocker) => blocker.code === code),
    `Certification blocker was not retained: ${code}`
  );
}

const knownWackFailure = evaluateStoreGates({
  packageBuilt: true,
  makeAppxValidated: true,
  wackOverall: "FAIL",
  sidecarProductionReady: true,
  licenseReviewApproved: true,
  installedPackageGuiQaPassed: true,
  partnerCenterFormsComplete: true
});
assert(!knownWackFailure.storeUploadEligible, "A known WACK overall failure must block the internal upload gate.");
assert(!knownWackFailure.certificationEligible, "A known WACK overall failure must block certification eligibility.");

const noLocalWackResult = evaluateStoreGates({
  packageBuilt: true,
  makeAppxValidated: true,
  wackOverall: "NOT_RECORDED",
  sidecarProductionReady: true,
  licenseReviewApproved: true,
  installedPackageGuiQaPassed: true,
  partnerCenterFormsComplete: true
});
assert(noLocalWackResult.storeUploadEligible, "Missing optional local WACK evidence must not be represented as a Store rule.");
assert(noLocalWackResult.certificationEligible, "All mandatory local and external preparation gates are complete in this fixture.");
assert(
  noLocalWackResult.advisories.some((advisory) => advisory.code === "WACK_NOT_RECORDED"),
  "Missing optional WACK evidence must remain visible as an advisory."
);

console.log("Windows Store gate semantics smoke test passed.");

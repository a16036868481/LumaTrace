export type WackOverall = "PASS" | "FAIL" | "NOT_RECORDED";

export interface StoreGateInput {
  packageBuilt: boolean;
  makeAppxValidated: boolean;
  wackOverall: WackOverall;
  sidecarProductionReady: boolean;
  licenseReviewApproved: boolean;
  installedPackageGuiQaPassed: boolean;
  partnerCenterFormsComplete: boolean;
}

export interface StoreGateIssue {
  code: string;
  message: string;
}

export interface StoreGateEvaluation {
  storeUploadEligible: boolean;
  certificationEligible: boolean;
  localTrustedSignatureRequiredForStoreUpload: false;
  storeUploadBlockers: StoreGateIssue[];
  certificationBlockers: StoreGateIssue[];
  advisories: StoreGateIssue[];
}

export interface ParsedWackReport {
  overall: Exclude<WackOverall, "NOT_RECORDED">;
  kitVersion?: string;
}

function issue(code: string, message: string): StoreGateIssue {
  return { code, message };
}

export function parseWackReport(report: string): ParsedWackReport {
  const xmlOverall = report.match(/<REPORT\b[^>]*\bOVERALL_RESULT="(PASS|FAIL)"/iu)?.[1]?.toUpperCase();
  const overallPass =
    xmlOverall === "PASS" ||
    /\u603b\u4f53\u7ed3\u679c\s*:[\s\S]{0,240}?color\s*:\s*green[^>]*>\s*\u901a\u8fc7\s*</iu.test(report) ||
    /overall\s+result\s*:[\s\S]{0,240}?color\s*:\s*green[^>]*>\s*pass(?:ed)?\s*</iu.test(report);
  const overallFail =
    xmlOverall === "FAIL" ||
    /\u603b\u4f53\u7ed3\u679c\s*:[\s\S]{0,240}?color\s*:\s*red[^>]*>\s*\u5931\u8d25\s*</iu.test(report) ||
    /overall\s+result\s*:[\s\S]{0,240}?color\s*:\s*red[^>]*>\s*fail(?:ed)?\s*</iu.test(report);
  if (overallPass === overallFail) {
    throw new Error("Unable to determine a unique WACK overall result.");
  }
  const kitVersion =
    report.match(/<REPORT\b[^>]*\bVERSION="([0-9.]+)"/iu)?.[1] ??
    report.match(
      /(?:\u5de5\u5177\u5305\u7248\u672c|kit\s+version)\s*:[\s\S]{0,180}?<dd[^>]*>\s*([0-9.]+)\s*<\/dd>/iu
    )?.[1];
  return {
    overall: overallPass ? "PASS" : "FAIL",
    ...(kitVersion === undefined ? {} : { kitVersion })
  };
}

/**
 * Evaluate two deliberately separate Microsoft Store gates.
 *
 * Store upload eligibility only answers whether the MSIX may be handed to
 * Partner Center for server-side validation. A CA-trusted local signature is
 * intentionally not an input: Microsoft re-signs certified Store MSIX/AppX
 * packages. Certification eligibility is stricter and includes the human and
 * external evidence that must be complete before submitting for certification.
 */
export function evaluateStoreGates(input: StoreGateInput): StoreGateEvaluation {
  const storeUploadBlockers: StoreGateIssue[] = [];
  if (!input.packageBuilt) {
    storeUploadBlockers.push(issue("PACKAGE_BUILD_FAILED", "The MSIX package was not produced successfully."));
  }
  if (!input.makeAppxValidated) {
    storeUploadBlockers.push(
      issue("MAKEAPPX_VALIDATION_FAILED", "MakeAppx did not successfully pack and validate the package layout.")
    );
  }
  if (input.wackOverall === "FAIL") {
    storeUploadBlockers.push(
      issue("WACK_OVERALL_FAILED", "The recorded Windows App Certification Kit overall result is FAIL.")
    );
  }

  const certificationBlockers = [...storeUploadBlockers];
  if (!input.sidecarProductionReady) {
    certificationBlockers.push(
      issue("SIDECAR_NOT_PRODUCTION_READY", "sidecar-manifest.json does not yet approve production release.")
    );
  }
  if (!input.licenseReviewApproved) {
    certificationBlockers.push(
      issue("LICENSE_REVIEW_PENDING", "Bundled dependency and notice license review is not yet approved.")
    );
  }
  if (!input.installedPackageGuiQaPassed) {
    certificationBlockers.push(
      issue("INSTALLED_PACKAGE_GUI_QA_PENDING", "Installed-package GUI and launch smoke testing is not yet approved.")
    );
  }
  if (!input.partnerCenterFormsComplete) {
    certificationBlockers.push(
      issue(
        "PARTNER_CENTER_FORMS_PENDING",
        "Partner Center listing, privacy/support URLs, markets, age rating, capability justification, and release fields are incomplete."
      )
    );
  }

  const advisories: StoreGateIssue[] = [
    issue(
      "STORE_WILL_RESIGN_MSIX",
      "A CA-trusted local signature is not required for Microsoft Store MSIX upload; Microsoft re-signs the package after certification."
    )
  ];
  if (input.wackOverall === "NOT_RECORDED") {
    advisories.push(
      issue(
        "WACK_NOT_RECORDED",
        "No local WACK result was recorded. WACK is an optional local pre-submission check; Partner Center performs official certification."
      )
    );
  }

  return {
    storeUploadEligible: storeUploadBlockers.length === 0,
    certificationEligible: certificationBlockers.length === 0,
    localTrustedSignatureRequiredForStoreUpload: false,
    storeUploadBlockers,
    certificationBlockers,
    advisories
  };
}

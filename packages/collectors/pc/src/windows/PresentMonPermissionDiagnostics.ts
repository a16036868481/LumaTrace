export interface PresentMonPermissionAnalysis {
  permissionLimited: boolean;
  logAccessUsersHint: boolean;
  adminHint: boolean;
  warnings: string[];
}

export function analyzePresentMonPermissionOutput(output: string): PresentMonPermissionAnalysis {
  const warnings: string[] = [];
  const normalized = output.toLowerCase();
  let permissionLimited = false;
  let logAccessUsersHint = false;
  let adminHint = false;
  if (/access is denied|administrator|elevat|permission|privilege|etw/iu.test(normalized)) {
    permissionLimited = true;
    adminHint = /administrator|elevat|admin/iu.test(normalized);
    warnings.push(
      "PresentMon reported a permission limitation. Some processes may require elevated permissions or may not expose present data."
    );
  }
  if (/log access users|logaccess|log users/iu.test(normalized)) {
    logAccessUsersHint = true;
    warnings.push("Windows Windows log access group membership may be required for some PresentMon captures.");
  }
  if (/unknown process|could not.*process|no process|process.*not found/iu.test(normalized)) {
    warnings.push("PresentMon could not resolve the target process during capture.");
  }
  return {
    permissionLimited,
    logAccessUsersHint,
    adminHint,
    warnings
  };
}

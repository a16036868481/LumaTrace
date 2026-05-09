import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

interface ManualGuiQaStep {
  id: string;
  section: string;
  text: string;
  status: "pending";
  evidenceNote: null;
  reviewerNote: null;
}

interface WindowsManualGuiQaTemplate {
  schemaVersion: 1;
  generatedAt: string;
  evidenceKind: "windows-manual-gui-qa-template";
  status: "template_pending";
  productionReady: false;
  unsignedDraft: true;
  sourceChecklist: {
    path: "docs/windows-packaging-manual-gui-checklist.md";
    sha256: string;
    sectionCount: number;
    itemCount: number;
  };
  linkedAutomatedEvidence: {
    fileName: "lumatrace-windows-packaging-qa-evidence.json";
    exists: boolean;
    sha256?: string;
    sizeBytes?: number;
  };
  reviewer: {
    name: null;
    completedAt: null;
    environment: null;
  };
  steps: ManualGuiQaStep[];
  completionRules: string[];
  securityAssertions: {
    tokenRedactionRequired: true;
    fullLocalPathRedactionRequired: true;
    rawLogsExcluded: true;
    stackTracesExcluded: true;
    publicSidecarListenersAllowed: false;
  };
  limitations: string[];
}

const root = process.cwd();
const releaseDir = resolve(root, "apps/desktop/src-tauri/target/release");
const checklistPath = resolve(root, "docs/windows-packaging-manual-gui-checklist.md");
const automatedEvidencePath = resolve(releaseDir, "lumatrace-windows-packaging-qa-evidence.json");
const templatePath = resolve(releaseDir, "lumatrace-windows-manual-gui-qa-template.json");

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function slug(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/`([^`]+)`/gu, "$1")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalized.length > 0 ? normalized : "item";
}

function parseChecklist(text: string): { sections: string[]; steps: ManualGuiQaStep[] } {
  const sections: string[] = [];
  const steps: ManualGuiQaStep[] = [];
  let currentSection = "General";
  const sectionCounters = new Map<string, number>();

  for (const line of text.split(/\r?\n/u)) {
    const sectionMatch = /^##\s+(.+)$/u.exec(line);
    if (sectionMatch !== null) {
      currentSection = sectionMatch[1].trim();
      sections.push(currentSection);
      continue;
    }

    const itemMatch = /^-\s+(.+)$/u.exec(line);
    if (itemMatch === null) {
      continue;
    }

    const count = (sectionCounters.get(currentSection) ?? 0) + 1;
    sectionCounters.set(currentSection, count);
    const sectionSlug = slug(currentSection);
    steps.push({
      id: `${sectionSlug}-${String(count).padStart(2, "0")}`,
      section: currentSection,
      text: itemMatch[1].trim(),
      status: "pending",
      evidenceNote: null,
      reviewerNote: null
    });
  }

  return { sections, steps };
}

if (!existsSync(checklistPath)) {
  console.error("Manual GUI checklist is missing: docs/windows-packaging-manual-gui-checklist.md");
  process.exit(1);
}

const checklistText = readFileSync(checklistPath, "utf8");
const parsedChecklist = parseChecklist(checklistText);
const linkedAutomatedEvidence: WindowsManualGuiQaTemplate["linkedAutomatedEvidence"] = {
  fileName: "lumatrace-windows-packaging-qa-evidence.json",
  exists: existsSync(automatedEvidencePath)
};

if (linkedAutomatedEvidence.exists) {
  linkedAutomatedEvidence.sha256 = sha256(automatedEvidencePath);
  linkedAutomatedEvidence.sizeBytes = statSync(automatedEvidencePath).size;
}

const template: WindowsManualGuiQaTemplate = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  evidenceKind: "windows-manual-gui-qa-template",
  status: "template_pending",
  productionReady: false,
  unsignedDraft: true,
  sourceChecklist: {
    path: "docs/windows-packaging-manual-gui-checklist.md",
    sha256: sha256(checklistPath),
    sectionCount: parsedChecklist.sections.length,
    itemCount: parsedChecklist.steps.length
  },
  linkedAutomatedEvidence,
  reviewer: {
    name: null,
    completedAt: null,
    environment: null
  },
  steps: parsedChecklist.steps,
  completionRules: [
    "A human reviewer must execute each pending step against the installed unsigned Windows draft.",
    "A step may be marked passed only with a reviewer note or evidence note.",
    "Any failed or blocked step prevents manual GUI QA completion.",
    "Completing this manual QA template still does not set productionReady=true."
  ],
  securityAssertions: {
    tokenRedactionRequired: true,
    fullLocalPathRedactionRequired: true,
    rawLogsExcluded: true,
    stackTracesExcluded: true,
    publicSidecarListenersAllowed: false
  },
  limitations: [
    "This template is generated for manual QA evidence capture only.",
    "The generated template does not run the installed app and does not mark manual GUI QA as passed.",
    "Code signing, updater validation, store distribution, notarization, and production release approval are not complete.",
    "productionReady remains false."
  ]
};

mkdirSync(dirname(templatePath), { recursive: true });
writeFileSync(templatePath, `${JSON.stringify(template, null, 2)}\n`, "utf8");

console.log(`Windows manual GUI QA template written to ${templatePath}`);
console.log(`steps=${template.steps.length}`);

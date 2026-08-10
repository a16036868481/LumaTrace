# LumaTrace Privacy Policy

**Effective date: August 10, 2026**

LumaTrace Performance Lab ("LumaTrace") is a local-first performance testing application for Windows and Android workflows. This policy explains what the application processes and the choices available to users.

## Data processed locally

LumaTrace can process the following information on the user's device when needed for a test:

- the selected Windows process name and process identifier;
- the selected Android application package name and authorized device connection details;
- performance measurements, timestamps, test names, markers, and availability information;
- locally generated reports and sanitized diagnostic events; and
- optional session logs, only when the user enables log export for that test.

This information is used only to run the requested test, show results, diagnose local collection problems, and create user-requested reports.

## Local-first operation and network access

LumaTrace stores test data in local application storage and communicates with its companion service through the loopback address on the same computer. LumaTrace does not provide a LumaTrace cloud account and does not upload performance measurements, reports, diagnostics, or session logs to a LumaTrace-operated cloud service by default.

The application may open external websites, such as the LumaTrace GitHub support page, only after a user selects the corresponding link. Optional Android testing uses the locally installed Android Debug Bridge (ADB) and a device connection authorized by the user.

## Optional session logs

Log export is disabled by default and must be selected separately for a test.

- For Android tests, LumaTrace requests target-filtered ADB logcat entries for the selected test period. The result is bounded and sanitized before it is saved.
- For Windows tests, LumaTrace writes timestamped, sanitized LumaTrace session events. It does not export all Windows system logs.

Optional logs are stored inside that test's folder in the report directory chosen by the user. They are not uploaded by LumaTrace. LumaTrace does not collect Android bugreports, device-wide syslog, account credentials, authentication tokens, browser cookies, or passwords through this feature.

Users should review reports and optional logs before sharing them because application names, package names, test labels, or application-generated messages may still be identifiable to the user or their organization.

## Storage, retention, and deletion

Local test data remains on the device until the user deletes it or removes the application data. The application allows completed test results to be deleted individually or in bulk. Running tests and report folders previously exported by the user are not deleted by the bulk-delete action.

Users control the report directory and can delete exported reports and optional logs by deleting the corresponding test folder. Remaining local application data can be removed from the Windows application-data location after LumaTrace is closed or uninstalled.

## Sharing and third parties

LumaTrace does not sell personal information. LumaTrace does not send locally collected performance data to advertising networks or data brokers. Information is disclosed to another party only when the user chooses to share an exported file, opens a third-party support site, or when disclosure is required by law.

GitHub applies its own privacy terms when a user visits GitHub or submits a support issue. Users should not include credentials, tokens, private paths, unreviewed raw logs, or other sensitive information in a public issue.

## Security

LumaTrace uses a memory-only local authorization token for communication between the desktop application and its local companion service. The token is not placed in reports, logs, URLs, or browser storage. Diagnostic and optional log exports apply sanitization and output-size limits. No security measure can guarantee that a user-created or third-party application log contains no sensitive text, so review before sharing remains important.

## Children's privacy

LumaTrace is a technical performance testing utility and is not directed to children. It does not knowingly operate a service that collects children's personal information.

## Changes to this policy

Material changes will be published in this repository with an updated effective date.

## Contact and support

For privacy questions, support requests, or deletion guidance, open an issue at:

<https://github.com/a16036868481/LumaTrace/issues>

Do not post sensitive information in a public issue. If private security reporting is available in the repository, use a private GitHub security advisory for sensitive vulnerability reports.

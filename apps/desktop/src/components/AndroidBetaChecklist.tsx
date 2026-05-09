export function AndroidBetaChecklist() {
  const items = [
    "Discovery, package targets, CPU, memory, battery, network, lifecycle, and diagnostics are available through adb.",
    "FPS remains experimental and disabled by default.",
    "LumaTrace does not collect logcat or bugreport output by default.",
    "Device-level network counters are not target-only traffic.",
    "Missing metrics stay N/A and are not filled with zero."
  ];

  return (
    <section className="panel" aria-label="Android Beta checklist">
      <h2>Android Beta Checklist</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

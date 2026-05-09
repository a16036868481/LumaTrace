export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <section className="empty-state">
      <h3>{title}</h3>
      {message !== undefined ? <p>{message}</p> : null}
    </section>
  );
}

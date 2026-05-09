interface RestartSidecarButtonProps {
  disabled: boolean;
  onRestart: () => void;
}

export function RestartSidecarButton({ disabled, onRestart }: RestartSidecarButtonProps) {
  return (
    <button className="button button-secondary" type="button" disabled={disabled} onClick={onRestart}>
      Restart sidecar
    </button>
  );
}

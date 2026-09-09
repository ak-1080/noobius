export function runtimeControls(values: Record<string, unknown>) {
  const configured = Number(values.NOOBIUS_MAX_PLAYERS);
  return {
    maxPlayers:
      Number.isSafeInteger(configured) && configured >= 1 && configured <= 10000
        ? configured
        : 50,
    admissionPaused: values.NOOBIUS_ADMISSION_PAUSED === 'true',
    gpuAdmissionPaused: values.NOOBIUS_GPU_ADMISSION_PAUSED === 'true',
    tradePaused: values.NOOBIUS_TRADE_PAUSED === 'true',
    projectsPaused: values.NOOBIUS_PROJECTS_PAUSED === 'true',
  };
}

export function pausedAction(
  action: string,
  controls: ReturnType<typeof runtimeControls>,
) {
  if (
    controls.tradePaused &&
    ['listing-create', 'listing-buy'].includes(action)
  )
    return 'Player trading is taking a short break. Existing offers can still be cancelled and their items returned.';
  if (controls.projectsPaused && action === 'project-start')
    return 'New cluster projects are paused. You can still finish existing work and collect earned rewards.';
  return null;
}

export function retryDelay(failures: number, random = Math.random()) {
  return (
    Math.min(30000, 1500 * 2 ** Math.min(Math.max(0, failures), 5)) *
    (0.85 + random * 0.3)
  );
}

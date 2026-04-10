const runtimeState = {
  status: 'starting',
  startedAt: new Date().toISOString(),
  readyAt: null,
  error: null,
};

function setRuntimeStatus(status, error = null) {
  runtimeState.status = status;
  runtimeState.error = error ? String(error) : null;

  if (status === 'ready') {
    runtimeState.readyAt = new Date().toISOString();
  }
}

function getRuntimeHealth() {
  return {
    status: runtimeState.status,
    startedAt: runtimeState.startedAt,
    readyAt: runtimeState.readyAt,
    error: runtimeState.error,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

module.exports = {
  getRuntimeHealth,
  setRuntimeStatus,
};
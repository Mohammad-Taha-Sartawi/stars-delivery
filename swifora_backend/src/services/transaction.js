async function executeTransaction({ startSession, work, onCommitted }) {
  const session = await startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (onCommitted) await onCommitted(result);
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { executeTransaction };
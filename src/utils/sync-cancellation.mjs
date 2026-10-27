export const syncCancelledError = () => Object.assign(new Error('Sync request timed out or was cancelled.'), { code: 'SYNC_CANCELLED' });

export const assertSyncActive = (signal) => {
  if (signal?.aborted) throw syncCancelledError();
};

// Some adapters cannot physically abort a request. Discard their late response
// as well, so cancellation never permits a later local mutation.
export const awaitSyncRequest = (request, signal) => {
  if (!signal) return Promise.resolve(request);
  if (signal.aborted) {
    Promise.resolve(request).catch(() => {});
    return Promise.reject(syncCancelledError());
  }
  return new Promise((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(syncCancelledError()); };
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(request).then((value) => {
      signal.removeEventListener('abort', cancel);
      signal.aborted ? reject(syncCancelledError()) : resolve(value);
    }, (error) => { signal.removeEventListener('abort', cancel); reject(error); });
  });
};

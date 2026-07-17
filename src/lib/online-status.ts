/**
 * Subscribe to browser online/offline status changes.
 * Returns an unsubscribe function.
 */
export function subscribeToOnlineStatus(callback: (online: boolean) => void): () => void {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  // Emit current status immediately
  callback(navigator.onLine);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

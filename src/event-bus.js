const listeners = new Map();

export const EventBus = {
  on(event, callback) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event).delete(callback);
  },

  off(event, callback) {
    const set = listeners.get(event);
    if (set) set.delete(callback);
  },

  raise(event, data) {
    const set = listeners.get(event);
    if (set) set.forEach(cb => { try { cb(data); } catch (e) { console.warn("EventBus:", event, e); } });
  },

  clear() {
    listeners.clear();
  }
};

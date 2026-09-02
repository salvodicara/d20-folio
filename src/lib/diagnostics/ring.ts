export interface Ring<T> {
  push(value: T): void;
  snapshot(): T[];
  size(): number;
  clear(): void;
}

/** Fixed-capacity FIFO: the newest `capacity` values, oldest first on snapshot. */
export function createRing<T>(capacity: number): Ring<T> {
  if (!Number.isInteger(capacity) || capacity <= 0) {
    throw new RangeError("ring capacity must be a positive integer");
  }
  const slots: T[] = [];
  let start = 0;
  return {
    push(value) {
      if (slots.length < capacity) {
        slots.push(value);
        return;
      }
      slots[start] = value;
      start = (start + 1) % capacity;
    },
    snapshot() {
      return [...slots.slice(start), ...slots.slice(0, start)];
    },
    size() {
      return slots.length;
    },
    clear() {
      slots.length = 0;
      start = 0;
    },
  };
}

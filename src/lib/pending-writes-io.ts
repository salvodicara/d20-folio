/** Resolves once every write this device made is on the server (see `reloadApp`). */
import { waitForPendingWrites } from "firebase/firestore";

import { db } from "@/lib/firebase";

export function pendingWrites(): Promise<void> {
  return waitForPendingWrites(db);
}

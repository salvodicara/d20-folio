import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { NavigationController } from "./navigation";
const NavigationContext = createContext<NavigationController | null>(null);
function Provider({
  uid,
  children,
  resumeHistory,
}: {
  uid: string;
  children: ReactNode;
  resumeHistory: boolean;
}) {
  const [navigation] = useState(() => new NavigationController(uid, resumeHistory));
  useEffect(() => {
    navigation.activate();
    window.addEventListener("popstate", navigation.restore);
    window.addEventListener("hashchange", navigation.restore);
    return () => {
      window.removeEventListener("popstate", navigation.restore);
      window.removeEventListener("hashchange", navigation.restore);
    };
  }, [navigation]);
  return (
    <NavigationContext.Provider value={navigation}>{children}</NavigationContext.Provider>
  );
}
/** Standalone consumers and the authenticated app share the same provider, never nested stores. */
export function IdentityNavigation({
  uid,
  children,
  resumeHistory = true,
}: {
  uid: string;
  children: ReactNode;
  resumeHistory?: boolean;
}) {
  const existing = useContext(NavigationContext);
  return existing ? (
    children
  ) : (
    <Provider key={uid} uid={uid} resumeHistory={resumeHistory}>
      {children}
    </Provider>
  );
}
// Shared context hook is intentionally colocated with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useIdentityNavigation() {
  const navigation = useContext(NavigationContext);
  if (!navigation) throw new Error("Missing identity navigation");
  const snapshot = useSyncExternalStore(navigation.subscribe, navigation.snapshot);
  return { navigation, ...snapshot };
}

import { useEffect } from "react";
import { useIdentityNavigation } from "./IdentityNavigation";
import { routeHash } from "./navigation";

/** Restore after asynchronous page content arrives, unless the user takes control. */
export function useNavigationPresentation() {
  const { navigation } = useIdentityNavigation();
  useEffect(() => {
    let route = "";
    let restoring = false;
    let observer: ResizeObserver | undefined;
    let animation = 0;
    const original = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const stopRestore = () => {
      restoring = false;
      observer?.disconnect();
      cancelAnimationFrame(animation);
    };
    const restore = () => {
      const snapshot = navigation.snapshot();
      const next = routeHash(snapshot.route);
      if (next === route) return;
      route = next;
      stopRestore();
      if (snapshot.route.character) return; // The inspection dialog owns focus and scroll.
      restoring = true;
      const y = snapshot.frame.scroll ?? 0;
      const apply = () => {
        if (!restoring) return;
        const main = document.getElementById("identity-main");
        if (!main || document.querySelector('[role="dialog"]')) return;
        if (Math.max(0, document.documentElement.scrollHeight - window.innerHeight) < y)
          return;
        let focus: HTMLElement | null = null;
        if (snapshot.frame.focus)
          focus =
            [...main.querySelectorAll<HTMLElement>("[data-navigation-focus]")].find(
              (element) => element.dataset.navigationFocus === snapshot.frame.focus
            ) ?? null;
        if (!focus) {
          focus = main.querySelector<HTMLElement>("h1") ?? main;
          focus.setAttribute("tabindex", "-1");
        }
        focus.focus({ preventScroll: true });
        if (window.scrollY !== y) window.scrollTo({ top: y, behavior: "instant" });
        stopRestore();
      };
      animation = requestAnimationFrame(apply);
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(apply);
        observer.observe(document.body);
      }
    };
    const saveScroll = () => {
      if (
        !restoring &&
        !document.querySelector('[role="dialog"]') &&
        navigation.snapshot().frame.scroll !== window.scrollY
      )
        navigation.updateFrame({ scroll: window.scrollY });
    };
    const stop = navigation.subscribe(restore);
    window.addEventListener("scroll", saveScroll, { passive: true });
    window.addEventListener("wheel", stopRestore, { passive: true });
    window.addEventListener("pointerdown", stopRestore, { passive: true });
    restore();
    return () => {
      stop();
      stopRestore();
      window.history.scrollRestoration = original;
      window.removeEventListener("scroll", saveScroll);
      window.removeEventListener("wheel", stopRestore);
      window.removeEventListener("pointerdown", stopRestore);
    };
  }, [navigation]);
}

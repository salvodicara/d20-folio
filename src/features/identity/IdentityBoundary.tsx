import { Component, type ReactNode } from "react";
import i18n from "@/i18n";

export class IdentityBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? (
      <div className="identity-app identity-login">
        <section className="identity-panel" role="alert">
          <h1>{i18n.t("identity.unexpectedError")}</h1>
          <p>{i18n.t("identity.reloadHelp")}</p>
          <button onClick={() => window.location.reload()}>
            {i18n.t("identity.reload")}
          </button>
        </section>
      </div>
    ) : (
      this.props.children
    );
  }
}

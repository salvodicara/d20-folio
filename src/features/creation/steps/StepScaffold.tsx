/**
 * Creation-wizard layout atom — the labelled `FormField` row. Pure presentational
 * chrome (the step heading/hint now lives in the shared wizard-F `WizardChrome`).
 */
import type { ReactNode } from "react";

export function FormField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="field">
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

/**
 * Folio atom layer — public barrel (M2).
 *
 * Reusable presentation atoms skinned from previews/folio_design/app.css and
 * built on shadcn/Radix accessible primitives where relevant. Import from
 * "@/components/ui" rather than reaching into individual files.
 */

export { Button, type ButtonProps } from "./button";
export {
  BrandMark,
  D20Mark,
  type BrandMarkProps,
  type D20MarkProps,
  type BrandMarkVariant,
  type BrandMarkSize,
} from "./brand-mark";
export { Icon, type IconProps, type IconSize } from "./icon";
export {
  Input,
  Textarea,
  SearchInput,
  NumberStepper,
  Field,
  type InputProps,
  type TextareaProps,
  type SearchInputProps,
  type NumberStepperProps,
  type FieldProps,
} from "./input";
export { Badge, type BadgeProps, type BadgeVariant, type BadgeSize } from "./badge";
export { MagicMark, FocusMark, type MarkProps, type FocusMarkProps } from "./folio-marks";
export { EditingPill, type EditingPillProps } from "./editing-pill";
export { Spinner, type SpinnerProps, type SpinnerSize } from "./spinner";
export {
  Switch,
  Checkbox,
  RadioGroup,
  RadioGroupItem,
  type SwitchProps,
  type CheckboxProps,
  type RadioGroupProps,
  type RadioGroupItemProps,
} from "./selection";
export { Segmented, type SegmentedProps, type SegmentedOption } from "./segmented";
export { TooltipProvider, Tooltip, type TooltipProps } from "./tooltip";
export {
  Popover,
  PopoverTrigger,
  PopoverClose,
  PopoverAnchor,
  PopoverContent,
  type PopoverContentProps,
} from "./popover";
export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogBody,
  DialogFooter,
  type DialogContentProps,
  type DialogSize,
} from "./dialog";
export { RunicEmptyState, type RunicEmptyStateProps } from "./runic-empty-state";

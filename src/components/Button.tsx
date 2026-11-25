import type { ButtonHTMLAttributes, ReactNode } from "react";
import { buttonClass, type ButtonVariant } from "./button-class";

export type { ButtonVariant };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: ReactNode;
  fullWidth?: boolean;
};

/** Button (DESIGN_SYSTEM › Components). Min 44 px tall on mobile, 40 px from tablet up. */
export function Button({
  variant = "primary",
  icon,
  fullWidth = false,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, `${fullWidth ? "w-full" : ""} ${className}`)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

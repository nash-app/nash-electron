import * as React from "react";
import nashLogo from "../../public/nash-logo.png";
import nashLogoWhite from "../../public/logo-white.png";
import { cn } from "../lib/utils";

type LogoVariant = "default" | "white";

interface NashLogoProps {
  size?: number;
  className?: string;
  variant?: LogoVariant;
}

export function NashLogo({
  size = 64,
  className,
  variant = "default",
}: NashLogoProps): React.ReactElement {
  const logoSrc = variant === "white" ? nashLogoWhite : nashLogo;

  return (
    <div className={cn("flex justify-center", className)}>
      <img
        src={logoSrc}
        alt="Nash Logo"
        className={"object-contain"}
        style={{ width: size }}
      />
    </div>
  );
}

import * as React from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 64, className }: LogoProps): React.ReactElement {
  return (
    <img
      src="./nash-logo.png"
      alt="Nash Logo"
      className={`h-auto object-contain ${className ?? ""}`}
      style={{ width: size }}
    />
  );
}

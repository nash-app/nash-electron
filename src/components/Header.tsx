import * as React from "react";
import { Page } from "../types";
import { NashLogo } from "./NashLogo";

interface HeaderProps {
  onNavigate: (page: Page) => void;
  currentPage: Page;
}

interface NavButtonProps {
  page: Page;
  label: string;
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

const NavButton: React.FC<NavButtonProps> = ({
  page,
  label,
  currentPage,
  onNavigate,
}) => (
  <button
    onClick={() => onNavigate(page)}
    className={`transition-colors pt-1 border-b-2 font-normal text-[14px] tracking-normal font-work-sans ${
      currentPage === page
        ? "text-white border-white font-medium"
        : "text-nash-text-secondary hover:text-nash-text border-transparent"
    }`}
  >
    {label}
  </button>
);

const NAV_ITEMS: Array<{ page: Page; label: string }> = [
  { page: Page.Home, label: "Home" },
  { page: Page.Tasks, label: "Tasks" },
  { page: Page.Secrets, label: "Secrets" },
  { page: Page.Apps, label: "Apps" },
  { page: Page.Models, label: "Models" },
];

export function Header({
  onNavigate,
  currentPage,
}: HeaderProps): React.ReactElement {
  return (
    <nav className="sticky top-0 z-50 bg-nash-bg border-b border-nash-border px-6 py-4 pt-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <button onClick={() => onNavigate(Page.Home)}>
            <NashLogo
              size={16}
              variant="clipped"
              className="translate-y-[4px]"
            />
          </button>
          <div className="flex items-center space-x-4">
            {NAV_ITEMS.map(({ page, label }) => (
              <NavButton
                key={page}
                page={page}
                label={label}
                currentPage={currentPage}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Header;

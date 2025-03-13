import * as React from "react";
import { ConfigAlert } from "../types";
import { SetupStep } from "../../../types";

interface ConfigAlertsProps {
  alerts: ConfigAlert[];
  onNavigate: (step: SetupStep) => void;
}

export function ConfigAlerts({ alerts, onNavigate }: ConfigAlertsProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
      <div className="max-w-4xl mx-auto">
        {alerts.map((alert, index) => (
          <div
            key={index}
            className="text-red-500 text-sm flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              {alert.message}
              {alert.link && (
                <button
                  onClick={() => onNavigate(alert.link!.step)}
                  className="ml-1 text-red-400 hover:text-red-300 underline focus:outline-none"
                >
                  {alert.link.text}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

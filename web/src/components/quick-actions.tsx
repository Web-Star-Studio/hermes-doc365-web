"use client";

import {
  FileSearch,
  ClipboardCheck,
  ShieldCheck,
  FileEdit,
  PackageCheck,
  Send,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { t } from "@/lib/i18n/pt-BR";
import type { ActionType } from "@/lib/adapter-client";

const actions: Array<{
  key: ActionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  sideEffect?: boolean;
}> = [
  { key: "analyze_files", label: t.actions.analyze, icon: FileSearch },
  { key: "check_pending", label: t.actions.checkPending, icon: ClipboardCheck },
  { key: "validate_submission", label: t.actions.validate, icon: ShieldCheck },
  { key: "draft_recurso", label: t.actions.draftRecurso, icon: FileEdit },
  { key: "prepare_orizon", label: t.actions.prepareOrizon, icon: PackageCheck },
  { key: "submit_orizon", label: t.actions.submitOrizon, icon: Send, sideEffect: true },
];

export function QuickActions({
  orizonSubmitEnabled,
  disabled,
  onActionAction,
}: {
  orizonSubmitEnabled: boolean;
  disabled?: boolean;
  /** Suffix `Action` keeps Next strict-mode happy for server-passed fns,
   * and harmless for purely client callbacks. */
  onActionAction: (action: ActionType, label: string) => void | Promise<void>;
}) {
  return (
    <TooltipProvider>
      <div className="space-y-1.5">
        {actions.map((a) => {
          const isOrizonSubmit = a.key === "submit_orizon";
          const gated = isOrizonSubmit && !orizonSubmitEnabled;
          const Button_ = (
            <Button
              variant={a.sideEffect ? "outline" : "ghost"}
              size="sm"
              className="w-full justify-start"
              disabled={disabled || gated}
              onClick={() => onActionAction(a.key, a.label)}
            >
              <a.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{a.label}</span>
              {a.sideEffect && (
                <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </Button>
          );
          return gated ? (
            <Tooltip key={a.key}>
              <TooltipTrigger asChild>
                <span className="inline-block w-full">{Button_}</span>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t.actions.submitOrizonDisabled}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div key={a.key}>{Button_}</div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

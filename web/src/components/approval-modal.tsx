"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/pt-BR";
import type { ActionType } from "@/lib/adapter-client";

export function ApprovalModal({
  open,
  action,
  label,
  fileCount,
  onConfirmAction,
  onCancelAction,
}: {
  open: boolean;
  action: ActionType | null;
  label: string;
  fileCount: number;
  onConfirmAction: () => void | Promise<void>;
  onCancelAction: () => void;
}) {
  if (!action) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancelAction()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.approval.title}</DialogTitle>
          <DialogDescription>{t.approval.body}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p className="font-medium">{label}</p>
          <p className="text-muted-foreground">
            {t.approval.scopedFiles} {fileCount}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancelAction}>
            {t.approval.cancel}
          </Button>
          <Button onClick={onConfirmAction}>{t.approval.confirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

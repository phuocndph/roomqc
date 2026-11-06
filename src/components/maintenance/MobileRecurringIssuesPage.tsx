import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  recurringIssueName,
  issueTypeLabels,
  type RecurringIssue,
} from "@/lib/maintenanceRecurring";
import { RecurringSeverity } from "./RecurringIssuesTable";

// The page owns the same filters, data, errors and analysis dialog on both sizes.
export function MobileRecurringIssuesPage({
  issues,
  period,
  onSelect,
}: {
  issues: RecurringIssue[];
  period: number;
  onSelect: (issue: RecurringIssue) => void;
}) {
  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <article
          key={issue.id}
          className="space-y-3 rounded-lg border bg-card p-4"
        >
          <div className="space-y-2">
            <RecurringSeverity critical={issue.count30d >= 3} />
            <h2 className="break-words font-semibold">
              {recurringIssueName(issue)}
            </h2>
            <p className="break-words text-sm text-muted-foreground">
              {issue.location}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-y py-3 text-sm">
            <div>
              <p className="text-muted-foreground">Trong {period} ngày</p>
              <p className="mt-1 font-semibold">{issue.countInPeriod} lần</p>
            </div>
            <div>
              <p className="text-muted-foreground">Chi phí ghi nhận</p>
              <p className="mt-1 break-words font-semibold">
                {formatCurrency(issue.totalCost)}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {issueTypeLabels[issue.primaryIssue] || issue.primaryIssue} ·{" "}
            {issue.count30d} lần trong 30 ngày
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onSelect(issue)}
            aria-label={"Xem lịch sử " + recurringIssueName(issue)}
          >
            Xem lịch sử
          </Button>
        </article>
      ))}
    </div>
  );
}

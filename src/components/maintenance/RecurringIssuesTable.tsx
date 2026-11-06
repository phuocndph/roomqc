import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import {
  issueTypeLabels,
  recurringIssueName,
  type RecurringIssue,
} from "@/lib/maintenanceRecurring";

export function RecurringSeverity({ critical }: { critical: boolean }) {
  return (
    <span
      className={
        critical
          ? "inline-flex whitespace-nowrap rounded bg-red-700 px-2 py-1 text-xs font-semibold text-white"
          : "inline-flex whitespace-nowrap rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white"
      }
    >
      {critical ? "Ưu tiên kiểm tra" : "Theo dõi"}
    </span>
  );
}

export function RecurringIssuesTable({
  issues,
  period,
  onSelect,
}: {
  issues: RecurringIssue[];
  period: number;
  onSelect: (issue: RecurringIssue) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Thiết bị / Khu vực</TableHead>
            <TableHead>Mức theo dõi</TableHead>
            <TableHead>Sự cố chính</TableHead>
            <TableHead className="text-center">Trong {period} ngày</TableHead>
            <TableHead className="text-right">Chi phí ghi nhận</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow
              key={issue.id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <TableCell className="max-w-72 py-4">
                <p className="break-words font-medium">
                  {recurringIssueName(issue)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[issue.item?.code, issue.location]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </TableCell>
              <TableCell>
                <RecurringSeverity critical={issue.count30d >= 3} />
                <p className="mt-1 text-xs text-muted-foreground">
                  {issue.count30d} lần / 30 ngày
                </p>
              </TableCell>
              <TableCell>
                <p>
                  {issueTypeLabels[issue.primaryIssue] || issue.primaryIssue}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {issue.issueCount} lần
                </p>
              </TableCell>
              <TableCell className="text-center font-semibold tabular-nums">
                {issue.countInPeriod} lần
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatCurrency(issue.totalCost)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelect(issue)}
                  aria-label={"Xem lịch sử " + recurringIssueName(issue)}
                >
                  Xem lịch sử
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

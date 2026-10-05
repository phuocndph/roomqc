import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { usePricingHealth } from "@/hooks/usePricingDaily";
import { useHotelContext } from "@/contexts/HotelContext";
import { TooltipProvider } from "@/components/ui/tooltip";

const PricingDailyPage = lazy(() => import("./PricingDailyPage"));
const PricingV2Page = lazy(() => import("./PricingV2Page"));
const SeasonalRulesPage = lazy(() => import("./SeasonalRulesPage"));
const PricingRulesPage = lazy(() => import("./PricingRulesPage"));

const Fallback = () => (
  <div className="p-4 space-y-3">
    <Skeleton className="h-8 w-64" />
    <Skeleton className="h-96 w-full" />
  </div>
);

export default function PricingHubPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "daily";
  const { selectedHotel } = useHotelContext();
  const { data: health } = usePricingHealth(selectedHotel?.id ?? null);

  const setTab = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    setParams(next, { replace: true });
  };

  const missing = health?.room_types_missing_rate ?? 0;
  const conflicts = health?.seasonal_conflicts ?? 0;
  const seasonalActive = health?.seasonal_active ?? 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex flex-col h-full">
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col h-full">
          <div className="border-b px-4 pt-3 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">Quản lý giá phòng</h1>
              {health && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    Hạng phòng: <strong className="text-foreground">{health.room_types_with_rate}/{health.room_types_total}</strong> đã có giá
                  </span>
                  <span>·</span>
                  <span>
                    Quy tắc mùa: <strong className="text-foreground">{seasonalActive}</strong> đang chạy
                  </span>
                </div>
              )}
            </div>

            {(missing > 0 || conflicts > 0) && (
              <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-900">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="flex items-center justify-between gap-3 flex-wrap text-xs">
                  <span>
                    {missing > 0 && (
                      <>
                        <strong>{missing}</strong> hạng phòng chưa có giá mặc định.{" "}
                      </>
                    )}
                    {conflicts > 0 && (
                      <>
                        <strong>{conflicts}</strong> cặp quy tắc mùa trùng ưu tiên & ngày — cần kiểm tra.
                      </>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    {missing > 0 && (
                      <button
                        type="button"
                        onClick={() => setTab("default")}
                        className="underline underline-offset-2 hover:text-amber-700"
                      >
                        Cài giá mặc định →
                      </button>
                    )}
                    {conflicts > 0 && (
                      <button
                        type="button"
                        onClick={() => setTab("seasonal")}
                        className="underline underline-offset-2 hover:text-amber-700"
                      >
                        Xem quy tắc mùa →
                      </button>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            <TabsList className="bg-transparent p-0 h-auto border-b-0 gap-1">
              <TabsTrigger
                value="daily"
                className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Lịch giá theo ngày
              </TabsTrigger>
              <TabsTrigger
                value="default"
                className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Giá mặc định
              </TabsTrigger>
              <TabsTrigger
                value="seasonal"
                className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Quy tắc mùa
              </TabsTrigger>
              <TabsTrigger
                value="rules"
                className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                Quy tắc phụ thu
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-auto">
            <TabsContent value="daily" className="m-0">
              <Suspense fallback={<Fallback />}>
                <PricingDailyPage />
              </Suspense>
            </TabsContent>
            <TabsContent value="default" className="m-0">
              <Suspense fallback={<Fallback />}>
                <PricingV2Page />
              </Suspense>
            </TabsContent>
            <TabsContent value="seasonal" className="m-0">
              <Suspense fallback={<Fallback />}>
                <SeasonalRulesPage />
              </Suspense>
            </TabsContent>
            <TabsContent value="rules" className="m-0">
              <Suspense fallback={<Fallback />}>
                <PricingRulesPage />
              </Suspense>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </TooltipProvider>
  );
}

import { unauthenticated } from "../shopify.server";
import { syncStockAvailability } from "../services/stock-availability-sync.server";
import { STOCK_SYNC_CONFIG } from "../services/stock-sync-config.server";

export async function loader({ request }) {
  const overallStart = Date.now();
  const startedAt = new Date().toISOString();

  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (secret !== process.env.STOCK_SYNC_CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const shops = Object.keys(STOCK_SYNC_CONFIG);
    const results = [];

    for (const shop of shops) {
      const shopStart = Date.now();
      const shopStartedAt = new Date().toISOString();
      const config = STOCK_SYNC_CONFIG[shop];

      try {
        const { admin } = await unauthenticated.admin(shop);

        const result = await syncStockAvailability({
          admin,
          onlineLocationIds: config.onlineLocationIds,
          storeLocationIds: config.storeLocationIds,
          dryRun: false,
          enableDeletes: true,
        });

        const shopEnd = Date.now();

        results.push({
          shop,
          ok: true,
          startedAt: shopStartedAt,
          finishedAt: new Date().toISOString(),
          durationMs: shopEnd - shopStart,
          durationSeconds: Number(((shopEnd - shopStart) / 1000).toFixed(2)),
          dryRun: result.dryRun,
          pageCount: result.pageCount,
          processedVariants: result.processedVariants,
          processedActiveVariants: result.processedActiveVariants,
          processedProductsSeen: result.processedProductsSeen,
          updatesPrepared: result.updatesPrepared,
          deletesPrepared: result.deletesPrepared,
          writtenBatches: result.writtenBatches,
          deletedBatches: result.deletedBatches,
        });
      } catch (error) {
        const shopEnd = Date.now();

        console.error(`CRON STOCK SYNC ERROR for ${shop}:`, error);

        results.push({
          shop,
          ok: false,
          startedAt: shopStartedAt,
          finishedAt: new Date().toISOString(),
          durationMs: shopEnd - shopStart,
          durationSeconds: Number(((shopEnd - shopStart) / 1000).toFixed(2)),
          error: error?.message || "Unknown shop sync error",
        });
      }
    }

    const overallEnd = Date.now();

    return new Response(
      JSON.stringify(
        {
          ok: true,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: overallEnd - overallStart,
          durationSeconds: Number(((overallEnd - overallStart) / 1000).toFixed(2)),
          shopCount: shops.length,
          successCount: results.filter((r) => r.ok).length,
          failureCount: results.filter((r) => !r.ok).length,
          results,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    const overallEnd = Date.now();

    console.error("CRON STOCK SYNC FATAL ERROR:", error);

    return new Response(
      JSON.stringify(
        {
          ok: false,
          startedAt,
          finishedAt: new Date().toISOString(),
          durationMs: overallEnd - overallStart,
          durationSeconds: Number(((overallEnd - overallStart) / 1000).toFixed(2)),
          error: error?.message || "Unknown cron sync error",
        },
        null,
        2,
      ),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
import { unauthenticated } from "../shopify.server";
import { syncStockAvailability } from "../services/stock-availability-sync.server";
import { STOCK_SYNC_CONFIG } from "../services/stock-sync-config.server";

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (secret !== process.env.STOCK_SYNC_CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const shops = Object.keys(STOCK_SYNC_CONFIG);

    const results = [];

    for (const shop of shops) {
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

        results.push({
          shop,
          ok: true,
          ...result,
        });
      } catch (error) {
        console.error(`CRON STOCK SYNC ERROR for ${shop}:`, error);

        results.push({
          shop,
          ok: false,
          error: error?.message || "Unknown shop sync error",
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("CRON STOCK SYNC FATAL ERROR:", error);

    return new Response(
      JSON.stringify(
        {
          ok: false,
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
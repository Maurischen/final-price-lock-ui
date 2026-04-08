import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { syncStockAvailability } from "../services/stock-availability-sync.server";
import { STOCK_SYNC_CONFIG } from "../services/stock-sync-config.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const config = STOCK_SYNC_CONFIG[shop];

  if (!config) {
    return {
      ok: false,
      shop,
      error: `No stock sync config found for ${shop}`,
      onlineLocationIds: [],
      storeLocations: {},
    };
  }

  return {
    ok: true,
    shop,
    onlineLocationIds: config.onlineLocationIds,
    storeLocations: config.storeLocations,
  };
};

export const action = async ({ request }) => {
  try {
    const { admin, session } = await authenticate.admin(request);
    const formData = await request.formData();
    const dryRun = formData.get("dryRun") === "true";
    const shop = session.shop;
    const config = STOCK_SYNC_CONFIG[shop];

    if (!config) {
      return {
        ok: false,
        error: `No stock sync config found for ${shop}`,
      };
    }

    const result = await syncStockAvailability({
      admin,
      onlineLocationIds: config.onlineLocationIds,
      storeLocations: config.storeLocations,
      dryRun,
      enableDeletes: true,
    });

    return { ok: true, shop, ...result };
  } catch (error) {
    console.error("Stock sync action failed:", error);

    return {
      ok: false,
      error: error?.message || "Unknown stock sync error",
    };
  }
};

export default function StockSyncPage() {
  const data = useLoaderData();
  const fetcher = useFetcher();
  const isRunning =
    fetcher.state === "submitting" || fetcher.state === "loading";

  return (
    <div style={{ padding: "20px" }}>
      <h1>Stock Availability Sync</h1>

      <p><strong>Shop:</strong> {data.shop}</p>

      {!data.ok ? (
        <pre style={{ marginTop: "20px", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <>
          <p><strong>Online location IDs:</strong> {data.onlineLocationIds.join(", ")}</p>
          <p><strong>Store locations:</strong> {Object.values(data.storeLocations).join(", ")}</p>

          <fetcher.Form method="post">
            <button
              type="submit"
              name="dryRun"
              value="true"
              style={{ marginRight: 12 }}
              disabled={isRunning}
            >
              {isRunning ? "Running..." : "Dry run"}
            </button>

            <button
              type="submit"
              name="dryRun"
              value="false"
              disabled={isRunning}
            >
              {isRunning ? "Running..." : "Run sync"}
            </button>
          </fetcher.Form>
        </>
      )}

      {isRunning && (
        <div style={{ marginTop: "20px", fontWeight: "bold" }}>
          Sync in progress... please wait.
        </div>
      )}

      {fetcher.data ? (
        <pre style={{ marginTop: "20px", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(fetcher.data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
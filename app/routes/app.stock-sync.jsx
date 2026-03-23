import { useLoaderData, useFetcher } from "@remix-run/react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { syncStockAvailability } from "../services/stock-availability-sync.server";

const ONLINE_LOCATION_NAMES = [
  "Main Warehouse",
  "Online Warehouse",
];

const STORE_LOCATION_NAMES = [
  "Cape Town Store",
  "Canal Walk",
  "Bellville",
];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return json({
    onlineLocations: ONLINE_LOCATION_NAMES,
    storeLocations: STORE_LOCATION_NAMES,
  });
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const dryRun = formData.get("dryRun") === "true";

  const result = await syncStockAvailability({
    shop: session.shop,
    onlineLocationNames: ONLINE_LOCATION_NAMES,
    storeLocationNames: STORE_LOCATION_NAMES,
    dryRun,
  });

  return json(result);
};

export default function StockSyncPage() {
  const data = useLoaderData();
  const fetcher = useFetcher();

  return (
    <div style={{ padding: "20px" }}>
      <h1>Stock Availability Sync</h1>

      <p>
        <strong>Online locations:</strong> {data.onlineLocations.join(", ")}
      </p>
      <p>
        <strong>Store locations:</strong> {data.storeLocations.join(", ")}
      </p>

      <fetcher.Form method="post">
        <button type="submit" name="dryRun" value="true" style={{ marginRight: 12 }}>
          Dry run
        </button>
        <button type="submit" name="dryRun" value="false">
          Run sync
        </button>
      </fetcher.Form>

      {fetcher.data ? (
        <pre style={{ marginTop: 20, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(fetcher.data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
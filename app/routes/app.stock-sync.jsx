import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { syncStockAvailability } from "../services/stock-availability-sync.server";

const ONLINE_LOCATION_IDS = [
  "gid://shopify/Location/69494243425",
  "gid://shopify/Location/70255968353",
  "gid://shopify/Location/67094085729",
  "gid://shopify/Location/67055812705",
  "gid://shopify/Location/67126657121",
  "gid://shopify/Location/67114827873",
  "gid://shopify/Location/67148021857",
  "gid://shopify/Location/67291512929",
  "gid://shopify/Location/67147989089",
  "gid://shopify/Location/67147923553",
  "gid://shopify/Location/67147890785",
  "gid://shopify/Location/67148087393",
  "gid://shopify/Location/67148054625",
  "gid://shopify/Location/67147825249",
  "gid://shopify/Location/67919478881",
  "gid://shopify/Location/67056009313",
  "gid://shopify/Location/69365465185",
];

const STORE_LOCATION_IDS = [
  "gid://shopify/Location/66996928609",
  "gid://shopify/Location/67092775009",
  "gid://shopify/Location/67094675553",
  "gid://shopify/Location/67092283489",
  "gid://shopify/Location/67092381793",
  "gid://shopify/Location/67093921889",
  "gid://shopify/Location/67093200993",
  "gid://shopify/Location/67092906081",
  "gid://shopify/Location/67093004385",
  "gid://shopify/Location/67092447329",
  "gid://shopify/Location/67093954657",
  "gid://shopify/Location/67092709473",
  "gid://shopify/Location/67093168225",
  "gid://shopify/Location/67092938849",
  "gid://shopify/Location/67092316257",
  "gid://shopify/Location/67094282337",
  "gid://shopify/Location/67094839393",
  "gid://shopify/Location/67094315105",
  "gid://shopify/Location/67093299297",
  "gid://shopify/Location/67094577249",
  "gid://shopify/Location/67094708321",
  "gid://shopify/Location/67094478945",
  "gid://shopify/Location/67093889121",
  "gid://shopify/Location/67094052961",
  "gid://shopify/Location/67094904929",
  "gid://shopify/Location/67093069921",
  "gid://shopify/Location/67093135457",
];

export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return {
    onlineLocationIds: ONLINE_LOCATION_IDS,
    storeLocationIds: STORE_LOCATION_IDS,
  };
};

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const dryRun = formData.get("dryRun") === "true";

    const result = await syncStockAvailability({
      admin,
      onlineLocationIds: ONLINE_LOCATION_IDS,
      storeLocationIds: STORE_LOCATION_IDS,
      dryRun,
      enableDeletes: true,
    });

    return { ok: true, ...result };
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

      <p>
        <strong>Online location IDs:</strong> {data.onlineLocationIds.join(", ")}
      </p>
      <p>
        <strong>Store location IDs:</strong> {data.storeLocationIds.join(", ")}
      </p>

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
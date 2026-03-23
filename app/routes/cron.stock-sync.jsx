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

export async function loader({ request }) {
  try {
    const url = new URL(request.url);
    const secret = url.searchParams.get("secret");

    if (secret !== process.env.CRON_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { admin } = await authenticate.admin(request);

    const result = await syncStockAvailability({
      admin,
      onlineLocationIds: ONLINE_LOCATION_IDS,
      storeLocationIds: STORE_LOCATION_IDS,
      dryRun: false,
      enableDeletes: true,
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("CRON STOCK SYNC ERROR:", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Unknown cron sync error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
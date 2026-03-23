import { useLoaderData } from "@remix-run/react";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    const response = await admin.graphql(`
      #graphql
      query GetLocations {
        locations(first: 100) {
          edges {
            node {
              id
              name
              isActive
            }
          }
        }
      }
    `);

    const result = await response.json();

    console.log("LOCATIONS RESPONSE:", JSON.stringify(result, null, 2));

    const locations = result?.data?.locations?.edges?.map((edge) => edge.node) || [];

    return json({ ok: true, locations });
  } catch (error) {
    console.error("LOCATIONS LOADER ERROR:", error);
    return json(
      {
        ok: false,
        error: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
};

export default function AppLocations() {
  const data = useLoaderData();

  return (
    <div style={{ padding: "20px" }}>
      <h1>Shopify Locations</h1>

      {!data.ok ? (
        <div>
          <p><strong>Error:</strong> {data.error}</p>
          <p>Check your server logs for the full error output.</p>
        </div>
      ) : (
        <div>
          <p>Found {data.locations.length} locations</p>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "14px" }}>
            {JSON.stringify(data.locations, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
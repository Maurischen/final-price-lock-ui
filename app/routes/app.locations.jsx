import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
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
    const locations = result?.data?.locations?.edges?.map((edge) => edge.node) || [];

    return {
      ok: true,
      locations,
    };
  } catch (error) {
    console.error("LOCATIONS LOADER ERROR:", error);

    return {
      ok: false,
      error: error?.message || "Unknown error",
      locations: [],
    };
  }
}

export default function AppLocations() {
  const data = useLoaderData();

  return (
    <div style={{ padding: "20px" }}>
      <h1>Shopify Locations</h1>

      {!data.ok ? (
        <div>
          <p><strong>Error:</strong> {data.error}</p>
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
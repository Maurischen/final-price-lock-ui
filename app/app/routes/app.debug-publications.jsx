import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

/**
 * React Router v7 loader
 */
export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const Q = `
    query Publications {
      publications(first: 50) {
        nodes { id name }
      }
    }
  `;

  const resp = await admin.graphql(Q);
  const data = await resp.json();

  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};

export default function DebugPublications() {
  // React Router will parse JSON automatically if content-type is JSON
  const data = useLoaderData();

  return (
    <pre style={{ whiteSpace: "pre-wrap" }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
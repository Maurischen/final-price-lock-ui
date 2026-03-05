import { authenticate } from "../shopify.server";

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
  const json = await resp.json();

  return Response.json(json);
};
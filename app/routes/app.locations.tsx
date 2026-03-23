import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type LocationsResponse = {
  data?: {
    locations?: {
      edges?: Array<{
        node: {
          id: string;
          name: string;
          isActive: boolean;
        };
      }>;
    };
  };
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    #graphql
    query {
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

  const result = (await response.json()) as LocationsResponse;

  return result.data?.locations?.edges?.map((e) => e.node) ?? [];
}
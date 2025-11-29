import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  // 1. Retrieve the 'host' from the URL search parameters
  const host = url.searchParams.get("host");
  
  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "", 
    // 2. Pass the host and shop to the client
    host: host,
    shop: session.shop
  };
};

export default function App() {
  // 3. Destructure all needed props
  const { apiKey, host, shop } = useLoaderData();

  return (
    // 4. Pass all props (apiKey, host, shop) to AppProvider to resolve the deprecated warning
    <AppProvider embedded apiKey={apiKey} host={host} shop={shop}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/additional">Additional page</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
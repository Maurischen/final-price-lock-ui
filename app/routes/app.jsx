import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisAppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const host = url.searchParams.get("host");

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    host,
    shop: session.shop,
  };
};

export default function App() {
  const { apiKey, host, shop } = useLoaderData();

  return (
    <PolarisAppProvider i18n={enTranslations}>
      <ShopifyAppProvider embedded apiKey={apiKey} host={host} shop={shop}>
        <s-app-nav>
          <s-link href="/app">Home</s-link>
          <s-link href="/app/price-guard">Price Guard</s-link>
          <s-link href="/app/bundle-discounts">Bundle Discounts</s-link>
          <s-link href="/app/bundler-rules">Bundler Rules</s-link>
          <s-link href="/app/standalone-discounts">Standalone Discounts</s-link>
          <s-link href="/app/upsells">Upsell Rules</s-link>
          <s-link href="/app/promo-display">Promo Display</s-link>
          <s-link href="/app/stock-sync">Stock Availability Sync</s-link>
          <s-link href="/app/ai-enrichment">AI Product Enrichment</s-link>
          <s-link href="/app/products-audit">Products Audit</s-link>
          <s-link href="/app/zero-price-audit">Zero Price Audit</s-link>
          <s-link href="/app/locations">Locations</s-link>
        </s-app-nav>
        <Outlet />
      </ShopifyAppProvider>
    </PolarisAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => boundary.headers(headersArgs);
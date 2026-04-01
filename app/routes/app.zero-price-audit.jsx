// app/routes/app.zero-price-audit.jsx

import { json } from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { runZeroPriceAudit } from "../../services/zero-price-audit.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const result = await runZeroPriceAudit(admin);

  return json(result);
}

export default function ZeroPriceAuditPage() {
  const data = useLoaderData();

  return (
    <Page
      title="Zero Price Audit"
      primaryAction={{
        content: "Download CSV",
        url: "/app/zero-price-audit.csv",
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Audit Summary
                </Text>

                <Badge tone={data.flaggedCount > 0 ? "critical" : "success"}>
                  {data.flaggedCount} flagged
                </Badge>
              </InlineStack>

              <Text as="p" variant="bodyMd">
                Active products checked: {data.checkedProducts}
              </Text>

              <Text as="p" variant="bodyMd">
                Variants checked: {data.checkedVariants}
              </Text>

              <Text as="p" variant="bodyMd">
                Zero-priced published variants found: {data.flaggedCount}
              </Text>

              <div>
                <Link to="/app/zero-price-audit.csv">
                  <Button variant="primary">Download CSV</Button>
                </Link>
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Preview
              </Text>

              {data.flaggedRows.length === 0 ? (
                <Text as="p" variant="bodyMd">
                  No active and published zero-priced products were found.
                </Text>
              ) : (
                data.flaggedRows.slice(0, 25).map((row) => (
                  <Card key={row.variantId} roundedAbove="sm">
                    <BlockStack gap="100">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        {row.productTitle}
                      </Text>
                      <Text as="p" variant="bodySm">
                        Variant: {row.variantTitle}
                      </Text>
                      <Text as="p" variant="bodySm">
                        SKU: {row.sku || "-"}
                      </Text>
                      <Text as="p" variant="bodySm">
                        Price: {row.price}
                      </Text>
                      <Text as="p" variant="bodySm">
                        Handle: {row.handle}
                      </Text>
                    </BlockStack>
                  </Card>
                ))
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
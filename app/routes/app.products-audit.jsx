import { useFetcher, useLoaderData, useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runProductAudit } from "../services/productAudit.server";
import { useEffect } from "react";

import {
  Page,
  Layout,
  Card,
  Button,
  Text,
  DataTable,
  Banner,
  BlockStack,
  InlineStack,
  Checkbox,
  TextField,
  Divider,
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);

  const latestRun = await prisma.productAuditRun.findFirst({
    where: { shop: session.shop },
    orderBy: { startedAt: "desc" },
  });

  const latestChanged = latestRun
    ? await prisma.productAuditItem.findMany({
        where: { runId: latestRun.id },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  const latestScanned = latestRun
    ? await prisma.productAuditScan.findMany({
        where: { runId: latestRun.id },
        orderBy: { createdAt: "asc" },
        take: 200, // show first 200 scanned samples
      })
    : [];

  return { latestRun, latestChanged, latestScanned };
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  const form = await request.formData();

  const dryRun = form.get("dryRun") === "on";
  const maxProductsRaw = form.get("maxProducts");
  const maxProducts =
    maxProductsRaw && String(maxProductsRaw).trim() !== ""
      ? Number(maxProductsRaw)
      : null;

  // Basic validation
  if (maxProducts !== null && (!Number.isFinite(maxProducts) || maxProducts <= 0)) {
    return Response.json(
      { ok: false, error: "Max products must be a positive number." },
      { status: 400 }
    );
  }

  const result = await runProductAudit({
    shop: session.shop,
    admin,
    dryRun,
    maxProducts,
    logScannedLimit: 200,
  });

  return Response.json({ ok: true, ...result });
};

export default function ProductsAuditPage() {
  const { latestRun, latestChanged, latestScanned } = useLoaderData();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();

  const isRunning = fetcher.state !== "idle";

  useEffect(() => {
  if (fetcher.state === "idle" && fetcher.data) {
    revalidator.revalidate();
  }
}, [fetcher.state, fetcher.data, revalidator]);

  const changedRows = latestChanged.map((i) => [
    i.title,
    i.missingDescription ? "Yes" : "No",
    i.missingImages ? "Yes" : "No",
    `${i.prevStatus} → ${i.newStatus}`,
  ]);

  const scannedRows = latestScanned.map((s) => [
    s.title,
    s.status,
    s.missingDescription ? "Yes" : "No",
    s.missingImages ? "Yes" : "No",
    s.actionTaken, // NONE | WOULD_DRAFT | DRAFT
  ]);

  const actionResultBanner =
    fetcher.data?.ok ? (
      <Banner tone="success">
        Run complete. Checked {fetcher.data.checked} products and drafted{" "}
        {fetcher.data.drafted}
        {fetcher.data.dryRun ? " (dry run: no changes applied)." : "."}
      </Banner>
    ) : fetcher.data?.error ? (
      <Banner tone="critical">{fetcher.data.error}</Banner>
    ) : null;

  return (
    <Page title="Products Content Audit">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                Scans <b>ACTIVE</b> products only. Any product missing a description{" "}
                <b>or</b> images will be moved to <b>DRAFT</b>.
              </Text>

              {actionResultBanner}

              <fetcher.Form method="post">
                <BlockStack gap="300">
                  <InlineStack gap="400" align="start">
                    <Checkbox
                      label="Dry run (log only, don't change products)"
                      name="dryRun"
                      defaultChecked={false}
                      disabled={isRunning}
                    />

                    <div style={{ maxWidth: 220 }}>
                      <TextField
                        label="Max products (optional)"
                        name="maxProducts"
                        type="number"
                        autoComplete="off"
                        helpText="Limit scan size for quick manual runs (e.g. 200). Leave blank to scan all ACTIVE products."
                        disabled={isRunning}
                      />
                    </div>
                  </InlineStack>

                  <Button submit variant="primary" loading={isRunning}>
                    Run audit now
                  </Button>
                </BlockStack>
              </fetcher.Form>

              <Divider />

              {latestRun ? (
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Latest run summary
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Status: <b>{latestRun.status}</b> • Checked:{" "}
                    <b>{latestRun.checked}</b> • Drafted: <b>{latestRun.drafted}</b>
                  </Text>
                  {latestRun.error && <Banner tone="critical">{latestRun.error}</Banner>}
                </BlockStack>
              ) : (
                <Banner tone="info">No audit runs yet. Click “Run audit now” to start.</Banner>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Scanned products (sample from last run)
              </Text>
              <Text as="p" variant="bodySm">
                Shows up to the first 200 products scanned so you can verify the logic.
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Product", "Status", "Missing desc", "Missing images", "Action"]}
                rows={scannedRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Changed products (drafted in last run)
              </Text>
              <Text as="p" variant="bodySm">
                Showing up to the last 200 changes.
              </Text>
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Product", "Missing desc", "Missing images", "Change"]}
                rows={changedRows}
              />
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
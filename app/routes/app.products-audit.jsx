import { useEffect, useState, useCallback } from "react";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { runProductAudit } from "../services/productAudit.server";

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
  Pagination,
} from "@shopify/polaris";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Server loader (React Router v7 data router style)
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);

  const scannedPage = toInt(url.searchParams.get("scannedPage"), 1);
  const changedPage = toInt(url.searchParams.get("changedPage"), 1);
  const pageSize = clamp(toInt(url.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE);

  const latestRun = await prisma.productAuditRun.findFirst({
    where: { shop: session.shop },
    orderBy: { startedAt: "desc" },
  });

  if (!latestRun) {
    return {
      latestRun: null,
      latestChanged: [],
      latestScanned: [],
      totals: { changed: 0, scanned: 0 },
      paging: { scannedPage, changedPage, pageSize },
    };
  }

  // Totals (so we can show proper paging)
  const [changedTotal, scannedTotal] = await Promise.all([
    prisma.productAuditItem.count({ where: { runId: latestRun.id } }),
    prisma.productAuditScan.count({ where: { runId: latestRun.id } }),
  ]);

  const latestChanged = await prisma.productAuditItem.findMany({
    where: { runId: latestRun.id },
    orderBy: { createdAt: "desc" },
    skip: (changedPage - 1) * pageSize,
    take: pageSize,
  });

  const latestScanned = await prisma.productAuditScan.findMany({
    where: { runId: latestRun.id },
    orderBy: { createdAt: "asc" },
    skip: (scannedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    latestRun,
    latestChanged,
    latestScanned,
    totals: { changed: changedTotal, scanned: scannedTotal },
    paging: { scannedPage, changedPage, pageSize },
  };
};

/**
 * Server action (runs when fetcher.Form posts)
 */
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();

  const dryRun = form.get("dryRun") === "on";
  const maxProductsRaw = form.get("maxProducts");
  const maxProducts =
    maxProductsRaw && String(maxProductsRaw).trim() !== ""
      ? Number(maxProductsRaw)
      : null;

  if (maxProducts !== null && (!Number.isFinite(maxProducts) || maxProducts <= 0)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Max products must be a positive number." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const result = await runProductAudit({
    shop: session.shop,
    admin,
    dryRun,
    maxProducts,
    logScannedLimit: 200, // still controls how many you WRITE per run; pagination reads from DB
  });

  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { "Content-Type": "application/json" },
  });
};

export default function ProductsAuditPage() {
  const { latestRun, latestChanged, latestScanned, totals, paging } = useLoaderData();
  const fetcher = useFetcher();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();

  const [dryRun, setDryRun] = useState(false);
  const [maxProducts, setMaxProducts] = useState("");

  const isRunning = fetcher.state !== "idle";

  // ✅ Auto-refresh when the action finishes (success OR failure)
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      revalidator.revalidate();
    }
  }, [fetcher.state, fetcher.data, revalidator]);

  const { scannedPage, changedPage, pageSize } = paging;

  const changedPageCount = Math.max(1, Math.ceil((totals?.changed || 0) / pageSize));
  const scannedPageCount = Math.max(1, Math.ceil((totals?.scanned || 0) / pageSize));

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
    s.actionTaken,
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

  const updateParam = useCallback(
    (key, value) => {
      const next = new URLSearchParams(searchParams);
      next.set(key, String(value));
      // keep pageSize stable unless you decide to change it
      if (!next.get("pageSize")) next.set("pageSize", String(pageSize));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams, pageSize]
  );

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
                      checked={dryRun}
                      onChange={setDryRun}
                      disabled={isRunning}
                    />

                    {/* Ensure it posts */}
                    <input type="hidden" name="dryRun" value={dryRun ? "on" : "off"} />

                    <div style={{ maxWidth: 220 }}>
                      <TextField
                        label="Max products (optional)"
                        value={maxProducts}
                        onChange={setMaxProducts}
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

        {/* Scanned table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Scanned products (last run)
              </Text>
              <Text as="p" variant="bodySm">
                Showing page <b>{scannedPage}</b> of <b>{scannedPageCount}</b> • Total scanned:{" "}
                <b>{totals?.scanned || 0}</b> • Page size: <b>{pageSize}</b>
              </Text>

              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Product", "Status", "Missing desc", "Missing images", "Action"]}
                rows={scannedRows}
              />

              <InlineStack align="space-between">
                <Pagination
                  hasPrevious={scannedPage > 1}
                  onPrevious={() => updateParam("scannedPage", scannedPage - 1)}
                  hasNext={scannedPage < scannedPageCount}
                  onNext={() => updateParam("scannedPage", scannedPage + 1)}
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Changed table */}
        <Layout.Section>
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Changed products (drafted in last run)
              </Text>
              <Text as="p" variant="bodySm">
                Showing page <b>{changedPage}</b> of <b>{changedPageCount}</b> • Total changed:{" "}
                <b>{totals?.changed || 0}</b> • Page size: <b>{pageSize}</b>
              </Text>

              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Product", "Missing desc", "Missing images", "Change"]}
                rows={changedRows}
              />

              <InlineStack align="space-between">
                <Pagination
                  hasPrevious={changedPage > 1}
                  onPrevious={() => updateParam("changedPage", changedPage - 1)}
                  hasNext={changedPage < changedPageCount}
                  onNext={() => updateParam("changedPage", changedPage + 1)}
                />
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
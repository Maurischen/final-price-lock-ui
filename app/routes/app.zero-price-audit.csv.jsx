import { authenticate } from "../shopify.server";
import {
  buildZeroPriceAuditCsv,
  runZeroPriceAudit,
} from "../services/zero-price-audit.server.js";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  const result = await runZeroPriceAudit(admin);
  const csv = buildZeroPriceAuditCsv(result.flaggedRows);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zero-price-audit-${timestamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
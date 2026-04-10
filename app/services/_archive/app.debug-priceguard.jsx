import { useLoaderData } from "react-router";
import db from "../db.server";

export async function loader() {
  const rows = await db.priceGuard.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return { rows };
}

export default function DebugPriceGuard() {
  const { rows } = useLoaderData();

  return (
    <div style={{ padding: 20 }}>
      <h1>Debug PriceGuard</h1>
      <pre
        style={{
          background: "#111",
          color: "#0f0",
          padding: 16,
          borderRadius: 8,
          overflowX: "auto",
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(rows, null, 2)}
      </pre>
    </div>
  );
}
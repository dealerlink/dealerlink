import type { DealDetail } from '@/lib/queries/deals';

export function DealProductsSection({ products }: { products: DealDetail['products'] }) {
  return (
    <section className="border-line mt-6 rounded-[6px] border bg-white">
      <header className="border-line flex items-center justify-between border-b px-5 py-3">
        <div className="titlecaps text-mute">Products</div>
        <div className="mono text-mute text-[11px]">{products.length} line items</div>
      </header>
      {products.length === 0 ? (
        <div className="text-mute px-5 py-8 text-center text-[12.5px]">
          No products linked to this deal yet.
        </div>
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-line bg-tile text-mute border-b text-left text-[11px] uppercase tracking-[0.06em]">
              <th className="px-5 py-2 font-medium">SKU</th>
              <th className="px-5 py-2 font-medium">Product</th>
              <th className="px-5 py-2 text-right font-medium">Est. qty</th>
              <th className="px-5 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-line h-[48px] border-b last:border-b-0">
                <td className="mono px-5 text-[12px]">{p.sku}</td>
                <td className="px-5">{p.name}</td>
                <td className="mono px-5 text-right">
                  {p.estimatedQuantity.toLocaleString('en-IN')}
                </td>
                <td className="text-mute px-5 text-[12px]">{p.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

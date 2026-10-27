import type { OrderLine, Product } from "@/types/domain.ts";

export function productTitle(product: Pick<Product, "productName" | "modelName">): string {
  return [product.productName, product.modelName].filter((part) => part.trim()).join(" ");
}

export interface OrderItemsSummary {
  first: string;
  extra: number;
  names: string[];
}

export function orderItems(products: Product[], lines: OrderLine[]): OrderItemsSummary {
  const names = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    return `${product ? productTitle(product) : "삭제된 품목"} · ${line.quantity.toLocaleString("ko-KR")}개`;
  });
  const firstProduct = products.find((item) => item.id === lines[0]?.productId);
  return {
    first: firstProduct ? productTitle(firstProduct) : "품목 없음",
    extra: Math.max(0, lines.length - 1),
    names,
  };
}

export function orderItemsText(products: Product[], lines: OrderLine[]): string {
  const summary = orderItems(products, lines);
  return summary.extra ? `${summary.first} 외 ${summary.extra}개 품목` : summary.first;
}

export function workItems(products: Product[], items: Array<{ productId: string; quantity: number }>): OrderItemsSummary {
  return orderItems(products, items.map((item, index) => ({
    id: `${item.productId}-${index}`,
    productId: item.productId,
    quantity: item.quantity,
    unitPrice: 0,
    vatIncluded: true,
  })));
}

export function workItemsText(products: Product[], items: Array<{ productId: string; quantity: number }>): string {
  const summary = workItems(products, items);
  return summary.extra ? `${summary.first} 외 ${summary.extra}개 품목` : summary.first;
}

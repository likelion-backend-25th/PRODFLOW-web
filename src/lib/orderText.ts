import type { OrderLine, Product } from "@/types/domain.ts";

export interface OrderItemsSummary {
  first: string;
  extra: number;
  names: string[];
}

export function orderItems(products: Product[], lines: OrderLine[]): OrderItemsSummary {
  const names = lines.map((line) => {
    const product = products.find((item) => item.id === line.productId);
    return `${product ? `${product.productName} ${product.modelName}` : "삭제된 품목"} · ${line.quantity.toLocaleString("ko-KR")}개`;
  });
  const firstProduct = products.find((item) => item.id === lines[0]?.productId);
  return {
    first: firstProduct ? `${firstProduct.productName} ${firstProduct.modelName}` : "품목 없음",
    extra: Math.max(0, lines.length - 1),
    names,
  };
}

export function orderItemsText(products: Product[], lines: OrderLine[]): string {
  const summary = orderItems(products, lines);
  return summary.extra ? `${summary.first} 외 ${summary.extra}개 품목` : summary.first;
}

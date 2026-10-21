import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Button, Card, PageHeader, TextField } from "@/components/ui.tsx";
import { localDate } from "@/lib/dates.ts";
import { useDb } from "@/lib/db.ts";
import { formatWon } from "@/lib/money.ts";
import { saveProduct } from "@/lib/workflow.ts";
import { canManageOrders, useAuthStore } from "@/stores/useAuthStore.ts";
import { useToastStore } from "@/stores/useToastStore.ts";

export function ProductListPage() {
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const [keyword, setKeyword] = useState("");
  const rows = db.products.filter((product) => `${product.productName} ${product.modelName} ${product.description}`.includes(keyword.trim()));
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? "");
  const selected = db.products.find((product) => product.id === selectedId) ?? rows[0];
  const related = (productId: string) => db.orders.filter((order) => order.lines.some((line) => line.productId === productId) && order.status !== "CANCELLED");
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">생산품목 관리</h1>
          <p className="mt-1 text-muted">생산 가능한 제품 명칭과 설명을 등록하고, 수주 등록 시 자동 입력 및 자동 완성을 관리하세요.</p>
        </div>
        {canManageOrders(role) ? <Link to="/products/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 font-semibold text-white">+ 품목 등록</Link> : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">전체 등록 품목</p><p className="mt-2 text-2xl font-semibold">{db.products.length}종</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">이번 달 생산 품목</p><p className="mt-2 text-2xl font-semibold">{new Set(db.orders.flatMap((order) => order.lines.map((line) => line.productId))).size}종</p></section>
        <section className="rounded-xl border border-line bg-white p-4"><p className="text-sm text-muted">검색 결과</p><p className="mt-2 text-2xl font-semibold">{rows.length}종</p></section>
      </div>
      <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex items-center justify-between px-5 py-4"><h2 className="font-semibold">등록된 생산품목</h2><span className="text-sm text-muted">총 {rows.length}종</span></div>
          <div className="px-5 pb-3"><input className="h-10 w-full rounded-lg border border-line px-3" value={keyword} placeholder="품목명, 설명, 카테고리 검색" onChange={(event) => setKeyword(event.target.value)} /></div>
          <table className="w-full text-left text-sm">
            <thead className="bg-primary-soft/40 text-muted"><tr><th className="px-5 py-3 font-medium">품목명</th><th className="py-3 font-medium">모델</th><th className="py-3 font-medium">설명</th><th className="py-3 font-medium">단가</th><th className="py-3 pr-5 font-medium">최근 수정</th></tr></thead>
            <tbody>
              {rows.map((product) => (
                <tr key={product.id} className={`cursor-pointer border-t border-line ${selected?.id === product.id ? "bg-primary-soft" : ""}`} onClick={() => setSelectedId(product.id)}>
                  <td className="px-5 py-3 font-semibold">{product.productName}</td>
                  <td>{product.modelName}</td>
                  <td className="max-w-48 truncate">{product.description}</td>
                  <td>{formatWon(product.unitPrice)}</td>
                  <td className="pr-5">{localDate(product.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {selected ? (
          <aside className="space-y-3">
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-semibold">품목 상세</h2>
              <img src={selected.designImageUrl} alt="" className="mt-3 h-16 w-16 rounded-lg object-cover" />
              <p className="mt-3 text-lg font-semibold">{selected.productName}</p>
              <p className="text-sm text-muted">{selected.modelName}</p>
              <p className="mt-3 text-sm">{selected.description}</p>
              <p className="mt-3 font-semibold">{formatWon(selected.unitPrice)}</p>
              <div className="mt-4 flex gap-2">
                {canManageOrders(role) ? <Link to={`/products/${selected.id}/edit`} className="inline-flex h-10 items-center rounded-lg border border-line px-3">정보 수정</Link> : null}
                {canManageOrders(role) ? <Link to="/orders/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-3 font-semibold text-white">+ 수주 등록</Link> : null}
              </div>
            </section>
            <section className="rounded-xl border border-line bg-white p-5">
              <h3 className="font-semibold">최근 수주</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {related(selected.id).slice(0, 3).map((order) => (
                  <li key={order.id}><Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link> <span className="text-muted">{order.dueDate}</span></li>
                ))}
              </ul>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function ProductFormPage() {
  const { productId } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const actor = useAuthStore((state) => state.user);
  const show = useToastStore((state) => state.show);
  const current = db.products.find((product) => product.id === productId);
  const [productName, setProductName] = useState(current?.productName ?? "");
  const [modelName, setModelName] = useState(current?.modelName ?? "");
  const [description, setDescription] = useState(current?.description ?? "");
  const [unitPrice, setUnitPrice] = useState(current?.unitPrice ?? 0);
  const [designImageUrl, setDesignImageUrl] = useState(current?.designImageUrl ?? "");
  return (
    <div>
      <PageHeader title={current ? "품목 수정" : "품목 등록"} />
      <form className="max-w-3xl" onSubmit={(event) => {
        event.preventDefault();
        try {
          saveProduct({ id: current?.id, productName, modelName, description, unitPrice, designImageUrl, actorName: actor?.name ?? "" });
          show("품목을 저장했습니다. 이미 들어간 수주 단가는 바뀌지 않습니다.");
          navigate("/products");
        } catch (error: unknown) {
          show(error instanceof Error ? error.message : "저장하지 못했습니다.");
        }
      }}>
        <Card className="grid gap-3 md:grid-cols-2">
        <TextField label="제품명" value={productName} onChange={(event) => setProductName(event.target.value)} />
        <TextField label="모델명" value={modelName} onChange={(event) => setModelName(event.target.value)} />
        <TextField label="설명" value={description} onChange={(event) => setDescription(event.target.value)} />
        <TextField label="기준 단가" type="number" value={unitPrice} onChange={(event) => setUnitPrice(Number(event.target.value))} />
        <label className="text-sm text-muted">디자인 이미지
          <input className="mt-1 block" type="file" accept="image/*" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => setDesignImageUrl(String(reader.result ?? ""));
            reader.readAsDataURL(file);
          }} />
        </label>
        {designImageUrl ? <img src={designImageUrl} alt="미리보기" className="h-28 w-28 rounded-lg object-cover" /> : null}
        <div className="flex justify-end md:col-span-2"><Button type="submit">저장</Button></div>
        </Card>
      </form>
    </div>
  );
}

export function ProductDetailPage() {
  const { productId = "" } = useParams();
  const db = useDb();
  const role = useAuthStore((state) => state.user?.role);
  const product = db.products.find((item) => item.id === productId);
  if (!product) return <p>품목을 찾을 수 없습니다.</p>;
  const orders = db.orders.filter((order) => order.lines.some((line) => line.productId === product.id));
  return (
    <div className="space-y-4">
      <PageHeader title={`${product.productName} ${product.modelName}`} action={canManageOrders(role) ? <Link to={`/products/${product.id}/edit`}><Button tone="ghost">수정</Button></Link> : null} />
      <Card className="flex gap-4">
        <img src={product.designImageUrl} alt="" className="h-32 w-32 rounded-lg object-cover" />
        <div>
          <p>{product.description}</p>
          <p className="mt-2">기준 단가 {formatWon(product.unitPrice)}</p>
          <p className="text-muted">등록 {product.createdByName} · {localDate(product.createdAt)}</p>
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">관련 수주</h2>
        <ul>{orders.map((order) => <li key={order.id}><Link className="text-primary" to={`/orders/${order.id}`}>{order.orderNo}</Link></li>)}</ul>
      </Card>
    </div>
  );
}

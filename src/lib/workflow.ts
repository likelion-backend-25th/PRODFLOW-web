import { readDb, updateDb } from "@/lib/db.ts";
import { addDays, nowStamp, todayISO } from "@/lib/dates.ts";
import { depositTarget, digitsOnly, nextModelCode, orderQuantity, orderTotal, paymentStatusOf, productKey } from "@/lib/money.ts";
import { allocateProductItems, capacityUntil, mergeAllocations, packJobs, scheduleBackward, scheduleQuantity, splitQuantityByLines, type OccupyingOrder, type PackJob, type ScheduleResult } from "@/lib/schedule.ts";
import type { Database, LineStatus, NotifyChannel, Order, OrderLine, OrderStatus, Quotation, QuotationPlan, Role, User, WorkOrder } from "@/types/domain.ts";

export class DueDateError extends Error {
  earliestDue: string;

  constructor(earliestDue: string) {
    super(`희망 납기일이 가장 빠른 납기일 ${earliestDue}보다 이릅니다.`);
    this.earliestDue = earliestDue;
  }
}

interface Actor {
  id: string;
  name: string;
  role: Role;
}

function requireOrder(db: Database, orderId: string): Order {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) throw new Error("수주를 찾을 수 없습니다.");
  return order;
}

function requireWorkOrder(db: Database, workOrderId: string): WorkOrder {
  const workOrder = db.workOrders.find((item) => item.id === workOrderId);
  if (!workOrder) throw new Error("작업지시를 찾을 수 없습니다.");
  return workOrder;
}

function pushHistory(db: Database, entity: "ORDER" | "WORK_ORDER", entityId: string, fromStatus: string, toStatus: string, actor: Actor, note?: string): void {
  db.histories.unshift({
    id: crypto.randomUUID(),
    entity,
    entityId,
    fromStatus,
    toStatus,
    at: nowStamp(),
    actorId: actor.id,
    actorName: actor.name,
    ...(note ? { note } : {}),
  });
}

function setOrderStatus(db: Database, order: Order, status: OrderStatus, actor: Actor, note?: string): void {
  if (order.status === status) return;
  pushHistory(db, "ORDER", order.id, order.status, status, actor, note);
  order.status = status;
}

function logOrderChange(db: Database, order: Order, actor: Actor, note: string): void {
  pushHistory(db, "ORDER", order.id, order.status, order.status, actor, note);
}

function requireReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < 2) throw new Error("사유를 2자 이상 입력하세요.");
  return trimmed;
}

function refreshPayment(order: Order): void {
  order.paymentStatus = paymentStatusOf(order.paidAmount, orderTotal(order.lines));
}

function byCreated(left: Order, right: Order): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function lockedWorkOrders(db: Database, orderId: string): WorkOrder[] {
  return orderWorkOrders(db, orderId).filter((item) => item.status !== "READY");
}

function lockedAllocations(db: Database, orderId: string): ReturnType<typeof mergeAllocations> {
  return mergeAllocations(lockedWorkOrders(db, orderId).flatMap((item) => item.allocations ?? []));
}

function lockedQuantity(db: Database, orderId: string): number {
  return lockedWorkOrders(db, orderId).reduce((sum, item) => sum + item.quantity, 0);
}

function applyPacked(order: Order, packed: ScheduleResult | undefined, locked: ReturnType<typeof mergeAllocations>): void {
  const allocations = mergeAllocations([...(locked ?? []), ...(packed?.allocations ?? [])]);
  order.allocations = allocations;
  order.plannedStartDate = allocations[0]?.date ?? order.plannedStartDate;
  order.plannedEndDate = allocations.at(-1)?.date ?? order.plannedEndDate;
}

function floorOccupying(db: Database): OccupyingOrder[] {
  return db.orders
    .filter((order) => order.status === "IN_PRODUCTION" || order.status === "ON_HOLD")
    .map((order) => ({
      id: `${order.id}-locked`,
      status: order.status,
      allocations: lockedAllocations(db, order.id),
    }));
}

function packNotBefore(order: Order, today: string): string | undefined {
  if (order.status !== "WAITING" || !order.depositDueDate || order.depositDueDate <= today) return undefined;
  return order.depositDueDate;
}

function queueJobs(db: Database, ignoreOrderId?: string, overrideQuantity?: number): PackJob[] {
  const today = todayISO();
  const qtyOf = (order: Order) => {
    if (ignoreOrderId && order.id === ignoreOrderId) {
      if (order.status === "IN_PRODUCTION" || order.status === "ON_HOLD") return Math.max(0, (overrideQuantity ?? 0) - lockedQuantity(db, order.id));
      return overrideQuantity ?? 0;
    }
    if (order.status === "IN_PRODUCTION" || order.status === "ON_HOLD") return Math.max(0, order.coveredQuantity - lockedQuantity(db, order.id));
    return orderQuantity(order.lines);
  };
  return [
    ...db.orders.filter((order) => order.status === "IN_PRODUCTION" || order.status === "ON_HOLD").sort(byCreated),
    ...db.orders.filter((order) => order.status === "WAITING" || order.status === "CONFIRMED").sort(byCreated),
  ].map((order) => ({ id: order.id, quantity: qtyOf(order), notBefore: packNotBefore(order, today) }));
}

function packPromised(db: Database, jobs: PackJob[], fromDate: string, holidays: string[], occupying: OccupyingOrder[]): Map<string, ScheduleResult> {
  const placed: OccupyingOrder[] = occupying.map((order) => ({
    id: order.id,
    status: order.status,
    allocations: order.allocations.map((slot) => ({ ...slot })),
  }));
  const results = new Map<string, ScheduleResult>();
  for (const job of jobs) {
    if (job.quantity <= 0) continue;
    const start = job.notBefore && job.notBefore > fromDate ? job.notBefore : fromDate;
    const forward = scheduleQuantity(job.quantity, start, db.lines, holidays, placed, job.id);
    const order = db.orders.find((item) => item.id === job.id);
    let result = forward;
    if (order && (order.status === "WAITING" || order.status === "CONFIRMED") && order.dueDate > forward.earliestDueDate) {
      try {
        result = scheduleBackward(job.quantity, order.dueDate, start, db.lines, holidays, placed, job.id);
      } catch {
        result = forward;
      }
    }
    results.set(job.id, result);
    placed.push({ id: job.id, status: "CONFIRMED", allocations: result.allocations });
  }
  return results;
}

function rescheduleFactory(db: Database, actor: Actor, focus?: { orderId: string; requestedDueDate: string; dueDate?: string; acceptLaterDue: boolean }): void {
  const holidays = db.holidays.map((holiday) => holiday.date);
  const fromDate = todayISO();
  const occupying = floorOccupying(db);

  const floor = db.orders
    .filter((order) => order.status === "IN_PRODUCTION" || order.status === "ON_HOLD")
    .sort(byCreated)
    .map((order) => ({ order, quantity: Math.max(0, order.coveredQuantity - lockedQuantity(db, order.id)), locked: lockedAllocations(db, order.id) }));
  const queued = db.orders
    .filter((order) => order.status === "WAITING" || order.status === "CONFIRMED")
    .sort(byCreated)
    .map((order) => ({ order, quantity: orderQuantity(order.lines), locked: [] as ReturnType<typeof mergeAllocations> }));
  const jobs = [...floor, ...queued];
  const packed = packPromised(
    db,
    jobs.map((job) => ({ id: job.order.id, quantity: job.quantity, notBefore: packNotBefore(job.order, fromDate) })),
    fromDate,
    holidays,
    occupying,
  );

  if (focus) {
    const result = packed.get(focus.orderId);
    const promised = focus.dueDate ?? focus.requestedDueDate;
    if (result && promised < result.earliestDueDate && !focus.acceptLaterDue) {
      throw new DueDateError(result.earliestDueDate);
    }
  }

  const pendingReady = new Set(jobs.filter((job) => job.order.coveredQuantity > 0).map((job) => job.order.id));
  for (const job of jobs) {
    applyPacked(job.order, packed.get(job.order.id), job.locked);
    if (focus && job.order.id === focus.orderId) {
      const result = packed.get(job.order.id);
      const earliest = result?.earliestDueDate ?? job.order.dueDate;
      if (focus.dueDate) {
        job.order.requestedDueDate = focus.requestedDueDate;
        job.order.dueDate = focus.dueDate;
      } else {
        job.order.requestedDueDate = focus.acceptLaterDue ? earliest : focus.requestedDueDate;
        job.order.dueDate = job.order.requestedDueDate;
      }
    }
    if (job.order.coveredQuantity > 0) {
      rebuildReadyWorkOrders(db, job.order, actor, pendingReady);
      pendingReady.delete(job.order.id);
    }
  }
  assignOne(db);
}

function orderWorkOrders(db: Database, orderId: string): WorkOrder[] {
  return db.workOrders.filter((item) => item.orderId === orderId && item.status !== "CANCELLED");
}

function syncOrderFromWorkOrders(db: Database, order: Order, actor: Actor, note?: string): void {
  const active = orderWorkOrders(db, order.id);
  order.producedQuantity = active.filter((item) => item.status === "COMPLETED").reduce((sum, item) => sum + item.quantity, 0);
  if (active.length === 0) return;
  if (active.every((item) => item.status === "COMPLETED")) {
    setOrderStatus(db, order, "PACKING", actor, note);
    return;
  }
  if (active.some((item) => item.status === "IN_PRODUCTION")) {
    setOrderStatus(db, order, "IN_PRODUCTION", actor, note);
    return;
  }
  if (active.some((item) => item.status === "PAUSED")) {
    setOrderStatus(db, order, "ON_HOLD", actor, note);
    return;
  }
  setOrderStatus(db, order, "CONFIRMED", actor, note);
}

function assignOne(db: Database): void {
  const busy = new Set(
    db.workOrders.filter((item) => item.status === "IN_PRODUCTION" && item.assigneeId).map((item) => item.assigneeId as string),
  );
  const candidates = db.users.filter(
    (user) => user.role === "PRODUCTION_MANAGER" && user.status === "ACTIVE" && user.clockedIn && !busy.has(user.id),
  );
  if (candidates.length === 0) return;
  const assignable = new Set<OrderStatus>(["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"]);
  const unstarted = (userId: string) =>
    db.workOrders.filter((item) => item.assigneeId === userId && item.status === "READY").reduce((sum, item) => sum + item.quantity, 0);
  let guard = 0;
  while (guard < 80) {
    const open = db.workOrders
      .filter((item) => item.status === "READY" && !item.assigneeId)
      .map((item) => ({ workOrder: item, order: db.orders.find((order) => order.id === item.orderId) }))
      .filter((item): item is { workOrder: WorkOrder; order: Order } => Boolean(item.order && assignable.has(item.order.status)))
      .sort((left, right) => left.order.dueDate.localeCompare(right.order.dueDate));
    const target = open[0];
    if (!target) return;
    candidates.sort((left, right) => unstarted(left.id) - unstarted(right.id));
    target.workOrder.assigneeId = candidates[0]?.id ?? null;
    if (!target.workOrder.assigneeId) return;
    guard += 1;
  }
}

function occupiesLineCapacity(status: WorkOrder["status"]): boolean {
  return status === "READY" || status === "IN_PRODUCTION" || status === "PAUSED";
}

function occupyingWorkOrders(db: Database, orderId: string, pendingReady: Set<string>): WorkOrder[] {
  return db.workOrders.filter((item) => {
    if (!item.lineId || !occupiesLineCapacity(item.status)) return false;
    if (item.orderId === orderId && item.status === "READY") return false;
    if (item.status === "READY" && pendingReady.has(item.orderId)) return false;
    return true;
  });
}

function rebuildReadyWorkOrders(db: Database, order: Order, actor: Actor, pendingReady: Set<string>): void {
  if (order.coveredQuantity <= 0) return;
  const locked = orderWorkOrders(db, order.id).filter((item) => item.status !== "READY");
  const lockedQty = locked.reduce((sum, item) => sum + item.quantity, 0);
  const readyQty = order.coveredQuantity - lockedQty;
  if (readyQty < 0) throw new Error("이미 생산 중인 수량보다 줄일 수 없습니다.");
  const existingReady = db.workOrders.filter((item) => item.orderId === order.id && item.status === "READY");
  if (readyQty === 0) {
    for (const item of existingReady) item.status = "CANCELLED";
    return;
  }
  const holidays = db.holidays.map((holiday) => holiday.date);
  const chunks = splitQuantityByLines(
    order.allocations,
    readyQty,
    db.lines,
    holidays,
    occupyingWorkOrders(db, order.id, pendingReady),
    locked,
  );
  if (locked.some((item) => !item.items?.length)) {
    const lockedPacks = allocateProductItems(order.lines, locked.map((item) => item.quantity));
    locked.forEach((item, index) => {
      item.items = lockedPacks[index] ?? [];
    });
  }
  const packs = allocateProductItems(
    order.lines,
    chunks.map((chunk) => chunk.quantity),
    locked.flatMap((item) => item.items),
  );
  const used = new Set<string>();
  const issuedAt = nowStamp();
  for (const [index, chunk] of chunks.entries()) {
    const reuse = existingReady.find((item) => item.lineId === chunk.lineId && !used.has(item.id))
      ?? existingReady.find((item) => !used.has(item.id));
    if (reuse) {
      used.add(reuse.id);
      reuse.lineId = chunk.lineId;
      reuse.quantity = chunk.quantity;
      reuse.items = packs[index] ?? [];
      reuse.allocations = chunk.allocations;
      reuse.plannedStartDate = chunk.plannedStartDate;
      reuse.plannedEndDate = chunk.plannedEndDate;
      continue;
    }
    const id = crypto.randomUUID();
    db.workOrders.unshift({
      id,
      orderId: order.id,
      status: "READY",
      assigneeId: null,
      lineId: chunk.lineId,
      quantity: chunk.quantity,
      items: packs[index] ?? [],
      allocations: chunk.allocations,
      issuedAt,
      plannedStartDate: chunk.plannedStartDate,
      plannedEndDate: chunk.plannedEndDate,
      startedAt: null,
      completedAt: null,
    });
    pushHistory(db, "WORK_ORDER", id, "NONE", "READY", actor);
  }
  for (const item of existingReady) {
    if (!used.has(item.id)) item.status = "CANCELLED";
  }
}

function syncCoveredQuantity(order: Order): void {
  const totalQty = orderQuantity(order.lines);
  const covered = order.paidAmount >= depositTarget(orderTotal(order.lines)) ? totalQty : order.coveredQuantity;
  order.coveredQuantity = Math.min(covered, totalQty);
}

function lineCandidates(db: Database): string[] {
  const held = new Set(
    db.workOrders.filter((item) => item.lineId && (item.status === "IN_PRODUCTION" || item.status === "PAUSED")).map((item) => item.lineId as string),
  );
  return db.lines.filter((line) => line.status === "AVAILABLE" && !held.has(line.id)).map((line) => line.id);
}

export function previewSchedule(quantity: number, ignoreOrderId?: string, notBefore?: string): { earliestDueDate: string; plannedStartDate: string; plannedEndDate: string } {
  const db = readDb();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const jobs = queueJobs(db, ignoreOrderId, quantity);
  if (!ignoreOrderId) jobs.push({ id: "preview-new", quantity, notBefore });
  const packed = packPromised(db, jobs, todayISO(), holidays, floorOccupying(db));
  const result = packed.get(ignoreOrderId ?? "preview-new");
  if (!result) throw new Error("가용 생산량 안에서 완료 예정일을 계산하지 못했습니다.");
  return result;
}

function placedOrders(ignoreOrderId?: string): OccupyingOrder[] {
  const db = readDb();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const occupying = floorOccupying(db);
  const jobs = queueJobs(db, ignoreOrderId);
  const packed = packPromised(db, jobs, todayISO(), holidays, occupying);
  return [
    ...occupying,
    ...jobs.map((job) => ({
      id: job.id,
      status: "CONFIRMED" as const,
      allocations: packed.get(job.id)?.allocations ?? [],
    })),
  ];
}

export function previewDuePlan(quantity: number, dueDate: string): { plannedStartDate: string; plannedEndDate: string } {
  const db = readDb();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const result = scheduleBackward(quantity, dueDate, todayISO(), db.lines, holidays, placedOrders());
  return { plannedStartDate: result.plannedStartDate, plannedEndDate: result.plannedEndDate };
}

export function previewCapacity(dueDate: string, ignoreOrderId?: string, notBefore?: string): { total: number; available: number; lastProductionDate: string | null } {
  const db = readDb();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const occupying = floorOccupying(db);
  const jobs = queueJobs(db, ignoreOrderId);
  const today = todayISO();
  const fromDate = notBefore && notBefore > today ? notBefore : today;
  const packed = packJobs(jobs, today, db.lines, holidays, occupying);
  const placed: OccupyingOrder[] = [
    ...occupying,
    ...jobs.map((job) => ({
      id: job.id,
      status: "CONFIRMED" as const,
      allocations: packed.get(job.id)?.allocations ?? [],
    })),
  ];
  return capacityUntil(dueDate, fromDate, db.lines, holidays, placed);
}

export interface OrderClientDraft {
  companyName: string;
  contactName: string;
  phone: string;
  taxEmail: string;
  address: string;
}

function normalizeCompanyName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function ensureClient(db: Database, input: OrderClientDraft): string {
  const companyName = input.companyName.trim().replace(/\s+/g, " ");
  if (!companyName) throw new Error("회사명을 입력하세요.");
  const existing = db.clients.find((client) => normalizeCompanyName(client.companyName) === normalizeCompanyName(companyName));
  if (existing) return existing.id;
  const phone = input.phone.trim();
  const contactName = input.contactName.trim();
  const address = input.address.trim();
  const taxEmail = input.taxEmail.trim();
  if (!contactName) throw new Error("담당자명을 입력하세요.");
  if (digitsOnly(phone).length < 9) throw new Error("거래처 연락처를 확인하세요.");
  if (!taxEmail.includes("@")) throw new Error("이메일을 확인하세요.");
  if (!address) throw new Error("회사 주소를 입력하세요.");
  const id = crypto.randomUUID();
  db.clients.unshift({
    id,
    companyName,
    representative: contactName,
    address,
    postalCode: "",
    addressDetail: "",
    phone,
    contactName,
    contactMobile: phone,
    taxEmail,
    createdAt: nowStamp(),
  });
  return id;
}

function nextQuotationNo(db: Database): string {
  const year = todayISO().slice(0, 4);
  const sequence = db.quotations.filter((item) => item.quotationNo.startsWith(`QT-${year}-`)).length + 1;
  return `QT-${year}-${String(sequence).padStart(3, "0")}`;
}

function planFromPreview(quantity: number, requestedDueDate: string): { estimatedDueDate: string; plannedStartDate: string; plannedEndDate: string } {
  const preview = previewSchedule(quantity, undefined, todayISO());
  if (requestedDueDate < preview.earliestDueDate) {
    return { estimatedDueDate: preview.earliestDueDate, plannedStartDate: preview.plannedStartDate, plannedEndDate: preview.plannedEndDate };
  }
  const duePlan = previewDuePlan(quantity, requestedDueDate);
  return { estimatedDueDate: requestedDueDate, plannedStartDate: duePlan.plannedStartDate, plannedEndDate: duePlan.plannedEndDate };
}

export function createQuotation(input: {
  clientId?: string;
  client?: OrderClientDraft;
  lines: Array<Omit<OrderLine, "id">>;
  requestedDueDate: string;
  validUntil: string;
  vatIncluded: boolean;
  actor: Actor;
}): Quotation {
  if (input.lines.length === 0) throw new Error("품목 줄을 1개 이상 입력하세요.");
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new Error("같은 품목이 두 줄 이상 있습니다. 수량을 한 줄로 합치세요.");
  if (!input.requestedDueDate) throw new Error("희망 납기일을 선택하세요.");
  const validityChoices = [addDays(todayISO(), 14), addDays(todayISO(), 7)];
  if (!validityChoices.includes(input.validUntil)) throw new Error("견적 유효기간은 발행일부터 14일 또는 7일입니다.");
  const quantity = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  const schedule = planFromPreview(quantity, input.requestedDueDate);
  let createdId = "";
  updateDb((db) => {
    const existing = input.clientId ? db.clients.find((client) => client.id === input.clientId) : undefined;
    const clientId = existing?.id ?? (input.client ? ensureClient(db, input.client) : "");
    if (!clientId) throw new Error("거래처를 입력하세요.");
    const now = nowStamp();
    const plan: QuotationPlan = {
      id: crypto.randomUUID(),
      status: "ACTIVE",
      plannedStartDate: schedule.plannedStartDate,
      plannedEndDate: schedule.plannedEndDate,
      estimatedDueDate: schedule.estimatedDueDate,
      quantity,
      createdAt: now,
    };
    const quotation: Quotation = {
      id: crypto.randomUUID(),
      quotationNo: nextQuotationNo(db),
      clientId,
      userId: input.actor.id,
      lines: input.lines.map((line) => ({ ...line, id: crypto.randomUUID() })),
      requestedDueDate: input.requestedDueDate,
      estimatedDueDate: schedule.estimatedDueDate,
      validUntil: input.validUntil,
      status: "SENT",
      vatIncluded: input.vatIncluded,
      plans: [plan],
      createdAt: now,
      updatedAt: now,
    };
    db.quotations.unshift(quotation);
    createdId = quotation.id;
  });
  return readDb().quotations.find((item) => item.id === createdId) as Quotation;
}

export function setQuotationStatus(quotationId: string, status: "APPROVED" | "REJECTED" | "CANCELLED", actor: Actor): void {
  updateDb((db) => {
    const quotation = db.quotations.find((item) => item.id === quotationId);
    if (!quotation) throw new Error("견적서를 찾을 수 없습니다.");
    if (quotation.status !== "SENT") throw new Error("발송된 견적만 승인, 거절, 취소할 수 있습니다.");
    if (status === "APPROVED" && quotation.validUntil < todayISO()) throw new Error("유효기간이 지난 견적은 승인할 수 없습니다. 견적을 다시 작성하세요.");
    if (db.orders.some((order) => order.quotationId === quotation.id)) throw new Error("이미 수주가 등록된 견적입니다.");
    quotation.status = status;
    quotation.updatedAt = nowStamp();
    if (status !== "APPROVED") {
      quotation.plans.forEach((plan) => {
        if (plan.status === "ACTIVE") plan.status = "CANCELLED";
      });
    }
    void actor;
  });
}

export function recalculateQuotation(quotationId: string, requestedDueDate: string): void {
  if (!requestedDueDate) throw new Error("희망 납기일을 선택하세요.");
  const current = readDb().quotations.find((item) => item.id === quotationId);
  if (!current) throw new Error("견적서를 찾을 수 없습니다.");
  if (current.status !== "SENT") throw new Error("발송 후 승인 전인 견적만 재산정할 수 있습니다.");
  const quantity = current.lines.reduce((sum, line) => sum + line.quantity, 0);
  const schedule = planFromPreview(quantity, requestedDueDate);
  updateDb((db) => {
    const quotation = db.quotations.find((item) => item.id === quotationId);
    if (!quotation || quotation.status !== "SENT") throw new Error("발송 후 승인 전인 견적만 재산정할 수 있습니다.");
    quotation.plans.forEach((plan) => {
      if (plan.status === "ACTIVE") plan.status = "RECALCULATED";
    });
    quotation.requestedDueDate = requestedDueDate;
    quotation.estimatedDueDate = schedule.estimatedDueDate;
    quotation.updatedAt = nowStamp();
    quotation.plans.unshift({
      id: crypto.randomUUID(),
      status: "ACTIVE",
      plannedStartDate: schedule.plannedStartDate,
      plannedEndDate: schedule.plannedEndDate,
      estimatedDueDate: schedule.estimatedDueDate,
      quantity,
      createdAt: quotation.updatedAt,
    });
  });
}

export function createOrder(input: {
  quotationId?: string;
  clientId?: string;
  client?: OrderClientDraft;
  lines: Array<Omit<OrderLine, "id">>;
  requestedDueDate: string;
  dueDate?: string;
  depositDueDate: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  shippingAddress: string;
  receiverPhone: string;
  notifyChannel: NotifyChannel;
  memo: string;
  actor: Actor;
}): Order {
  if (input.lines.length === 0) throw new Error("품목 줄을 1개 이상 입력하세요.");
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new Error("같은 품목이 두 줄 이상 있습니다. 수량을 한 줄로 합치세요.");
  const receiverPhone = input.receiverPhone.trim();
  if (digitsOnly(receiverPhone).length < 9) throw new Error("배송 수신 연락처를 확인하세요.");
  if (!input.depositDueDate || input.depositDueDate < todayISO()) throw new Error("계약금 입금 마감일은 오늘 이후로 선택하세요.");
  let createdId = "";
  updateDb((db) => {
    if (input.quotationId) {
      const quotation = db.quotations.find((item) => item.id === input.quotationId);
      if (!quotation || quotation.status !== "APPROVED") throw new Error("승인된 견적만 수주로 등록할 수 있습니다.");
      if (db.orders.some((order) => order.quotationId === input.quotationId && order.status !== "CANCELLED")) {
        throw new Error("이 견적으로 등록된 수주가 이미 있습니다.");
      }
      if (input.lines.length !== quotation.lines.length) throw new Error("견적 품목은 빼거나 추가하지 않습니다. 수량만 줄일 수 있습니다.");
      input.lines.forEach((line) => {
        const source = quotation.lines.find((item) => item.productId === line.productId);
        if (!source || line.unitPrice !== source.unitPrice || line.vatIncluded !== source.vatIncluded) {
          throw new Error("단가는 승인된 견적과 같아야 합니다.");
        }
        if (line.quantity < 1 || line.quantity > source.quantity) throw new Error("수량은 견적 수량 이하로만 줄일 수 있습니다.");
      });
    }
    const existing = input.clientId ? db.clients.find((item) => item.id === input.clientId) : undefined;
    const clientId = existing?.id ?? (input.client ? ensureClient(db, input.client) : "");
    if (!clientId) throw new Error("거래처를 입력하세요.");
    const order: Order = {
      id: crypto.randomUUID(),
      orderNo: `PF-${todayISO().slice(0, 4)}-${String(db.orders.length + 1).padStart(3, "0")}`,
      quotationId: input.quotationId,
      clientId,
      lines: input.lines.map((item) => ({ ...item, id: crypto.randomUUID() })),
      requestedDueDate: input.requestedDueDate,
      dueDate: input.dueDate || input.requestedDueDate,
      plannedStartDate: input.plannedStartDate || input.depositDueDate,
      plannedEndDate: input.plannedEndDate || input.depositDueDate,
      depositDueDate: input.depositDueDate,
      allocations: [],
      shippingAddress: input.shippingAddress,
      receiverPhone,
      notifyChannel: input.notifyChannel,
      memo: input.memo.trim(),
      status: "WAITING",
      paymentStatus: "UNPAID",
      paidAmount: 0,
      virtualAccount: `국민 ${crypto.randomUUID().slice(0, 4)}-${crypto.randomUUID().slice(0, 4)}-${crypto.randomUUID().slice(0, 4)}`,
      coveredQuantity: 0,
      producedQuantity: 0,
      carrier: "",
      trackingNo: "",
      createdAt: nowStamp(),
      completedAt: null,
    };
    db.orders.unshift(order);
    rescheduleFactory(db, input.actor, {
      orderId: order.id,
      requestedDueDate: input.requestedDueDate,
      dueDate: input.dueDate,
      acceptLaterDue: false,
    });
    pushHistory(db, "ORDER", order.id, "NONE", "WAITING", input.actor);
    createdId = order.id;
  });
  return readDb().orders.find((order) => order.id === createdId) as Order;
}

export function recordPayment(orderId: string, amount: number, actor: Actor): void {
  if (amount <= 0) throw new Error("입금 금액을 입력하세요.");
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status === "CANCELLED") throw new Error("취소된 수주에는 입금할 수 없습니다.");
    const total = orderTotal(order.lines);
    if (order.paidAmount + amount > total) throw new Error(`남은 금액 ${(total - order.paidAmount).toLocaleString("ko-KR")}원보다 많이 입금할 수 없습니다.`);
    order.paidAmount += amount;
    refreshPayment(order);
    const note = `입금 ${amount.toLocaleString("ko-KR")}원 (누적 ${order.paidAmount.toLocaleString("ko-KR")}원)`;
    const wasWaiting = order.status === "WAITING";
    if (!wasWaiting || order.paidAmount < depositTarget(total)) logOrderChange(db, order, actor, note);
    if (wasWaiting && order.paidAmount >= depositTarget(total)) {
      setOrderStatus(db, order, "CONFIRMED", actor, `${note} · 선금 확인`);
    }
    const previousCovered = order.coveredQuantity;
    syncCoveredQuantity(order);
    if ((wasWaiting && order.status === "CONFIRMED") || order.coveredQuantity !== previousCovered) rescheduleFactory(db, actor);
    assignOne(db);
  });
}

function productLabel(db: Database, productId: string): string {
  const product = db.products.find((item) => item.id === productId);
  return product ? [product.productName, product.modelName].filter((part) => part.trim()).join(" ") : "품목";
}

export function updateOrderPrices(orderId: string, prices: Record<string, number>, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status !== "WAITING") throw new Error("단가는 대기 수주에서만 수정합니다.");
    const changes: string[] = [];
    order.lines.forEach((line) => {
      const next = prices[line.id];
      if (next === undefined || next === line.unitPrice) return;
      if (!Number.isFinite(next) || next < 0) throw new Error("단가는 0원 이상입니다.");
      changes.push(`${productLabel(db, line.productId)} 단가 ${line.unitPrice.toLocaleString("ko-KR")} → ${next.toLocaleString("ko-KR")}원`);
      line.unitPrice = next;
    });
    if (changes.length === 0) throw new Error("바뀐 단가가 없습니다.");
    refreshPayment(order);
    logOrderChange(db, order, actor, changes.join(", "));
  });
}

export function updateOrderQuantities(orderId: string, quantities: Record<string, number>, acceptLaterDue: boolean, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (["PACKING", "PACKED", "READY_TO_SHIP", "SHIPPING", "COMPLETED", "CANCELLED"].includes(order.status)) {
      throw new Error("포장 이후에는 수량을 바꿀 수 없습니다.");
    }
    const changes: string[] = [];
    order.lines.forEach((line) => {
      const next = quantities[line.id];
      if (next === undefined || next === line.quantity) return;
      if (!Number.isInteger(next) || next <= 0) throw new Error("수량은 1개 이상입니다.");
      if (next > line.quantity) throw new Error("수량은 줄일 수만 있습니다. 늘리려면 견적을 다시 작성하세요.");
      changes.push(`${productLabel(db, line.productId)} 수량 ${line.quantity.toLocaleString("ko-KR")} → ${next.toLocaleString("ko-KR")}개`);
      line.quantity = next;
    });
    if (changes.length === 0) throw new Error("바뀐 수량이 없습니다.");
    const previousDue = order.dueDate;
    refreshPayment(order);
    syncCoveredQuantity(order);
    rescheduleFactory(db, actor, { orderId: order.id, requestedDueDate: order.dueDate, acceptLaterDue });
    assignOne(db);
    if (order.dueDate !== previousDue) changes.push(`납기 ${previousDue} → ${order.dueDate}`);
    logOrderChange(db, order, actor, changes.join(", "));
  });
}

export function updateShippingAddress(orderId: string, shippingAddress: string, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status === "SHIPPING" || order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new Error("배송이 시작된 수주의 배송지는 바꿀 수 없습니다.");
    }
    if (order.shippingAddress === shippingAddress) return;
    logOrderChange(db, order, actor, `배송지 ${order.shippingAddress} → ${shippingAddress}`);
    order.shippingAddress = shippingAddress;
  });
}

export function expireUnpaidOrders(): number {
  const today = todayISO();
  const current = readDb();
  const due = current.orders.filter((order) => order.status === "WAITING" && order.paidAmount === 0 && order.depositDueDate < today);
  if (due.length === 0) return 0;
  const actorUser = current.users.find((user) => user.role === "SUPER_ADMIN" && user.status === "ACTIVE");
  if (!actorUser) return 0;
  const actor: Actor = { id: actorUser.id, name: actorUser.name, role: actorUser.role };
  updateDb((db) => {
    let changed = false;
    for (const order of db.orders) {
      if (order.status !== "WAITING" || order.paidAmount > 0 || order.depositDueDate >= today) continue;
      order.allocations = [];
      setOrderStatus(db, order, "CANCELLED", actor, "계약금 입금 마감일이 지나 자동 취소");
      changed = true;
    }
    if (changed) rescheduleFactory(db, actor);
  });
  return due.length;
}

export function cancelOrder(orderId: string, reason: string, actor: Actor): void {
  const note = `취소 사유: ${requireReason(reason)}`;
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status !== "WAITING" || order.paidAmount > 0) throw new Error("입금 전 대기 수주만 취소할 수 있습니다.");
    order.allocations = [];
    setOrderStatus(db, order, "CANCELLED", actor, note);
    rescheduleFactory(db, actor);
  });
}

export function clockIn(userId: string): void {
  updateDb((db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user || user.status !== "ACTIVE" || user.role !== "PRODUCTION_MANAGER") throw new Error("활성 현장 관리자만 출근할 수 있습니다.");
    if (user.clockedIn) throw new Error("이미 출근 중입니다.");
    user.clockedIn = true;
    db.attendance.unshift({ id: crypto.randomUUID(), userId, clockInAt: nowStamp(), clockOutAt: null });
    assignOne(db);
  });
}

export function clockOut(userId: string): void {
  updateDb((db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user || !user.clockedIn) throw new Error("출근 중이 아닙니다.");
    const running = db.workOrders.some((item) => item.assigneeId === userId && item.status === "IN_PRODUCTION");
    if (running) throw new Error("생산중인 작업을 완료하거나 일시정지한 뒤에 퇴근하세요.");
    endShift(db, user);
  });
}

export function startProduction(workOrderId: string, lineId: string, actor: Actor): void {
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    const order = requireOrder(db, workOrder.orderId);
    if (workOrder.assigneeId !== actor.id) throw new Error("배정된 담당자만 생산을 시작할 수 있습니다.");
    if (workOrder.status !== "READY" || !["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"].includes(order.status)) {
      throw new Error("생산 시작은 준비 상태 작업에서만 할 수 있습니다.");
    }
    if (!lineCandidates(db).includes(lineId)) throw new Error("비어 있는 가동 가능 라인만 선택할 수 있습니다.");
    const line = db.lines.find((item) => item.id === lineId);
    if (!line) throw new Error("라인을 찾을 수 없습니다.");
    workOrder.lineId = lineId;
    workOrder.status = "IN_PRODUCTION";
    workOrder.startedAt = nowStamp();
    line.status = "RUNNING";
    setOrderStatus(db, order, "IN_PRODUCTION", actor);
    pushHistory(db, "WORK_ORDER", workOrder.id, "READY", "IN_PRODUCTION", actor);
  });
}

export function stopProduction(workOrderId: string, reason: string, actor: Actor): void {
  const note = `중지 사유: ${requireReason(reason)}`;
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    const order = requireOrder(db, workOrder.orderId);
    if (workOrder.status !== "IN_PRODUCTION") throw new Error("생산중인 작업만 중지할 수 있습니다.");
    const line = db.lines.find((item) => item.id === workOrder.lineId);
    if (line) line.status = "AVAILABLE";
    workOrder.status = "READY";
    workOrder.startedAt = null;
    syncOrderFromWorkOrders(db, order, actor, note);
    pushHistory(db, "WORK_ORDER", workOrder.id, "IN_PRODUCTION", "READY", actor, note);
  });
}

export function holdProduction(workOrderId: string, reason: string, actor: Actor): void {
  const note = `일시정지 사유: ${requireReason(reason)}`;
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    const order = requireOrder(db, workOrder.orderId);
    if (workOrder.status !== "IN_PRODUCTION") throw new Error("생산중인 작업만 보류할 수 있습니다.");
    workOrder.status = "PAUSED";
    syncOrderFromWorkOrders(db, order, actor, note);
    pushHistory(db, "WORK_ORDER", workOrder.id, "IN_PRODUCTION", "PAUSED", actor, note);
  });
}

export function resumeProduction(workOrderId: string, actor: Actor): void {
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    const order = requireOrder(db, workOrder.orderId);
    if (workOrder.status !== "PAUSED") throw new Error("보류 중인 작업만 해제할 수 있습니다.");
    workOrder.status = "IN_PRODUCTION";
    syncOrderFromWorkOrders(db, order, actor);
    pushHistory(db, "WORK_ORDER", workOrder.id, "PAUSED", "IN_PRODUCTION", actor);
  });
}

export function completeProduction(workOrderId: string, actor: Actor): void {
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    const order = requireOrder(db, workOrder.orderId);
    if (workOrder.status !== "IN_PRODUCTION") throw new Error("생산중인 작업만 완료할 수 있습니다.");
    const from = workOrder.status;
    workOrder.status = "COMPLETED";
    workOrder.completedAt = nowStamp();
    const line = db.lines.find((item) => item.id === workOrder.lineId);
    if (line && line.status === "RUNNING") line.status = "AVAILABLE";
    syncOrderFromWorkOrders(db, order, actor);
    pushHistory(db, "WORK_ORDER", workOrder.id, from, "COMPLETED", actor);
    rescheduleFactory(db, actor);
    assignOne(db);
  });
}

export function completePacking(orderId: string, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status !== "PACKING") throw new Error("포장중인 수주만 포장 완료할 수 있습니다.");
    setOrderStatus(db, order, "PACKED", actor);
  });
}

export function markReadyToShip(orderId: string, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status !== "PACKED") throw new Error("포장완료인 수주만 출고대기로 바꿀 수 있습니다.");
    setOrderStatus(db, order, "READY_TO_SHIP", actor);
  });
}

export function shipOrder(orderId: string, carrier: string, trackingNo: string, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    // 잔금은 거래처가 배송 완료 후 물건을 확인하고 입금하므로 출고 조건에 넣지 않는다.
    if (order.status !== "READY_TO_SHIP") throw new Error("출고대기인 수주만 출고할 수 있습니다.");
    if (!carrier.trim() || !trackingNo.trim()) throw new Error("택배사와 운송장 번호를 입력하세요.");
    order.carrier = carrier.trim();
    order.trackingNo = trackingNo.trim();
    db.notifications.unshift({
      id: crypto.randomUUID(),
      orderId: order.id,
      success: true,
      message: `${order.notifyChannel === "EMAIL" ? "이메일" : "SMS"} 출고 알림은 예시로 발송 성공 처리했습니다.`,
      at: nowStamp(),
    });
    setOrderStatus(db, order, "SHIPPING", actor);
  });
}

export function completeDelivery(orderId: string, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status !== "SHIPPING") throw new Error("배송중인 수주만 배송 완료할 수 있습니다.");
    order.completedAt = nowStamp();
    setOrderStatus(db, order, "COMPLETED", actor);
  });
}

export function reassign(workOrderId: string, assigneeId: string, actor: Actor): void {
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    if (workOrder.status === "COMPLETED" || workOrder.status === "CANCELLED") throw new Error("끝난 작업지시의 담당자는 바꿀 수 없습니다.");
    const user = db.users.find((item) => item.id === assigneeId && item.role === "PRODUCTION_MANAGER" && item.status === "ACTIVE");
    if (!user) throw new Error("현장 관리자 계정만 담당자로 지정할 수 있습니다.");
    if (workOrder.status === "IN_PRODUCTION" && db.workOrders.some((item) => item.id !== workOrder.id && item.assigneeId === user.id && item.status === "IN_PRODUCTION")) {
      throw new Error(`${user.name}님은 이미 생산중인 작업이 있습니다.`);
    }
    const previous = db.users.find((item) => item.id === workOrder.assigneeId)?.name ?? "미배정";
    workOrder.assigneeId = user.id;
    pushHistory(db, "WORK_ORDER", workOrder.id, workOrder.status, workOrder.status, actor, `담당자 ${previous} → ${user.name}`);
  });
}

export function changeLine(workOrderId: string, lineId: string, actor: Actor): void {
  updateDb((db) => {
    const workOrder = requireWorkOrder(db, workOrderId);
    if (workOrder.status !== "READY" && workOrder.status !== "IN_PRODUCTION" && workOrder.status !== "PAUSED") {
      throw new Error("준비·생산중·보류 중에서만 라인을 바꿀 수 있습니다.");
    }
    if (!lineCandidates(db).includes(lineId) && lineId !== workOrder.lineId) throw new Error("비어 있는 가동 가능 라인만 선택할 수 있습니다.");
    const previous = db.lines.find((item) => item.id === workOrder.lineId);
    const next = db.lines.find((item) => item.id === lineId);
    if (workOrder.status !== "READY") {
      if (previous) previous.status = "AVAILABLE";
      if (next) next.status = "RUNNING";
    }
    workOrder.lineId = lineId;
    pushHistory(db, "WORK_ORDER", workOrder.id, workOrder.status, workOrder.status, actor, `라인 ${previous?.name ?? "없음"} → ${next?.name ?? lineId}`);
  });
}

export function availableLineIds(): string[] {
  return lineCandidates(readDb());
}

export function clientFullAddress(client: { postalCode: string; address: string; addressDetail: string }): string {
  return [client.postalCode, client.address, client.addressDetail].map((part) => part.trim()).filter(Boolean).join(" ");
}

export function saveClient(input: {
  id?: string;
  companyName: string;
  representative: string;
  address: string;
  postalCode: string;
  addressDetail: string;
  phone: string;
  contactName: string;
  contactMobile: string;
  taxEmail: string;
}): void {
  if (!input.companyName.trim()) throw new Error("회사명을 입력하세요.");
  updateDb((db) => {
    if (input.id) {
      const client = db.clients.find((item) => item.id === input.id);
      if (!client) throw new Error("거래처를 찾을 수 없습니다.");
      Object.assign(client, input);
      return;
    }
    db.clients.unshift({ ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
  });
}

export function importClients(rows: Array<Omit<Parameters<typeof saveClient>[0], "id">>): { created: number; errors: string[] } {
  const errors: string[] = [];
  let created = 0;
  rows.forEach((row, index) => {
    try {
      saveClient(row);
      created += 1;
    } catch (error: unknown) {
      errors.push(`${index + 2}행: ${error instanceof Error ? error.message : "등록하지 못했습니다."}`);
    }
  });
  return { created, errors };
}

export function saveProduct(input: {
  id?: string;
  modelCode?: string;
  productName: string;
  modelName: string;
  description: string;
  unitPrice: number;
  designImageUrl: string;
  drawingPdfName?: string;
  drawingPdfUrl?: string;
  actorName: string;
}): string {
  if (!input.productName.trim()) throw new Error("품목명을 입력하세요.");
  if (!input.modelName.trim()) throw new Error("기종을 선택하세요.");
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new Error("단가를 확인하세요.");
  let savedId = input.id ?? "";
  updateDb((db) => {
    const key = productKey(input.productName, input.modelName);
    const duplicate = db.products.find((product) => productKey(product.productName, product.modelName) === key && product.id !== input.id);
    if (duplicate) throw new Error("같은 품목명과 기종의 품목이 있습니다.");
    const requestedCode = input.modelCode?.trim() ?? "";
    const codeTaken = (code: string) => db.products.some((product) => product.modelCode.replace(/\s+/g, "").toLowerCase() === code.replace(/\s+/g, "").toLowerCase() && product.id !== input.id);
    if (requestedCode && codeTaken(requestedCode)) throw new Error("같은 모델코드가 있습니다.");
    if (input.id) {
      const product = db.products.find((item) => item.id === input.id);
      if (!product) throw new Error("품목을 찾을 수 없습니다.");
      product.modelCode = requestedCode || product.modelCode || nextModelCode(db.products.map((item) => item.modelCode).filter((code) => code));
      product.productName = input.productName.trim();
      product.modelName = input.modelName.trim();
      product.description = input.description;
      product.unitPrice = input.unitPrice;
      if (input.designImageUrl) product.designImageUrl = input.designImageUrl;
      if (input.drawingPdfUrl !== undefined) {
        product.drawingPdfName = input.drawingPdfName ?? "";
        product.drawingPdfUrl = input.drawingPdfUrl;
      }
      product.updatedAt = nowStamp();
      return;
    }
    savedId = crypto.randomUUID();
    db.products.unshift({
      id: savedId,
      modelCode: requestedCode || nextModelCode(db.products.map((item) => item.modelCode).filter((code) => code)),
      productName: input.productName.trim(),
      modelName: input.modelName.trim(),
      description: input.description,
      unitPrice: input.unitPrice,
      designImageUrl: input.designImageUrl,
      drawingPdfName: input.drawingPdfName ?? "",
      drawingPdfUrl: input.drawingPdfUrl ?? "",
      createdAt: nowStamp(),
      updatedAt: nowStamp(),
      createdByName: input.actorName,
    });
  });
  return savedId;
}

export function saveLine(input: { id?: string; name: string; dailyCapacity: number; reason?: string; actorId?: string }): void {
  updateDb((db) => {
    const name = input.name.trim();
    if (!name) throw new Error("라인 이름을 입력하세요.");
    if (!Number.isInteger(input.dailyCapacity) || input.dailyCapacity < 1) throw new Error("하루 생산량은 1개 이상 정수로 입력하세요.");
    if (input.id) {
      const line = db.lines.find((item) => item.id === input.id);
      if (!line) throw new Error("라인을 찾을 수 없습니다.");
      // 하루 생산량이 바뀐 경우에만 변경 이력을 남긴다. 이름만 고치면 용량 이력은 그대로다.
      if (line.dailyCapacity !== input.dailyCapacity) {
        const reason = input.reason?.trim() ?? "";
        if (reason.length < 2) throw new Error("하루 생산량 변경 사유를 2자 이상 입력하세요.");
        if (!input.actorId || !db.users.some((user) => user.id === input.actorId)) throw new Error("변경한 계정을 확인할 수 없습니다.");
        db.lineCapacityLogs.unshift({
          id: crypto.randomUUID(),
          lineId: line.id,
          beforeCapacity: line.dailyCapacity,
          afterCapacity: input.dailyCapacity,
          reason,
          userId: input.actorId,
          changedAt: nowStamp(),
        });
      }
      line.name = name;
      line.dailyCapacity = input.dailyCapacity;
      return;
    }
    db.lines.push({ id: crypto.randomUUID(), name, dailyCapacity: input.dailyCapacity, status: "AVAILABLE" });
  });
}

export function saveLineCapacity(lineId: string, dailyCapacity: number, actor: Actor): void {
  if (!Number.isInteger(dailyCapacity) || dailyCapacity <= 0) throw new Error("일 최대 생산량은 1개 이상 정수입니다.");
  updateDb((db) => {
    const line = db.lines.find((item) => item.id === lineId);
    if (!line) throw new Error("라인을 찾을 수 없습니다.");
    if (line.dailyCapacity === dailyCapacity) return;
    line.dailyCapacity = dailyCapacity;
    rescheduleFactory(db, actor);
  });
}

export function setLineStatus(lineId: string, status: LineStatus): void {
  updateDb((db) => {
    const line = db.lines.find((item) => item.id === lineId);
    if (!line) throw new Error("라인을 찾을 수 없습니다.");
    const running = db.workOrders.some((item) => item.lineId === lineId && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
    if (running && status !== "RUNNING") throw new Error("생산이 걸려 있는 라인은 다른 라인으로 옮긴 뒤에 상태를 바꿉니다.");
    line.status = status;
  });
}

export interface UserInput {
  id?: string;
  loginId: string;
  password: string;
  name: string;
  email: string;
  department: string;
  role: User["role"];
  status: Exclude<User["status"], "DELETED">;
}

function endShift(db: Database, user: User): void {
  user.clockedIn = false;
  const open = db.attendance.find((item) => item.userId === user.id && !item.clockOutAt);
  if (open) open.clockOutAt = nowStamp();
}

function openWorkOrders(db: Database, userId: string): number {
  return db.workOrders.filter((item) => item.assigneeId === userId && (item.status === "READY" || item.status === "IN_PRODUCTION" || item.status === "PAUSED")).length;
}

function requireAccountChange(db: Database, user: User, next: { role: User["role"]; status: User["status"] }, actorId: string): void {
  const leavesRole = next.status !== "ACTIVE" || next.role !== user.role;
  if (!leavesRole) return;
  if (user.id === actorId) throw new Error("자기 계정의 역할과 상태는 바꿀 수 없습니다.");
  if (user.role === "SUPER_ADMIN" && user.status === "ACTIVE") {
    const others = db.users.filter((item) => item.id !== user.id && item.role === "SUPER_ADMIN" && item.status === "ACTIVE");
    if (others.length === 0) throw new Error("활성 최고 관리자가 최소 1명 있어야 합니다.");
  }
  if (user.role === "PRODUCTION_MANAGER" && openWorkOrders(db, user.id) > 0) {
    throw new Error(`배정된 작업지시 ${openWorkOrders(db, user.id)}건을 다른 현장 관리자에게 옮긴 뒤에 바꿀 수 있습니다.`);
  }
}

export function saveUser(input: UserInput, actorId: string): string {
  const loginId = input.loginId.trim();
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const department = input.department.trim();
  if (!/^[a-z0-9._-]{3,20}$/i.test(loginId)) throw new Error("아이디는 영문·숫자 3~20자입니다.");
  if (!name) throw new Error("이름을 입력하세요.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("이메일 형식이 올바르지 않습니다.");
  if (!department) throw new Error("부서를 입력하세요.");
  if (input.password && input.password.length < 8) throw new Error("비밀번호는 8자 이상입니다.");
  let savedId = input.id ?? "";
  updateDb((db) => {
    if (db.users.some((user) => user.loginId === loginId && user.id !== input.id)) throw new Error("같은 아이디가 있습니다. 삭제된 계정의 아이디도 다시 쓸 수 없습니다.");
    if (db.users.some((user) => user.email === email && user.id !== input.id && user.status !== "DELETED")) throw new Error("같은 이메일을 쓰는 계정이 있습니다.");
    if (input.id) {
      const user = db.users.find((item) => item.id === input.id);
      if (!user || user.status === "DELETED") throw new Error("계정을 찾을 수 없습니다.");
      requireAccountChange(db, user, input, actorId);
      if (input.password) user.password = input.password;
      user.name = name;
      user.email = email;
      user.department = department;
      user.role = input.role;
      user.status = input.status;
      if (user.status !== "ACTIVE" || user.role !== "PRODUCTION_MANAGER") endShift(db, user);
      return;
    }
    if (!input.password) throw new Error("초기 비밀번호를 입력하세요.");
    const lastNo = Math.max(0, ...db.users.map((user) => Number(user.accountNo.slice(3)) || 0));
    savedId = crypto.randomUUID();
    db.users.push({
      id: savedId,
      accountNo: `AC-${String(lastNo + 1).padStart(4, "0")}`,
      loginId,
      password: input.password,
      name,
      email,
      department,
      role: input.role,
      status: input.status,
      clockedIn: false,
      createdAt: nowStamp(),
      lastLoginAt: null,
    });
  });
  return savedId;
}

export function setUserStatus(userId: string, status: "ACTIVE" | "INACTIVE", actorId: string): void {
  updateDb((db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user || user.status === "DELETED") throw new Error("계정을 찾을 수 없습니다.");
    requireAccountChange(db, user, { role: user.role, status }, actorId);
    user.status = status;
    if (status !== "ACTIVE") endShift(db, user);
  });
}

export function deleteUser(userId: string, actorId: string): void {
  updateDb((db) => {
    const user = db.users.find((item) => item.id === userId);
    if (!user || user.status === "DELETED") throw new Error("계정을 찾을 수 없습니다.");
    requireAccountChange(db, user, { role: user.role, status: "DELETED" }, actorId);
    user.status = "DELETED";
    endShift(db, user);
  });
}

export function saveHoliday(date: string, name: string): void {
  updateDb((db) => {
    if (db.holidays.some((holiday) => holiday.date === date)) throw new Error("이미 등록된 날짜입니다.");
    db.holidays.push({ id: crypto.randomUUID(), date, name });
    db.holidays.sort((left, right) => left.date.localeCompare(right.date));
  });
}

export function deleteHoliday(holidayId: string): void {
  updateDb((db) => {
    db.holidays = db.holidays.filter((holiday) => holiday.id !== holidayId);
  });
}

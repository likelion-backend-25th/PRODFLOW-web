import { readDb, updateDb } from "@/lib/db.ts";
import { nowStamp, todayISO } from "@/lib/dates.ts";
import { depositTarget, digitsOnly, orderQuantity, orderTotal, paymentStatusOf, productKey } from "@/lib/money.ts";
import { scheduleQuantity, splitQuantityByLines } from "@/lib/schedule.ts";
import type { Database, LineStatus, NotifyChannel, Order, OrderLine, OrderStatus, Role, User, WorkOrder } from "@/types/domain.ts";

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

function applySchedule(order: Order, db: Database, fromDate: string, requestedDueDate: string, acceptLaterDue: boolean, actor: Actor): void {
  const holidays = db.holidays.map((holiday) => holiday.date);
  const schedule = scheduleQuantity(orderQuantity(order.lines), fromDate, db.lines, holidays, db.orders, order.id);
  if (requestedDueDate < schedule.earliestDueDate && !acceptLaterDue) {
    throw new DueDateError(schedule.earliestDueDate);
  }
  order.plannedStartDate = schedule.plannedStartDate;
  order.plannedEndDate = schedule.plannedEndDate;
  order.allocations = schedule.allocations;
  order.requestedDueDate = acceptLaterDue ? schedule.earliestDueDate : requestedDueDate;
  order.dueDate = order.requestedDueDate;
  if (order.coveredQuantity > 0) rebuildReadyWorkOrders(db, order, actor);
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

function occupyingWorkOrders(db: Database, orderId: string): WorkOrder[] {
  return db.workOrders.filter(
    (item) => item.status !== "CANCELLED" && item.lineId && !(item.orderId === orderId && item.status === "READY"),
  );
}

function rebuildReadyWorkOrders(db: Database, order: Order, actor: Actor): void {
  if (order.coveredQuantity <= 0) return;
  const locked = orderWorkOrders(db, order.id).filter((item) => item.status !== "READY");
  const lockedQty = locked.reduce((sum, item) => sum + item.quantity, 0);
  const readyQty = order.coveredQuantity - lockedQty;
  if (readyQty < 0) throw new Error("이미 생산 중인 수량보다 줄일 수 없습니다.");
  for (const item of db.workOrders) {
    if (item.orderId === order.id && item.status === "READY") item.status = "CANCELLED";
  }
  if (readyQty === 0) return;
  const holidays = db.holidays.map((holiday) => holiday.date);
  const chunks = splitQuantityByLines(
    order.allocations,
    readyQty,
    db.lines,
    holidays,
    occupyingWorkOrders(db, order.id),
    locked,
  );
  const issuedAt = nowStamp();
  for (const chunk of chunks) {
    const id = crypto.randomUUID();
    db.workOrders.unshift({
      id,
      orderId: order.id,
      status: "READY",
      assigneeId: null,
      lineId: chunk.lineId,
      quantity: chunk.quantity,
      allocations: chunk.allocations,
      issuedAt,
      plannedStartDate: chunk.plannedStartDate,
      plannedEndDate: chunk.plannedEndDate,
      startedAt: null,
      completedAt: null,
    });
    pushHistory(db, "WORK_ORDER", id, "NONE", "READY", actor);
  }
}

function syncCoveredQuantity(db: Database, order: Order, actor: Actor): void {
  const totalQty = orderQuantity(order.lines);
  const previous = order.coveredQuantity;
  const covered = order.paidAmount >= depositTarget(orderTotal(order.lines)) ? totalQty : order.coveredQuantity;
  order.coveredQuantity = Math.min(covered, totalQty);
  if (order.coveredQuantity > 0 && order.coveredQuantity !== previous) rebuildReadyWorkOrders(db, order, actor);
}

function lineCandidates(db: Database): string[] {
  const held = new Set(
    db.workOrders.filter((item) => item.lineId && (item.status === "IN_PRODUCTION" || item.status === "PAUSED")).map((item) => item.lineId as string),
  );
  return db.lines.filter((line) => line.status === "AVAILABLE" && !held.has(line.id)).map((line) => line.id);
}

export function previewSchedule(quantity: number, ignoreOrderId?: string): { earliestDueDate: string; plannedStartDate: string; plannedEndDate: string } {
  const db = readDb();
  const holidays = db.holidays.map((holiday) => holiday.date);
  const fromDate = ignoreOrderId ? scheduleFrom(db, ignoreOrderId) : todayISO();
  return scheduleQuantity(quantity, fromDate, db.lines, holidays, db.orders, ignoreOrderId);
}

function scheduleFrom(db: Database, orderId: string): string {
  const order = db.orders.find((item) => item.id === orderId);
  if (!order) return todayISO();
  return order.plannedStartDate > todayISO() ? order.plannedStartDate : todayISO();
}

export function createOrder(input: {
  clientId: string;
  lines: Array<Omit<OrderLine, "id">>;
  requestedDueDate: string;
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
  let createdId = "";
  updateDb((db) => {
    const order: Order = {
      id: crypto.randomUUID(),
      orderNo: `PF-${todayISO().slice(0, 4)}-${String(db.orders.length + 1).padStart(3, "0")}`,
      clientId: input.clientId,
      lines: input.lines.map((item) => ({ ...item, id: crypto.randomUUID() })),
      requestedDueDate: input.requestedDueDate,
      dueDate: input.requestedDueDate,
      plannedStartDate: todayISO(),
      plannedEndDate: todayISO(),
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
    applySchedule(order, db, todayISO(), input.requestedDueDate, false, input.actor);
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
    syncCoveredQuantity(db, order, actor);
    assignOne(db);
  });
}

function productLabel(db: Database, productId: string): string {
  const product = db.products.find((item) => item.id === productId);
  return product ? `${product.productName} ${product.modelName}` : "품목";
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
    if (["PACKING", "PACKED", "SHIPPING", "COMPLETED", "CANCELLED"].includes(order.status)) {
      throw new Error("포장 이후에는 수량을 바꿀 수 없습니다.");
    }
    const changes: string[] = [];
    order.lines.forEach((line) => {
      const next = quantities[line.id];
      if (next === undefined || next === line.quantity) return;
      if (!Number.isInteger(next) || next <= 0) throw new Error("수량은 1개 이상입니다.");
      changes.push(`${productLabel(db, line.productId)} 수량 ${line.quantity.toLocaleString("ko-KR")} → ${next.toLocaleString("ko-KR")}개`);
      line.quantity = next;
    });
    if (changes.length === 0) throw new Error("바뀐 수량이 없습니다.");
    const previousDue = order.dueDate;
    const fromDate = order.plannedStartDate > todayISO() ? order.plannedStartDate : todayISO();
    applySchedule(order, db, fromDate, order.dueDate, acceptLaterDue, actor);
    refreshPayment(order);
    syncCoveredQuantity(db, order, actor);
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

export function cancelOrder(orderId: string, reason: string, actor: Actor): void {
  const note = `취소 사유: ${requireReason(reason)}`;
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    if (order.status !== "WAITING" || order.paidAmount > 0) throw new Error("입금 전 대기 수주만 취소할 수 있습니다.");
    order.allocations = [];
    setOrderStatus(db, order, "CANCELLED", actor, note);
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

export function shipOrder(orderId: string, carrier: string, trackingNo: string, actor: Actor): void {
  updateDb((db) => {
    const order = requireOrder(db, orderId);
    // 잔금은 거래처가 배송 완료 후 물건을 확인하고 입금하므로 출고 조건에 넣지 않는다.
    if (order.status !== "PACKED") throw new Error("포장완료인 수주만 출고할 수 있습니다.");
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

export function saveClient(input: {
  id?: string;
  businessNumber: string;
  companyName: string;
  representative: string;
  address: string;
  phone: string;
  contactName: string;
  contactMobile: string;
  taxEmail: string;
}): void {
  const businessNumber = digitsOnly(input.businessNumber);
  if (businessNumber.length !== 10) throw new Error("사업자등록번호는 숫자 10자리입니다.");
  updateDb((db) => {
    const duplicate = db.clients.find((client) => client.businessNumber === businessNumber && client.id !== input.id);
    if (duplicate) throw new Error("같은 사업자등록번호의 거래처가 있습니다.");
    if (input.id) {
      const client = db.clients.find((item) => item.id === input.id);
      if (!client) throw new Error("거래처를 찾을 수 없습니다.");
      Object.assign(client, { ...input, businessNumber });
      return;
    }
    db.clients.unshift({ ...input, id: crypto.randomUUID(), businessNumber });
  });
}

export function importClients(rows: Array<Omit<Parameters<typeof saveClient>[0], "id">>): { created: number; errors: string[] } {
  const errors: string[] = [];
  let created = 0;
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const businessNumber = digitsOnly(row.businessNumber);
    const lineNo = index + 2;
    if (seen.has(businessNumber)) {
      errors.push(`${lineNo}행: 파일 안에서 사업자등록번호가 겹칩니다.`);
      return;
    }
    seen.add(businessNumber);
    try {
      saveClient(row);
      created += 1;
    } catch (error: unknown) {
      errors.push(`${lineNo}행: ${error instanceof Error ? error.message : "등록하지 못했습니다."}`);
    }
  });
  return { created, errors };
}

export function saveProduct(input: {
  id?: string;
  productName: string;
  modelName: string;
  description: string;
  unitPrice: number;
  designImageUrl: string;
  actorName: string;
}): string {
  if (!input.productName.trim() || !input.modelName.trim()) throw new Error("제품명과 모델명을 입력하세요.");
  if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0) throw new Error("단가를 확인하세요.");
  let savedId = input.id ?? "";
  updateDb((db) => {
    const key = productKey(input.productName, input.modelName);
    const duplicate = db.products.find((product) => productKey(product.productName, product.modelName) === key && product.id !== input.id);
    if (duplicate) throw new Error("같은 제품명과 모델명의 품목이 있습니다.");
    if (input.id) {
      const product = db.products.find((item) => item.id === input.id);
      if (!product) throw new Error("품목을 찾을 수 없습니다.");
      product.productName = input.productName.trim();
      product.modelName = input.modelName.trim();
      product.description = input.description;
      product.unitPrice = input.unitPrice;
      if (input.designImageUrl) product.designImageUrl = input.designImageUrl;
      product.updatedAt = nowStamp();
      return;
    }
    savedId = crypto.randomUUID();
    db.products.unshift({
      id: savedId,
      productName: input.productName.trim(),
      modelName: input.modelName.trim(),
      description: input.description,
      unitPrice: input.unitPrice,
      designImageUrl: input.designImageUrl,
      createdAt: nowStamp(),
      updatedAt: nowStamp(),
      createdByName: input.actorName,
    });
  });
  return savedId;
}

export function saveLine(input: { id?: string; name: string; dailyCapacity: number }): void {
  updateDb((db) => {
    if (input.id) {
      const line = db.lines.find((item) => item.id === input.id);
      if (!line) throw new Error("라인을 찾을 수 없습니다.");
      line.name = input.name;
      line.dailyCapacity = input.dailyCapacity;
      return;
    }
    db.lines.push({ id: crypto.randomUUID(), name: input.name, dailyCapacity: input.dailyCapacity, status: "AVAILABLE" });
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

import { readDb, updateDb } from "@/lib/db.ts";
import { nowStamp, todayISO } from "@/lib/dates.ts";
import { depositTarget, digitsOnly, orderQuantity, orderTotal, paymentStatusOf, productKey } from "@/lib/money.ts";
import { allocateProductItems, capacityUntil, mergeAllocations, packJobs, splitQuantityByLines } from "@/lib/schedule.ts";
export class DueDateError extends Error {
    earliestDue;
    constructor(earliestDue) {
        super(`희망 납기일이 가장 빠른 납기일 ${earliestDue}보다 이릅니다.`);
        this.earliestDue = earliestDue;
    }
}
function requireOrder(db, orderId) {
    const order = db.orders.find((item) => item.id === orderId);
    if (!order)
        throw new Error("수주를 찾을 수 없습니다.");
    return order;
}
function requireWorkOrder(db, workOrderId) {
    const workOrder = db.workOrders.find((item) => item.id === workOrderId);
    if (!workOrder)
        throw new Error("작업지시를 찾을 수 없습니다.");
    return workOrder;
}
function pushHistory(db, entity, entityId, fromStatus, toStatus, actor, note) {
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
function setOrderStatus(db, order, status, actor, note) {
    if (order.status === status)
        return;
    pushHistory(db, "ORDER", order.id, order.status, status, actor, note);
    order.status = status;
}
function logOrderChange(db, order, actor, note) {
    pushHistory(db, "ORDER", order.id, order.status, order.status, actor, note);
}
function requireReason(reason) {
    const trimmed = reason.trim();
    if (trimmed.length < 2)
        throw new Error("사유를 2자 이상 입력하세요.");
    return trimmed;
}
function refreshPayment(order) {
    order.paymentStatus = paymentStatusOf(order.paidAmount, orderTotal(order.lines));
}
function byCreated(left, right) {
    return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}
function lockedWorkOrders(db, orderId) {
    return orderWorkOrders(db, orderId).filter((item) => item.status !== "READY");
}
function lockedAllocations(db, orderId) {
    return mergeAllocations(lockedWorkOrders(db, orderId).flatMap((item) => item.allocations ?? []));
}
function lockedQuantity(db, orderId) {
    return lockedWorkOrders(db, orderId).reduce((sum, item) => sum + item.quantity, 0);
}
function applyPacked(order, packed, locked) {
    const allocations = mergeAllocations([...(locked ?? []), ...(packed?.allocations ?? [])]);
    order.allocations = allocations;
    order.plannedStartDate = allocations[0]?.date ?? order.plannedStartDate;
    order.plannedEndDate = allocations.at(-1)?.date ?? order.plannedEndDate;
}
function floorOccupying(db) {
    return db.orders
        .filter((order) => order.status === "IN_PRODUCTION" || order.status === "ON_HOLD")
        .map((order) => ({
        id: `${order.id}-locked`,
        status: order.status,
        allocations: lockedAllocations(db, order.id),
    }));
}
function packNotBefore(order, today) {
    if (order.status !== "WAITING" || !order.depositDueDate || order.depositDueDate <= today)
        return undefined;
    return order.depositDueDate;
}
function queueJobs(db, ignoreOrderId, overrideQuantity) {
    const today = todayISO();
    const qtyOf = (order) => {
        if (ignoreOrderId && order.id === ignoreOrderId) {
            if (order.status === "IN_PRODUCTION" || order.status === "ON_HOLD")
                return Math.max(0, (overrideQuantity ?? 0) - lockedQuantity(db, order.id));
            return overrideQuantity ?? 0;
        }
        if (order.status === "IN_PRODUCTION" || order.status === "ON_HOLD")
            return Math.max(0, order.coveredQuantity - lockedQuantity(db, order.id));
        return orderQuantity(order.lines);
    };
    return [
        ...db.orders.filter((order) => order.status === "IN_PRODUCTION" || order.status === "ON_HOLD").sort(byCreated),
        ...db.orders.filter((order) => order.status === "WAITING" || order.status === "CONFIRMED").sort(byCreated),
    ].map((order) => ({ id: order.id, quantity: qtyOf(order), notBefore: packNotBefore(order, today) }));
}
function rescheduleFactory(db, actor, focus) {
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
        .map((order) => ({ order, quantity: orderQuantity(order.lines), locked: [] }));
    const jobs = [...floor, ...queued];
    const packed = packJobs(jobs.map((job) => ({ id: job.order.id, quantity: job.quantity, notBefore: packNotBefore(job.order, fromDate) })), fromDate, db.lines, holidays, occupying);
    if (focus) {
        const result = packed.get(focus.orderId);
        if (result && focus.requestedDueDate < result.earliestDueDate && !focus.acceptLaterDue) {
            throw new DueDateError(result.earliestDueDate);
        }
    }
    const pendingReady = new Set(jobs.filter((job) => job.order.coveredQuantity > 0).map((job) => job.order.id));
    for (const job of jobs) {
        applyPacked(job.order, packed.get(job.order.id), job.locked);
        if (focus && job.order.id === focus.orderId) {
            const result = packed.get(job.order.id);
            const earliest = result?.earliestDueDate ?? job.order.dueDate;
            job.order.requestedDueDate = focus.acceptLaterDue ? earliest : focus.requestedDueDate;
            job.order.dueDate = job.order.requestedDueDate;
        }
        if (job.order.coveredQuantity > 0) {
            rebuildReadyWorkOrders(db, job.order, actor, pendingReady);
            pendingReady.delete(job.order.id);
        }
    }
    assignOne(db);
}
function orderWorkOrders(db, orderId) {
    return db.workOrders.filter((item) => item.orderId === orderId && item.status !== "CANCELLED");
}
function syncOrderFromWorkOrders(db, order, actor, note) {
    const active = orderWorkOrders(db, order.id);
    order.producedQuantity = active.filter((item) => item.status === "COMPLETED").reduce((sum, item) => sum + item.quantity, 0);
    if (active.length === 0)
        return;
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
function assignOne(db) {
    const busy = new Set(db.workOrders.filter((item) => item.status === "IN_PRODUCTION" && item.assigneeId).map((item) => item.assigneeId));
    const candidates = db.users.filter((user) => user.role === "PRODUCTION_MANAGER" && user.status === "ACTIVE" && user.clockedIn && !busy.has(user.id));
    if (candidates.length === 0)
        return;
    const assignable = new Set(["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"]);
    const unstarted = (userId) => db.workOrders.filter((item) => item.assigneeId === userId && item.status === "READY").reduce((sum, item) => sum + item.quantity, 0);
    let guard = 0;
    while (guard < 80) {
        const open = db.workOrders
            .filter((item) => item.status === "READY" && !item.assigneeId)
            .map((item) => ({ workOrder: item, order: db.orders.find((order) => order.id === item.orderId) }))
            .filter((item) => Boolean(item.order && assignable.has(item.order.status)))
            .sort((left, right) => left.order.dueDate.localeCompare(right.order.dueDate));
        const target = open[0];
        if (!target)
            return;
        candidates.sort((left, right) => unstarted(left.id) - unstarted(right.id));
        target.workOrder.assigneeId = candidates[0]?.id ?? null;
        if (!target.workOrder.assigneeId)
            return;
        guard += 1;
    }
}
function occupiesLineCapacity(status) {
    return status === "READY" || status === "IN_PRODUCTION" || status === "PAUSED";
}
function occupyingWorkOrders(db, orderId, pendingReady) {
    return db.workOrders.filter((item) => {
        if (!item.lineId || !occupiesLineCapacity(item.status))
            return false;
        if (item.orderId === orderId && item.status === "READY")
            return false;
        if (item.status === "READY" && pendingReady.has(item.orderId))
            return false;
        return true;
    });
}
function rebuildReadyWorkOrders(db, order, actor, pendingReady) {
    if (order.coveredQuantity <= 0)
        return;
    const locked = orderWorkOrders(db, order.id).filter((item) => item.status !== "READY");
    const lockedQty = locked.reduce((sum, item) => sum + item.quantity, 0);
    const readyQty = order.coveredQuantity - lockedQty;
    if (readyQty < 0)
        throw new Error("이미 생산 중인 수량보다 줄일 수 없습니다.");
    const existingReady = db.workOrders.filter((item) => item.orderId === order.id && item.status === "READY");
    if (readyQty === 0) {
        for (const item of existingReady)
            item.status = "CANCELLED";
        return;
    }
    const holidays = db.holidays.map((holiday) => holiday.date);
    const chunks = splitQuantityByLines(order.allocations, readyQty, db.lines, holidays, occupyingWorkOrders(db, order.id, pendingReady), locked);
    if (locked.some((item) => !item.items?.length)) {
        const lockedPacks = allocateProductItems(order.lines, locked.map((item) => item.quantity));
        locked.forEach((item, index) => {
            item.items = lockedPacks[index] ?? [];
        });
    }
    const packs = allocateProductItems(order.lines, chunks.map((chunk) => chunk.quantity), locked.flatMap((item) => item.items));
    const used = new Set();
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
        if (!used.has(item.id))
            item.status = "CANCELLED";
    }
}
function syncCoveredQuantity(order) {
    const totalQty = orderQuantity(order.lines);
    const covered = order.paidAmount >= depositTarget(orderTotal(order.lines)) ? totalQty : order.coveredQuantity;
    order.coveredQuantity = Math.min(covered, totalQty);
}
function lineCandidates(db) {
    const held = new Set(db.workOrders.filter((item) => item.lineId && (item.status === "IN_PRODUCTION" || item.status === "PAUSED")).map((item) => item.lineId));
    return db.lines.filter((line) => line.status === "AVAILABLE" && !held.has(line.id)).map((line) => line.id);
}
export function previewSchedule(quantity, ignoreOrderId, notBefore) {
    const db = readDb();
    const holidays = db.holidays.map((holiday) => holiday.date);
    const jobs = queueJobs(db, ignoreOrderId, quantity);
    if (!ignoreOrderId)
        jobs.push({ id: "preview-new", quantity, notBefore });
    const packed = packJobs(jobs, todayISO(), db.lines, holidays, floorOccupying(db));
    const result = packed.get(ignoreOrderId ?? "preview-new");
    if (!result)
        throw new Error("가용 생산량 안에서 완료 예정일을 계산하지 못했습니다.");
    return result;
}
export function previewCapacity(dueDate, ignoreOrderId, notBefore) {
    const db = readDb();
    const holidays = db.holidays.map((holiday) => holiday.date);
    const occupying = floorOccupying(db);
    const jobs = queueJobs(db, ignoreOrderId);
    const today = todayISO();
    const fromDate = notBefore && notBefore > today ? notBefore : today;
    const packed = packJobs(jobs, today, db.lines, holidays, occupying);
    const placed = [
        ...occupying,
        ...jobs.map((job) => ({
            id: job.id,
            status: "CONFIRMED",
            allocations: packed.get(job.id)?.allocations ?? [],
        })),
    ];
    return capacityUntil(dueDate, fromDate, db.lines, holidays, placed);
}
function normalizeCompanyName(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}
export function ensureClient(db, input) {
    const companyName = input.companyName.trim().replace(/\s+/g, " ");
    if (!companyName)
        throw new Error("회사명을 입력하세요.");
    const existing = db.clients.find((client) => normalizeCompanyName(client.companyName) === normalizeCompanyName(companyName));
    if (existing)
        return existing.id;
    const phone = input.phone.trim();
    const contactName = input.contactName.trim();
    const address = input.address.trim();
    const taxEmail = input.taxEmail.trim();
    if (!contactName)
        throw new Error("담당자명을 입력하세요.");
    if (digitsOnly(phone).length < 9)
        throw new Error("거래처 연락처를 확인하세요.");
    if (!taxEmail.includes("@"))
        throw new Error("이메일을 확인하세요.");
    if (!address)
        throw new Error("회사 주소를 입력하세요.");
    const id = crypto.randomUUID();
    db.clients.unshift({
        id,
        businessNumber: "",
        companyName,
        representative: contactName,
        address,
        phone,
        contactName,
        contactMobile: phone,
        taxEmail,
    });
    return id;
}
function nextQuotationNo(db) {
    const year = todayISO().slice(0, 4);
    const sequence = db.quotations.filter((item) => item.quotationNo.startsWith(`QT-${year}-`)).length + 1;
    return `QT-${year}-${String(sequence).padStart(3, "0")}`;
}
function planFromPreview(quantity, requestedDueDate) {
    const preview = previewSchedule(quantity, undefined, todayISO());
    const estimatedDueDate = requestedDueDate >= preview.earliestDueDate ? requestedDueDate : preview.earliestDueDate;
    return { estimatedDueDate, plannedStartDate: preview.plannedStartDate, plannedEndDate: preview.plannedEndDate };
}
export function createQuotation(input) {
    if (!input.clientId)
        throw new Error("거래처를 선택하세요.");
    if (input.lines.length === 0)
        throw new Error("품목 줄을 1개 이상 입력하세요.");
    if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length)
        throw new Error("같은 품목이 두 줄 이상 있습니다. 수량을 한 줄로 합치세요.");
    if (!input.requestedDueDate)
        throw new Error("희망 납기일을 선택하세요.");
    if (!input.validUntil || input.validUntil < todayISO())
        throw new Error("견적 유효기간은 오늘 이후로 선택하세요.");
    const quantity = input.lines.reduce((sum, line) => sum + line.quantity, 0);
    const schedule = planFromPreview(quantity, input.requestedDueDate);
    let createdId = "";
    updateDb((db) => {
        if (!db.clients.some((client) => client.id === input.clientId))
            throw new Error("거래처를 찾을 수 없습니다.");
        const now = nowStamp();
        const plan = {
            id: crypto.randomUUID(),
            status: "ACTIVE",
            plannedStartDate: schedule.plannedStartDate,
            plannedEndDate: schedule.plannedEndDate,
            estimatedDueDate: schedule.estimatedDueDate,
            quantity,
            createdAt: now,
        };
        const quotation = {
            id: crypto.randomUUID(),
            quotationNo: nextQuotationNo(db),
            clientId: input.clientId,
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
    return readDb().quotations.find((item) => item.id === createdId);
}
export function setQuotationStatus(quotationId, status, actor) {
    updateDb((db) => {
        const quotation = db.quotations.find((item) => item.id === quotationId);
        if (!quotation)
            throw new Error("견적서를 찾을 수 없습니다.");
        if (quotation.status !== "SENT")
            throw new Error("발송된 견적만 승인, 거절, 취소할 수 있습니다.");
        if (db.orders.some((order) => order.quotationId === quotation.id))
            throw new Error("이미 수주가 등록된 견적입니다.");
        quotation.status = status;
        quotation.updatedAt = nowStamp();
        if (status !== "APPROVED") {
            quotation.plans.forEach((plan) => {
                if (plan.status === "ACTIVE")
                    plan.status = "CANCELLED";
            });
        }
        void actor;
    });
}
export function recalculateQuotation(quotationId, requestedDueDate) {
    if (!requestedDueDate)
        throw new Error("희망 납기일을 선택하세요.");
    const current = readDb().quotations.find((item) => item.id === quotationId);
    if (!current)
        throw new Error("견적서를 찾을 수 없습니다.");
    if (current.status !== "SENT")
        throw new Error("발송 후 승인 전인 견적만 재산정할 수 있습니다.");
    const quantity = current.lines.reduce((sum, line) => sum + line.quantity, 0);
    const schedule = planFromPreview(quantity, requestedDueDate);
    updateDb((db) => {
        const quotation = db.quotations.find((item) => item.id === quotationId);
        if (!quotation || quotation.status !== "SENT")
            throw new Error("발송 후 승인 전인 견적만 재산정할 수 있습니다.");
        quotation.plans.forEach((plan) => {
            if (plan.status === "ACTIVE")
                plan.status = "RECALCULATED";
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
export function createOrder(input) {
    if (input.lines.length === 0)
        throw new Error("품목 줄을 1개 이상 입력하세요.");
    if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length)
        throw new Error("같은 품목이 두 줄 이상 있습니다. 수량을 한 줄로 합치세요.");
    const receiverPhone = input.receiverPhone.trim();
    if (digitsOnly(receiverPhone).length < 9)
        throw new Error("배송 수신 연락처를 확인하세요.");
    if (!input.depositDueDate || input.depositDueDate < todayISO())
        throw new Error("계약금 입금 마감일은 오늘 이후로 선택하세요.");
    let createdId = "";
    updateDb((db) => {
        if (input.quotationId && db.orders.some((order) => order.quotationId === input.quotationId && order.status !== "CANCELLED")) {
            throw new Error("이 견적으로 등록된 수주가 이미 있습니다.");
        }
        const existing = input.clientId ? db.clients.find((item) => item.id === input.clientId) : undefined;
        const clientId = existing?.id ?? (input.client ? ensureClient(db, input.client) : "");
        if (!clientId)
            throw new Error("거래처를 입력하세요.");
        const order = {
            id: crypto.randomUUID(),
            orderNo: `PF-${todayISO().slice(0, 4)}-${String(db.orders.length + 1).padStart(3, "0")}`,
            quotationId: input.quotationId,
            clientId,
            lines: input.lines.map((item) => ({ ...item, id: crypto.randomUUID() })),
            requestedDueDate: input.requestedDueDate,
            dueDate: input.requestedDueDate,
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
        rescheduleFactory(db, input.actor, { orderId: order.id, requestedDueDate: input.requestedDueDate, acceptLaterDue: false });
        pushHistory(db, "ORDER", order.id, "NONE", "WAITING", input.actor);
        createdId = order.id;
    });
    return readDb().orders.find((order) => order.id === createdId);
}
export function recordPayment(orderId, amount, actor) {
    if (amount <= 0)
        throw new Error("입금 금액을 입력하세요.");
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status === "CANCELLED")
            throw new Error("취소된 수주에는 입금할 수 없습니다.");
        const total = orderTotal(order.lines);
        if (order.paidAmount + amount > total)
            throw new Error(`남은 금액 ${(total - order.paidAmount).toLocaleString("ko-KR")}원보다 많이 입금할 수 없습니다.`);
        order.paidAmount += amount;
        refreshPayment(order);
        const note = `입금 ${amount.toLocaleString("ko-KR")}원 (누적 ${order.paidAmount.toLocaleString("ko-KR")}원)`;
        const wasWaiting = order.status === "WAITING";
        if (!wasWaiting || order.paidAmount < depositTarget(total))
            logOrderChange(db, order, actor, note);
        if (wasWaiting && order.paidAmount >= depositTarget(total)) {
            setOrderStatus(db, order, "CONFIRMED", actor, `${note} · 선금 확인`);
        }
        const previousCovered = order.coveredQuantity;
        syncCoveredQuantity(order);
        if ((wasWaiting && order.status === "CONFIRMED") || order.coveredQuantity !== previousCovered)
            rescheduleFactory(db, actor);
        assignOne(db);
    });
}
function productLabel(db, productId) {
    const product = db.products.find((item) => item.id === productId);
    return product ? [product.productName, product.modelName].filter((part) => part.trim()).join(" ") : "품목";
}
export function updateOrderPrices(orderId, prices, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status !== "WAITING")
            throw new Error("단가는 대기 수주에서만 수정합니다.");
        const changes = [];
        order.lines.forEach((line) => {
            const next = prices[line.id];
            if (next === undefined || next === line.unitPrice)
                return;
            if (!Number.isFinite(next) || next < 0)
                throw new Error("단가는 0원 이상입니다.");
            changes.push(`${productLabel(db, line.productId)} 단가 ${line.unitPrice.toLocaleString("ko-KR")} → ${next.toLocaleString("ko-KR")}원`);
            line.unitPrice = next;
        });
        if (changes.length === 0)
            throw new Error("바뀐 단가가 없습니다.");
        refreshPayment(order);
        logOrderChange(db, order, actor, changes.join(", "));
    });
}
export function updateOrderQuantities(orderId, quantities, acceptLaterDue, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (["PACKING", "PACKED", "READY_TO_SHIP", "SHIPPING", "COMPLETED", "CANCELLED"].includes(order.status)) {
            throw new Error("포장 이후에는 수량을 바꿀 수 없습니다.");
        }
        const changes = [];
        order.lines.forEach((line) => {
            const next = quantities[line.id];
            if (next === undefined || next === line.quantity)
                return;
            if (!Number.isInteger(next) || next <= 0)
                throw new Error("수량은 1개 이상입니다.");
            changes.push(`${productLabel(db, line.productId)} 수량 ${line.quantity.toLocaleString("ko-KR")} → ${next.toLocaleString("ko-KR")}개`);
            line.quantity = next;
        });
        if (changes.length === 0)
            throw new Error("바뀐 수량이 없습니다.");
        const previousDue = order.dueDate;
        refreshPayment(order);
        syncCoveredQuantity(order);
        rescheduleFactory(db, actor, { orderId: order.id, requestedDueDate: order.dueDate, acceptLaterDue });
        assignOne(db);
        if (order.dueDate !== previousDue)
            changes.push(`납기 ${previousDue} → ${order.dueDate}`);
        logOrderChange(db, order, actor, changes.join(", "));
    });
}
export function updateShippingAddress(orderId, shippingAddress, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status === "SHIPPING" || order.status === "COMPLETED" || order.status === "CANCELLED") {
            throw new Error("배송이 시작된 수주의 배송지는 바꿀 수 없습니다.");
        }
        if (order.shippingAddress === shippingAddress)
            return;
        logOrderChange(db, order, actor, `배송지 ${order.shippingAddress} → ${shippingAddress}`);
        order.shippingAddress = shippingAddress;
    });
}
export function expireUnpaidOrders() {
    const today = todayISO();
    const current = readDb();
    const due = current.orders.filter((order) => order.status === "WAITING" && order.paidAmount === 0 && order.depositDueDate < today);
    if (due.length === 0)
        return 0;
    const actorUser = current.users.find((user) => user.role === "SUPER_ADMIN" && user.status === "ACTIVE");
    if (!actorUser)
        return 0;
    const actor = { id: actorUser.id, name: actorUser.name, role: actorUser.role };
    updateDb((db) => {
        let changed = false;
        for (const order of db.orders) {
            if (order.status !== "WAITING" || order.paidAmount > 0 || order.depositDueDate >= today)
                continue;
            order.allocations = [];
            setOrderStatus(db, order, "CANCELLED", actor, "계약금 입금 마감일이 지나 자동 취소");
            changed = true;
        }
        if (changed)
            rescheduleFactory(db, actor);
    });
    return due.length;
}
export function cancelOrder(orderId, reason, actor) {
    const note = `취소 사유: ${requireReason(reason)}`;
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status !== "WAITING" || order.paidAmount > 0)
            throw new Error("입금 전 대기 수주만 취소할 수 있습니다.");
        order.allocations = [];
        setOrderStatus(db, order, "CANCELLED", actor, note);
        rescheduleFactory(db, actor);
    });
}
export function clockIn(userId) {
    updateDb((db) => {
        const user = db.users.find((item) => item.id === userId);
        if (!user || user.status !== "ACTIVE" || user.role !== "PRODUCTION_MANAGER")
            throw new Error("활성 현장 관리자만 출근할 수 있습니다.");
        if (user.clockedIn)
            throw new Error("이미 출근 중입니다.");
        user.clockedIn = true;
        db.attendance.unshift({ id: crypto.randomUUID(), userId, clockInAt: nowStamp(), clockOutAt: null });
        assignOne(db);
    });
}
export function clockOut(userId) {
    updateDb((db) => {
        const user = db.users.find((item) => item.id === userId);
        if (!user || !user.clockedIn)
            throw new Error("출근 중이 아닙니다.");
        const running = db.workOrders.some((item) => item.assigneeId === userId && item.status === "IN_PRODUCTION");
        if (running)
            throw new Error("생산중인 작업을 완료하거나 일시정지한 뒤에 퇴근하세요.");
        endShift(db, user);
    });
}
export function startProduction(workOrderId, lineId, actor) {
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        const order = requireOrder(db, workOrder.orderId);
        if (workOrder.assigneeId !== actor.id)
            throw new Error("배정된 담당자만 생산을 시작할 수 있습니다.");
        if (workOrder.status !== "READY" || !["CONFIRMED", "IN_PRODUCTION", "ON_HOLD"].includes(order.status)) {
            throw new Error("생산 시작은 준비 상태 작업에서만 할 수 있습니다.");
        }
        if (!lineCandidates(db).includes(lineId))
            throw new Error("비어 있는 가동 가능 라인만 선택할 수 있습니다.");
        const line = db.lines.find((item) => item.id === lineId);
        if (!line)
            throw new Error("라인을 찾을 수 없습니다.");
        workOrder.lineId = lineId;
        workOrder.status = "IN_PRODUCTION";
        workOrder.startedAt = nowStamp();
        line.status = "RUNNING";
        setOrderStatus(db, order, "IN_PRODUCTION", actor);
        pushHistory(db, "WORK_ORDER", workOrder.id, "READY", "IN_PRODUCTION", actor);
    });
}
export function stopProduction(workOrderId, reason, actor) {
    const note = `중지 사유: ${requireReason(reason)}`;
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        const order = requireOrder(db, workOrder.orderId);
        if (workOrder.status !== "IN_PRODUCTION")
            throw new Error("생산중인 작업만 중지할 수 있습니다.");
        const line = db.lines.find((item) => item.id === workOrder.lineId);
        if (line)
            line.status = "AVAILABLE";
        workOrder.status = "READY";
        workOrder.startedAt = null;
        syncOrderFromWorkOrders(db, order, actor, note);
        pushHistory(db, "WORK_ORDER", workOrder.id, "IN_PRODUCTION", "READY", actor, note);
    });
}
export function holdProduction(workOrderId, reason, actor) {
    const note = `일시정지 사유: ${requireReason(reason)}`;
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        const order = requireOrder(db, workOrder.orderId);
        if (workOrder.status !== "IN_PRODUCTION")
            throw new Error("생산중인 작업만 보류할 수 있습니다.");
        workOrder.status = "PAUSED";
        syncOrderFromWorkOrders(db, order, actor, note);
        pushHistory(db, "WORK_ORDER", workOrder.id, "IN_PRODUCTION", "PAUSED", actor, note);
    });
}
export function resumeProduction(workOrderId, actor) {
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        const order = requireOrder(db, workOrder.orderId);
        if (workOrder.status !== "PAUSED")
            throw new Error("보류 중인 작업만 해제할 수 있습니다.");
        workOrder.status = "IN_PRODUCTION";
        syncOrderFromWorkOrders(db, order, actor);
        pushHistory(db, "WORK_ORDER", workOrder.id, "PAUSED", "IN_PRODUCTION", actor);
    });
}
export function completeProduction(workOrderId, actor) {
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        const order = requireOrder(db, workOrder.orderId);
        if (workOrder.status !== "IN_PRODUCTION")
            throw new Error("생산중인 작업만 완료할 수 있습니다.");
        const from = workOrder.status;
        workOrder.status = "COMPLETED";
        workOrder.completedAt = nowStamp();
        const line = db.lines.find((item) => item.id === workOrder.lineId);
        if (line && line.status === "RUNNING")
            line.status = "AVAILABLE";
        syncOrderFromWorkOrders(db, order, actor);
        pushHistory(db, "WORK_ORDER", workOrder.id, from, "COMPLETED", actor);
        rescheduleFactory(db, actor);
        assignOne(db);
    });
}
export function completePacking(orderId, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status !== "PACKING")
            throw new Error("포장중인 수주만 포장 완료할 수 있습니다.");
        setOrderStatus(db, order, "PACKED", actor);
    });
}
export function markReadyToShip(orderId, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status !== "PACKED")
            throw new Error("포장완료인 수주만 출고대기로 바꿀 수 있습니다.");
        setOrderStatus(db, order, "READY_TO_SHIP", actor);
    });
}
export function shipOrder(orderId, carrier, trackingNo, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        // 잔금은 거래처가 배송 완료 후 물건을 확인하고 입금하므로 출고 조건에 넣지 않는다.
        if (order.status !== "READY_TO_SHIP")
            throw new Error("출고대기인 수주만 출고할 수 있습니다.");
        if (!carrier.trim() || !trackingNo.trim())
            throw new Error("택배사와 운송장 번호를 입력하세요.");
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
export function completeDelivery(orderId, actor) {
    updateDb((db) => {
        const order = requireOrder(db, orderId);
        if (order.status !== "SHIPPING")
            throw new Error("배송중인 수주만 배송 완료할 수 있습니다.");
        order.completedAt = nowStamp();
        setOrderStatus(db, order, "COMPLETED", actor);
    });
}
export function reassign(workOrderId, assigneeId, actor) {
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        if (workOrder.status === "COMPLETED" || workOrder.status === "CANCELLED")
            throw new Error("끝난 작업지시의 담당자는 바꿀 수 없습니다.");
        const user = db.users.find((item) => item.id === assigneeId && item.role === "PRODUCTION_MANAGER" && item.status === "ACTIVE");
        if (!user)
            throw new Error("현장 관리자 계정만 담당자로 지정할 수 있습니다.");
        if (workOrder.status === "IN_PRODUCTION" && db.workOrders.some((item) => item.id !== workOrder.id && item.assigneeId === user.id && item.status === "IN_PRODUCTION")) {
            throw new Error(`${user.name}님은 이미 생산중인 작업이 있습니다.`);
        }
        const previous = db.users.find((item) => item.id === workOrder.assigneeId)?.name ?? "미배정";
        workOrder.assigneeId = user.id;
        pushHistory(db, "WORK_ORDER", workOrder.id, workOrder.status, workOrder.status, actor, `담당자 ${previous} → ${user.name}`);
    });
}
export function changeLine(workOrderId, lineId, actor) {
    updateDb((db) => {
        const workOrder = requireWorkOrder(db, workOrderId);
        if (workOrder.status !== "READY" && workOrder.status !== "IN_PRODUCTION" && workOrder.status !== "PAUSED") {
            throw new Error("준비·생산중·보류 중에서만 라인을 바꿀 수 있습니다.");
        }
        if (!lineCandidates(db).includes(lineId) && lineId !== workOrder.lineId)
            throw new Error("비어 있는 가동 가능 라인만 선택할 수 있습니다.");
        const previous = db.lines.find((item) => item.id === workOrder.lineId);
        const next = db.lines.find((item) => item.id === lineId);
        if (workOrder.status !== "READY") {
            if (previous)
                previous.status = "AVAILABLE";
            if (next)
                next.status = "RUNNING";
        }
        workOrder.lineId = lineId;
        pushHistory(db, "WORK_ORDER", workOrder.id, workOrder.status, workOrder.status, actor, `라인 ${previous?.name ?? "없음"} → ${next?.name ?? lineId}`);
    });
}
export function availableLineIds() {
    return lineCandidates(readDb());
}
export function saveClient(input) {
    const businessNumber = digitsOnly(input.businessNumber);
    if (businessNumber.length !== 10)
        throw new Error("사업자등록번호는 숫자 10자리입니다.");
    updateDb((db) => {
        const duplicate = db.clients.find((client) => client.businessNumber && client.businessNumber === businessNumber && client.id !== input.id);
        if (duplicate)
            throw new Error("같은 사업자등록번호의 거래처가 있습니다.");
        if (input.id) {
            const client = db.clients.find((item) => item.id === input.id);
            if (!client)
                throw new Error("거래처를 찾을 수 없습니다.");
            Object.assign(client, { ...input, businessNumber });
            return;
        }
        db.clients.unshift({ ...input, id: crypto.randomUUID(), businessNumber });
    });
}
export function importClients(rows) {
    const errors = [];
    let created = 0;
    const seen = new Set();
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
        }
        catch (error) {
            errors.push(`${lineNo}행: ${error instanceof Error ? error.message : "등록하지 못했습니다."}`);
        }
    });
    return { created, errors };
}
export function saveProduct(input) {
    if (!input.productName.trim())
        throw new Error("품목명을 입력하세요.");
    if (!Number.isFinite(input.unitPrice) || input.unitPrice < 0)
        throw new Error("단가를 확인하세요.");
    let savedId = input.id ?? "";
    updateDb((db) => {
        const key = productKey(input.productName, input.modelName);
        const duplicate = db.products.find((product) => productKey(product.productName, product.modelName) === key && product.id !== input.id);
        if (duplicate)
            throw new Error("같은 제품명과 모델명의 품목이 있습니다.");
        if (input.id) {
            const product = db.products.find((item) => item.id === input.id);
            if (!product)
                throw new Error("품목을 찾을 수 없습니다.");
            // 등록 화면은 품목명만 받는다. 이미 모델명이 있는 품목은 수정할 때 모델명을 비우지 않는다.
            if (product.modelName.trim() && !input.modelName.trim())
                throw new Error("모델명을 입력하세요.");
            product.productName = input.productName.trim();
            product.modelName = input.modelName.trim();
            product.description = input.description;
            product.unitPrice = input.unitPrice;
            if (input.designImageUrl)
                product.designImageUrl = input.designImageUrl;
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
export function saveLine(input) {
    updateDb((db) => {
        if (input.id) {
            const line = db.lines.find((item) => item.id === input.id);
            if (!line)
                throw new Error("라인을 찾을 수 없습니다.");
            line.name = input.name;
            line.dailyCapacity = input.dailyCapacity;
            return;
        }
        db.lines.push({ id: crypto.randomUUID(), name: input.name, dailyCapacity: input.dailyCapacity, status: "AVAILABLE" });
    });
}
export function saveLineCapacity(lineId, dailyCapacity, actor) {
    if (!Number.isInteger(dailyCapacity) || dailyCapacity <= 0)
        throw new Error("일 최대 생산량은 1개 이상 정수입니다.");
    updateDb((db) => {
        const line = db.lines.find((item) => item.id === lineId);
        if (!line)
            throw new Error("라인을 찾을 수 없습니다.");
        if (line.dailyCapacity === dailyCapacity)
            return;
        line.dailyCapacity = dailyCapacity;
        rescheduleFactory(db, actor);
    });
}
export function setLineStatus(lineId, status) {
    updateDb((db) => {
        const line = db.lines.find((item) => item.id === lineId);
        if (!line)
            throw new Error("라인을 찾을 수 없습니다.");
        const running = db.workOrders.some((item) => item.lineId === lineId && (item.status === "IN_PRODUCTION" || item.status === "PAUSED"));
        if (running && status !== "RUNNING")
            throw new Error("생산이 걸려 있는 라인은 다른 라인으로 옮긴 뒤에 상태를 바꿉니다.");
        line.status = status;
    });
}
function endShift(db, user) {
    user.clockedIn = false;
    const open = db.attendance.find((item) => item.userId === user.id && !item.clockOutAt);
    if (open)
        open.clockOutAt = nowStamp();
}
function openWorkOrders(db, userId) {
    return db.workOrders.filter((item) => item.assigneeId === userId && (item.status === "READY" || item.status === "IN_PRODUCTION" || item.status === "PAUSED")).length;
}
function requireAccountChange(db, user, next, actorId) {
    const leavesRole = next.status !== "ACTIVE" || next.role !== user.role;
    if (!leavesRole)
        return;
    if (user.id === actorId)
        throw new Error("자기 계정의 역할과 상태는 바꿀 수 없습니다.");
    if (user.role === "SUPER_ADMIN" && user.status === "ACTIVE") {
        const others = db.users.filter((item) => item.id !== user.id && item.role === "SUPER_ADMIN" && item.status === "ACTIVE");
        if (others.length === 0)
            throw new Error("활성 최고 관리자가 최소 1명 있어야 합니다.");
    }
    if (user.role === "PRODUCTION_MANAGER" && openWorkOrders(db, user.id) > 0) {
        throw new Error(`배정된 작업지시 ${openWorkOrders(db, user.id)}건을 다른 현장 관리자에게 옮긴 뒤에 바꿀 수 있습니다.`);
    }
}
export function saveUser(input, actorId) {
    const loginId = input.loginId.trim();
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const department = input.department.trim();
    if (!/^[a-z0-9._-]{3,20}$/i.test(loginId))
        throw new Error("아이디는 영문·숫자 3~20자입니다.");
    if (!name)
        throw new Error("이름을 입력하세요.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error("이메일 형식이 올바르지 않습니다.");
    if (!department)
        throw new Error("부서를 입력하세요.");
    if (input.password && input.password.length < 8)
        throw new Error("비밀번호는 8자 이상입니다.");
    let savedId = input.id ?? "";
    updateDb((db) => {
        if (db.users.some((user) => user.loginId === loginId && user.id !== input.id))
            throw new Error("같은 아이디가 있습니다. 삭제된 계정의 아이디도 다시 쓸 수 없습니다.");
        if (db.users.some((user) => user.email === email && user.id !== input.id && user.status !== "DELETED"))
            throw new Error("같은 이메일을 쓰는 계정이 있습니다.");
        if (input.id) {
            const user = db.users.find((item) => item.id === input.id);
            if (!user || user.status === "DELETED")
                throw new Error("계정을 찾을 수 없습니다.");
            requireAccountChange(db, user, input, actorId);
            if (input.password)
                user.password = input.password;
            user.name = name;
            user.email = email;
            user.department = department;
            user.role = input.role;
            user.status = input.status;
            if (user.status !== "ACTIVE" || user.role !== "PRODUCTION_MANAGER")
                endShift(db, user);
            return;
        }
        if (!input.password)
            throw new Error("초기 비밀번호를 입력하세요.");
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
export function setUserStatus(userId, status, actorId) {
    updateDb((db) => {
        const user = db.users.find((item) => item.id === userId);
        if (!user || user.status === "DELETED")
            throw new Error("계정을 찾을 수 없습니다.");
        requireAccountChange(db, user, { role: user.role, status }, actorId);
        user.status = status;
        if (status !== "ACTIVE")
            endShift(db, user);
    });
}
export function deleteUser(userId, actorId) {
    updateDb((db) => {
        const user = db.users.find((item) => item.id === userId);
        if (!user || user.status === "DELETED")
            throw new Error("계정을 찾을 수 없습니다.");
        requireAccountChange(db, user, { role: user.role, status: "DELETED" }, actorId);
        user.status = "DELETED";
        endShift(db, user);
    });
}
export function saveHoliday(date, name) {
    updateDb((db) => {
        if (db.holidays.some((holiday) => holiday.date === date))
            throw new Error("이미 등록된 날짜입니다.");
        db.holidays.push({ id: crypto.randomUUID(), date, name });
        db.holidays.sort((left, right) => left.date.localeCompare(right.date));
    });
}
export function deleteHoliday(holidayId) {
    updateDb((db) => {
        db.holidays = db.holidays.filter((holiday) => holiday.id !== holidayId);
    });
}

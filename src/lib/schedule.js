import { addDays, isWeekend } from "@/lib/dates.ts";
function holidaySet(holidays) {
    return new Set(holidays);
}
export function isWorkingDay(iso, holidays) {
    return !isWeekend(iso) && !holidaySet(holidays).has(iso);
}
export function factoryCapacity(lines) {
    return lines
        .filter((line) => line.status === "AVAILABLE" || line.status === "RUNNING")
        .reduce((sum, line) => sum + line.dailyCapacity, 0);
}
const occupyingStatus = ["WAITING", "CONFIRMED", "IN_PRODUCTION", "ON_HOLD"];
export function occupiesFactory(status) {
    return occupyingStatus.includes(status);
}
export function occupiedOn(iso, orders, ignoreOrderId) {
    return orders
        .filter((order) => order.id !== ignoreOrderId && occupiesFactory(order.status))
        .reduce((sum, order) => {
        const slot = order.allocations.find((item) => item.date === iso);
        return sum + (slot?.quantity ?? 0);
    }, 0);
}
export function mergeAllocations(slots) {
    const daily = new Map();
    slots.forEach((slot) => {
        if (slot.quantity <= 0)
            return;
        daily.set(slot.date, (daily.get(slot.date) ?? 0) + slot.quantity);
    });
    return [...daily.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([date, quantity]) => ({ date, quantity }));
}
export function packJobs(jobs, fromDate, lines, holidays, occupying) {
    const placed = occupying.map((order) => ({
        id: order.id,
        status: order.status,
        allocations: order.allocations.map((slot) => ({ ...slot })),
    }));
    const results = new Map();
    for (const job of jobs) {
        if (job.quantity <= 0)
            continue;
        const start = job.notBefore && job.notBefore > fromDate ? job.notBefore : fromDate;
        const result = scheduleQuantity(job.quantity, start, lines, holidays, placed, job.id);
        results.set(job.id, result);
        placed.push({ id: job.id, status: "CONFIRMED", allocations: result.allocations });
    }
    return results;
}
export function addWorkingDays(iso, count, holidays) {
    let cursor = iso;
    let left = count;
    let guard = 0;
    while (left > 0 && guard < 400) {
        cursor = addDays(cursor, 1);
        if (isWorkingDay(cursor, holidays))
            left -= 1;
        guard += 1;
    }
    return cursor;
}
export function capacityUntil(dueDate, fromDate, lines, holidays, orders) {
    const daily = factoryCapacity(lines);
    let total = 0;
    let available = 0;
    let lastProductionDate = null;
    for (let cursor = fromDate, guard = 0; cursor <= dueDate && guard < 400; cursor = addDays(cursor, 1), guard += 1) {
        if (!isWorkingDay(cursor, holidays) || addWorkingDays(cursor, 2, holidays) > dueDate)
            continue;
        total += daily;
        available += Math.max(0, daily - occupiedOn(cursor, orders));
        lastProductionDate = cursor;
    }
    return { total, available, lastProductionDate };
}
export function scheduleQuantity(quantity, fromDate, lines, holidays, orders, ignoreOrderId) {
    if (quantity <= 0)
        throw new Error("수량은 1개 이상이어야 합니다.");
    const daily = factoryCapacity(lines);
    if (daily <= 0)
        throw new Error("가동할 수 있는 라인이 없어 일정을 잡을 수 없습니다.");
    let cursor = fromDate;
    let plannedStart = "";
    let left = quantity;
    const allocations = [];
    let guard = 0;
    while (left > 0 && guard < 500) {
        if (isWorkingDay(cursor, holidays)) {
            const remaining = Math.max(0, daily - occupiedOn(cursor, orders, ignoreOrderId));
            if (!plannedStart) {
                if (remaining > 0)
                    plannedStart = cursor;
            }
            if (plannedStart && remaining > 0) {
                const take = Math.min(left, remaining);
                allocations.push({ date: cursor, quantity: take });
                left -= take;
            }
        }
        if (left > 0)
            cursor = addDays(cursor, 1);
        guard += 1;
    }
    if (!plannedStart || left > 0)
        throw new Error("가용 생산량 안에서 완료 예정일을 계산하지 못했습니다.");
    const plannedEndDate = allocations[allocations.length - 1]?.date ?? plannedStart;
    return {
        plannedStartDate: plannedStart,
        plannedEndDate,
        earliestDueDate: addWorkingDays(plannedEndDate, 2, holidays),
        allocations,
    };
}
export function allocateProductItems(lines, quantities, reserved = []) {
    const remaining = lines.map((line) => ({ productId: line.productId, quantity: line.quantity }));
    for (const item of reserved) {
        const row = remaining.find((line) => line.productId === item.productId);
        if (row)
            row.quantity = Math.max(0, row.quantity - item.quantity);
    }
    return quantities.map((quantity) => {
        const items = [];
        let left = quantity;
        for (const row of remaining) {
            if (left <= 0)
                break;
            const take = Math.min(left, row.quantity);
            if (take <= 0)
                continue;
            items.push({ productId: row.productId, quantity: take });
            row.quantity -= take;
            left -= take;
        }
        return items;
    });
}
export function usableLines(lines) {
    return lines.filter((line) => line.status === "AVAILABLE" || line.status === "RUNNING");
}
function lineOf(lines, lineId) {
    return lineId ? lines.find((line) => line.id === lineId) : undefined;
}
export function quantityOnDate(workOrder, iso, lines, holidays) {
    if (workOrder.status === "CANCELLED" || workOrder.quantity <= 0)
        return 0;
    if (workOrder.allocations?.length) {
        return workOrder.allocations.find((slot) => slot.date === iso)?.quantity ?? 0;
    }
    const line = lineOf(lines, workOrder.lineId);
    if (!line || iso < workOrder.plannedStartDate || iso > workOrder.plannedEndDate || !isWorkingDay(iso, holidays))
        return 0;
    let left = workOrder.quantity;
    for (let cursor = workOrder.plannedStartDate; cursor <= workOrder.plannedEndDate; cursor = addDays(cursor, 1)) {
        if (!isWorkingDay(cursor, holidays))
            continue;
        const take = Math.min(left, line.dailyCapacity);
        if (cursor === iso)
            return take;
        left -= take;
        if (left <= 0)
            return 0;
    }
    return 0;
}
export function lineOccupiedOn(iso, lineId, workOrders, lines, holidays) {
    return workOrders
        .filter((item) => item.lineId === lineId && item.status !== "CANCELLED")
        .reduce((sum, item) => sum + quantityOnDate(item, iso, lines, holidays), 0);
}
function leftoverAllocations(allocations, locked, lines, holidays) {
    return allocations
        .map((slot) => {
        const used = locked.reduce((sum, item) => sum + quantityOnDate(item, slot.date, lines, holidays), 0);
        return { date: slot.date, quantity: Math.max(0, slot.quantity - used) };
    })
        .filter((slot) => slot.quantity > 0);
}
function trimAllocations(allocations, quantity) {
    let left = quantity;
    const next = [];
    for (const slot of allocations) {
        if (left <= 0)
            break;
        const take = Math.min(left, slot.quantity);
        next.push({ date: slot.date, quantity: take });
        left -= take;
    }
    if (left > 0)
        throw new Error("남은 일정에 작업지시 수량을 나누지 못했습니다.");
    return next;
}
export function splitQuantityByLines(allocations, quantity, lines, holidays, occupying, locked = []) {
    if (quantity <= 0)
        return [];
    const pool = usableLines(lines);
    if (pool.length === 0)
        throw new Error("가동할 수 있는 라인이 없어 작업지시를 나눌 수 없습니다.");
    const days = trimAllocations(leftoverAllocations(allocations, locked, lines, holidays), quantity);
    const byLine = new Map();
    for (const slot of days) {
        let left = slot.quantity;
        const ranked = [...pool].sort((leftLine, rightLine) => {
            const leftFree = Math.max(0, leftLine.dailyCapacity - lineOccupiedOn(slot.date, leftLine.id, occupying, lines, holidays));
            const rightFree = Math.max(0, rightLine.dailyCapacity - lineOccupiedOn(slot.date, rightLine.id, occupying, lines, holidays));
            return rightFree - leftFree || leftLine.name.localeCompare(rightLine.name, "ko");
        });
        for (const line of ranked) {
            if (left <= 0)
                break;
            const occupied = lineOccupiedOn(slot.date, line.id, occupying, lines, holidays);
            const take = Math.min(left, Math.max(0, line.dailyCapacity - occupied));
            if (take <= 0)
                continue;
            const current = byLine.get(line.id);
            if (current) {
                current.quantity += take;
                current.plannedEndDate = slot.date;
                current.allocations.push({ date: slot.date, quantity: take });
            }
            else {
                byLine.set(line.id, {
                    lineId: line.id,
                    quantity: take,
                    plannedStartDate: slot.date,
                    plannedEndDate: slot.date,
                    allocations: [{ date: slot.date, quantity: take }],
                });
            }
            occupying = [
                ...occupying,
                {
                    id: `split-${line.id}-${slot.date}`,
                    orderId: "",
                    status: "READY",
                    assigneeId: null,
                    lineId: line.id,
                    quantity: take,
                    allocations: [{ date: slot.date, quantity: take }],
                    items: [],
                    issuedAt: "",
                    plannedStartDate: slot.date,
                    plannedEndDate: slot.date,
                    startedAt: null,
                    completedAt: null,
                },
            ];
            left -= take;
        }
        if (left > 0)
            throw new Error("라인별 남은 용량으로 작업지시를 나누지 못했습니다.");
    }
    return [...byLine.values()];
}

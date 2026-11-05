export function todayISO() {
    return toISO(new Date());
}
export function toISO(date) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}
export function parseISO(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
}
export function addDays(iso, days) {
    const date = parseISO(iso);
    date.setDate(date.getDate() + days);
    return toISO(date);
}
export function isWeekend(iso) {
    const day = parseISO(iso).getDay();
    return day === 0 || day === 6;
}
export function localDate(stamp) {
    return toISO(new Date(stamp));
}
export function localDateTime(stamp) {
    const date = new Date(stamp);
    return `${toISO(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function nowStamp() {
    return new Date().toISOString();
}

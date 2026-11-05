export function lineAmount(line) {
    const base = line.quantity * line.unitPrice;
    return line.vatIncluded ? base : Math.round(base * 1.1);
}
export function orderTotal(lines) {
    return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}
export function orderQuantity(lines) {
    return lines.reduce((sum, line) => sum + line.quantity, 0);
}
export function depositTarget(total) {
    return Math.round(total * 0.5);
}
export function paymentStatusOf(paid, total) {
    if (total <= 0 || paid <= 0)
        return "UNPAID";
    if (paid >= total)
        return "PAID";
    if (paid >= depositTarget(total))
        return "PARTIAL";
    return "UNPAID";
}
export function formatWon(amount) {
    return `${amount.toLocaleString("ko-KR")}원`;
}
export function digitsOnly(value) {
    return value.replace(/\D/g, "");
}
export function productKey(productName, modelName) {
    const collapse = (value) => value.replace(/\s+/g, " ").trim().toLowerCase();
    return `${collapse(productName)}|${collapse(modelName)}`;
}

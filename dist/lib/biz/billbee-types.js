/**
 * Billbee API Types
 * Full coverage from TigerV0 integrations
 */
// ============================================================================
// Order States
// ============================================================================
export const OrderState = {
    Ordered: 1,
    Confirmed: 2,
    Paid: 3,
    Shipped: 4,
    ReclamationOrReturn: 5,
    Deleted: 6,
    Completed: 7,
    Cancelled: 8,
    Archived: 9,
    NotUsed: 10,
    Demanded: 11,
    PackingStarted: 12,
    Ready: 13,
    Clarification: 14,
    Warning: 15,
};
export const OrderStateLabels = {
    1: 'ordered',
    2: 'confirmed',
    3: 'paid',
    4: 'shipped',
    5: 'return',
    6: 'deleted',
    7: 'completed',
    8: 'cancelled',
    9: 'archived',
    10: 'not_used',
    11: 'demanded',
    12: 'packing',
    13: 'ready',
    14: 'clarification',
    15: 'warning',
};
